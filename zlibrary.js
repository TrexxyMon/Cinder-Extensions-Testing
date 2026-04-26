// ─── Z-Library Direct Download Extension v1.0.0 ──────────────────
//
// Integrated Z-Library scraper with dynamic IP spoofing and domain fallbacks.
// Bypasses download limits by rotating X-Forwarded-For headers via WebView.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "1.0.0",
	icon: "📖",
	description: "Direct downloads from Z-Library mirrors with IP rotation and Cloudflare bypass.",
	contentType: "books",

	capabilities: {
		search: true,
		discover: false,
		download: false,
		resolve: true,
		searchDownloads: true,
		manga: false,
	},

	getSettings: function() {
		return [
			{
				id: "preferred_domain",
				label: "Preferred Domain",
				type: "select",
				defaultValue: "zlib.li",
				options: [
					{ label: "zlib.li", value: "zlib.li" },
					{ label: "z-lib.gs", value: "z-lib.gs" },
					{ label: "z-library.rs", value: "z-library.rs" },
					{ label: "singlelogin.re", value: "singlelogin.re" },
				],
			},
			{
				id: "enable_ip_spoofing",
				label: "IP Spoofing (Bypass Limits)",
				type: "toggle",
				defaultValue: true,
			}
		];
	},

	// ── Internals ──

	_DOMAINS: [
		"zlib.li",
		"z-lib.gs",
		"z-library.rs",
		"singlelogin.re",
		"singlelogin.rs",
		"1lib.sk"
	],

	_getRandomIP: function() {
		return Math.floor(Math.random() * 255) + "." +
			   Math.floor(Math.random() * 255) + "." +
			   Math.floor(Math.random() * 255) + "." +
			   Math.floor(Math.random() * 255);
	},

	_getHeaders: async function() {
		var headers = {
			"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		};
		
		var spoof = await cinder.store.get("enable_ip_spoofing");
		if (spoof !== "false") {
			var ip = this._getRandomIP();
			headers["X-Forwarded-For"] = ip;
			headers["X-Real-IP"] = ip;
		}
		
		return headers;
	},

	_fetchWithFallback: async function(path) {
		var pref = await cinder.store.get("preferred_domain");
		var domains = this._DOMAINS.slice();

		if (pref) {
			domains = domains.filter(function(d) { return d !== pref; });
			domains.unshift(pref);
		}

		var lastErr = null;
		var headers = await this._getHeaders();

		for (var i = 0; i < domains.length; i++) {
			var url = "https://" + domains[i] + path;
			try {
				cinder.log("[Z-Lib] Trying: " + url);
				// Always use fetchBrowser for Z-Lib mirrors as they usually have CF/Bot protection
				var resp = await cinder.fetchBrowser(url, { headers: headers });
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					return { data: resp.data, baseUrl: "https://" + domains[i] };
				}
				cinder.warn("[Z-Lib] " + domains[i] + " returned status " + resp.status);
			} catch (err) {
				cinder.warn("[Z-Lib] " + domains[i] + " failed: " + err);
				lastErr = err;
			}
		}
		throw lastErr || new Error("All Z-Library domains failed.");
	},

	// ── Search ──

	search: async function(query, page) {
		if (!page) page = 0;
		// Z-Lib usually uses /s/query or /search?q=query
		// We'll use /s/ format with EPUB filter (?e=1 or similar if supported by mirror)
		var searchPath = "/s/" + encodeURIComponent(query) + "?e=1";
		if (page > 0) searchPath += "&page=" + (page + 1);

		var result = await this._fetchWithFallback(searchPath);
		var doc = cinder.parseHTML(result.data);
		var items = doc.querySelectorAll("table.resItemTable, div.resItemBox, .bookRow");
		
		var results = [];
		for (var i = 0; i < items.length; i++) {
			try {
				var item = items[i];
				var titleLink = item.querySelector("h3[itemprop='name'] a, a[href^='/book/']");
				if (!titleLink) continue;

				var title = titleLink.text().trim();
				var url = titleLink.attr("href");
				if (!url) continue;

				// Make URL absolute if needed
				if (url.indexOf("/") === 0) url = result.baseUrl + url;

				var author = "";
				var authorEl = item.querySelector("div.authors a, .authors");
				if (authorEl) author = authorEl.text().trim();

				var format = "epub";
				var size = "";
				var metaEl = item.querySelector(".bookProperty.property__file, .property_value");
				if (metaEl) {
					var metaText = metaEl.text().trim();
					// Often "epub, 2.5 MB"
					var parts = metaText.split(",");
					if (parts.length > 0) format = parts[0].trim().toLowerCase();
					if (parts.length > 1) size = parts[1].trim();
				}

				var coverEl = item.querySelector("img.cover, img[itemprop='image']");
				var cover = coverEl ? coverEl.attr("src") : "";

				results.push({
					id: url,
					title: title,
					author: author,
					cover: cover,
					format: format,
					size: size,
					url: url,
					source: "Z-Library"
				});
			} catch (err) {
				cinder.warn("[Z-Lib] Parse error for item " + i + ": " + err);
			}
		}

		return results;
	},

	// ── Resolve ──

	resolve: async function(item) {
		var detailUrl = item.url;
		cinder.log("[Z-Lib] Resolving detail page: " + detailUrl);

		var headers = await this._getHeaders();
		var resp = await cinder.fetchBrowser(detailUrl, { headers: headers });
		
		if (!resp.data) throw new Error("Failed to load detail page.");

		var doc = cinder.parseHTML(resp.data);
		// Look for download buttons
		var dlLink = doc.querySelector("a.addDownloadedBook, a.dlButton, a[href^='/dl/'], a.btn-primary");
		
		if (!dlLink) {
			// Try regex if DOM fails
			var match = resp.data.match(/href="(\/dl\/[^"]+)"/);
			if (match) {
				var url = match[1];
				if (url.indexOf("/") === 0) {
					var domain = detailUrl.match(/^https?:\/\/[^\/]+/)[0];
					url = domain + url;
				}
				return { 
					url: url,
					headers: headers
				};
			}
			throw new Error("Download link not found on page.");
		}

		var finalUrl = dlLink.attr("href");
		if (finalUrl.indexOf("/") === 0) {
			var domain = detailUrl.match(/^https?:\/\/[^\/]+/)[0];
			finalUrl = domain + finalUrl;
		}

		cinder.log("[Z-Lib] Resolved download URL: " + finalUrl);
		return {
			url: finalUrl,
			headers: headers
		};
	}
};
