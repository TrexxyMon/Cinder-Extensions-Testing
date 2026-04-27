// ─── Z-Library Direct Download Extension v1.2.1 ──────────────────
//
// Integrated Z-Library scraper with dynamic IP spoofing and domain fallbacks.
// Fixed tagName() property access bug.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "1.2.1",
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
			"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
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
				cinder.log("[Z-Lib] Trying domain: " + domains[i] + " (Attempt " + (i+1) + ")");
				
				var resp = await cinder.fetchBrowser(url, { headers: headers });
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					// Check if we hit a "No results found" or error page
					if (resp.data.indexOf("No results found") !== -1 || resp.data.indexOf("Matching books not found") !== -1) {
						cinder.log("[Z-Lib] Mirror returned 200 but zero results.");
						return { data: resp.data, baseUrl: "https://" + domains[i], empty: true };
					}
					return { data: resp.data, baseUrl: "https://" + domains[i] };
				}
				cinder.warn("[Z-Lib] " + domains[i] + " returned status " + resp.status + " or small data (" + (resp.data ? resp.data.length : 0) + " bytes)");
			} catch (err) {
				cinder.warn("[Z-Lib] Domain " + domains[i] + " failed: " + err);
				lastErr = err;
			}
		}
		throw lastErr || new Error("All Z-Library mirrors failed to respond.");
	},

	// ── Search ──

	search: async function(query, page) {
		if (!page) page = 0;
		cinder.log("[Z-Lib] Searching for: " + query + " (Page " + (page + 1) + ")");

		var searchPath = "/s/" + encodeURIComponent(query);
		if (page > 0) searchPath += "?page=" + (page + 1);

		var result = null;
		try {
			result = await this._fetchWithFallback(searchPath);
		} catch (e) {
			cinder.error("[Z-Lib] Search fetch failed: " + e);
			return [];
		}

		if (result.empty) return [];

		var doc = cinder.parseHTML(result.data);
		
		// Broaden selectors: z-bookcard is for modern mirrors like zlib.li
		var items = doc.querySelectorAll("z-bookcard, table.resItemTable, div.resItemBox, .bookRow, tr.bookRow");
		cinder.log("[Z-Lib] Found " + items.length + " potential items in HTML");
		
		var results = [];
		for (var i = 0; i < items.length; i++) {
			try {
				var item = items[i];
				var title = "";
				var author = "";
				var url = "";
				var format = "epub";
				var size = "";
				var cover = "";

				// Handle modern z-bookcard component
				// FIX: tagName is a property, not a function
				var tag = (item.tagName || "").toLowerCase();
				if (tag === "z-bookcard") {
					url = item.attr("href");
					format = item.attr("extension") || "epub";
					size = item.attr("filesize") || "";
					
					var titleEl = item.querySelector("[slot='title']");
					if (titleEl) title = titleEl.text().trim();
					
					var authorEl = item.querySelector("[slot='author']");
					if (authorEl) author = authorEl.text().trim();
					
					var imgEl = item.querySelector("img");
					if (imgEl) cover = imgEl.attr("data-src") || imgEl.attr("src") || "";
				} else {
					// Handle legacy table/div layouts
					var titleLink = item.querySelector(".itemTitle a, h3[itemprop='name'] a, a[href^='/book/'], .title a, a.resItemTitle");
					if (!titleLink) titleLink = item.querySelector("a[href*='/book/']");
					if (!titleLink) continue;

					title = titleLink.text().trim();
					url = titleLink.attr("href");
					
					var authorEl = item.querySelector("div.authors a, .authors, a[href^='/author/'], [itemprop='author']");
					if (authorEl) author = authorEl.text().trim();

					var metaEls = item.querySelectorAll(".bookProperty, .property_value, .file-info");
					for (var m = 0; m < metaEls.length; m++) {
						var mText = metaEls[m].text().toLowerCase();
						if (mText.indexOf("pdf") !== -1) format = "pdf";
						else if (mText.indexOf("epub") !== -1) format = "epub";
						
						var sizeMatch = mText.match(/(\d+\.?\d*\s*(?:mb|kb|gb|mib|kib))/i);
						if (sizeMatch) size = sizeMatch[1].toUpperCase();
					}

					var coverEl = item.querySelector("img.cover, img[itemprop='image'], .cover img");
					if (coverEl) cover = coverEl.attr("src") || "";
				}

				if (!url) continue;
				if (url.indexOf("/") === 0) url = result.baseUrl + url;
				if (cover && cover.indexOf("/") === 0) cover = result.baseUrl + cover;

				results.push({
					id: url,
					title: title,
					author: author,
					cover: cover,
					format: format.toLowerCase(),
					size: size,
					url: url,
					source: "Z-Library"
				});
			} catch (err) {
				cinder.warn("[Z-Lib] Parse error for item " + i + ": " + err);
			}
		}

		cinder.log("[Z-Lib] Returning " + results.length + " results");
		return results;
	},

	// ── Resolve ──

	resolve: async function(item) {
		var detailUrl = item.url;
		cinder.log("[Z-Lib] Resolving download for: " + item.title);

		var headers = await this._getHeaders();
		var resp = await cinder.fetchBrowser(detailUrl, { headers: headers });
		
		if (!resp.data) throw new Error("Failed to load detail page.");

		var doc = cinder.parseHTML(resp.data);
		
		// Look for download buttons with various patterns
		var dlLink = doc.querySelector("a.addDownloadedBook, a.dlButton, a[href^='/dl/'], a.btn-primary, .download-button a, .btn-download");
		
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
			throw new Error("Download button not found. You might need to log in on this mirror.");
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
