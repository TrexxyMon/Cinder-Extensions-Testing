// ─── Z-Library Direct Download Extension v1.6.1 ──────────────────
//
// Integrated Z-Library scraper with IPFS CID extraction.
// Bypasses guest limits by resolving IPFS CIDs via gateways.
// v1.6.1: Improved link extraction for direct mirror links as requested.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "1.6.1",
	icon: "📖",
	description: "Advanced Z-Library scraper with IPFS bypass and direct reader support.",
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
				id: "ipfs_gateway",
				label: "IPFS Gateway",
				type: "select",
				defaultValue: "cloudflare-ipfs.com",
				options: [
					{ label: "cloudflare-ipfs.com", value: "cloudflare-ipfs.com" },
					{ label: "ipfs.io", value: "ipfs.io" },
					{ label: "dweb.link", value: "dweb.link" },
					{ label: "gateway.pinata.cloud", value: "gateway.pinata.cloud" },
				],
			}
		];
	},

	// ── Internals ──

	_DOMAINS: [
		"zlib.li",
		"z-lib.gs",
		"z-library.rs",
		"singlelogin.re",
		"singlelogin.rs"
	],

	_getHeaders: async function(url) {
		var headers = {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			"Accept-Language": "en-US,en;q=0.9",
			"Cache-Control": "no-cache",
			"Upgrade-Insecure-Requests": "1"
		};
		
		if (url) {
			try {
				var domainMatch = url.match(/^https?:\/\/[^\/]+/);
				if (domainMatch) {
					headers["Referer"] = domainMatch[0] + "/";
				}
			} catch (e) {}
		}
		
		// IP Spoofing
		var ip = Math.floor(Math.random() * 255) + "." +
			     Math.floor(Math.random() * 255) + "." +
			     Math.floor(Math.random() * 255) + "." +
			     Math.floor(Math.random() * 255);
		headers["X-Forwarded-For"] = ip;
		headers["X-Real-IP"] = ip;
		
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
		for (var i = 0; i < domains.length; i++) {
			var url = "https://" + domains[i] + path;
			try {
				var headers = await this._getHeaders(url);
				var resp = await cinder.fetchBrowser(url, { headers: headers });
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					if (resp.data.indexOf("No results found") !== -1 || resp.data.indexOf("Matching books not found") !== -1) {
						return { data: resp.data, baseUrl: "https://" + domains[i], empty: true };
					}
					return { data: resp.data, baseUrl: "https://" + domains[i] };
				}
			} catch (err) {
				cinder.warn("[Z-Lib] Mirror " + domains[i] + " failed: " + err);
				lastErr = err;
			}
		}
		throw lastErr || new Error("All Z-Library mirrors failed to respond.");
	},

	// ── Search ──

	search: async function(query, page) {
		if (!page) page = 0;
		cinder.log("[Z-Lib] Searching: " + query + " (Page " + (page + 1) + ")");

		var searchPath = "/s/" + encodeURIComponent(query);
		if (page > 0) searchPath += "?page=" + (page + 1);

		var result = null;
		try {
			result = await this._fetchWithFallback(searchPath);
		} catch (e) {
			cinder.error("[Z-Lib] Search failed: " + e);
			return [];
		}

		if (result.empty) return [];

		var doc = cinder.parseHTML(result.data);
		var cards = doc.querySelectorAll("z-bookcard");
		
		var results = [];
		for (var i = 0; i < cards.length; i++) {
			try {
				var card = cards[i];
				var titleEl = card.querySelector("[slot='title']");
				var authorEl = card.querySelector("[slot='author']");
				var imgEl = card.querySelector("img");
				
				var title = titleEl ? titleEl.text().trim() : "Unknown Title";
				var author = authorEl ? authorEl.text().trim() : "Unknown Author";
				var id = card.attr("id");
				var url = card.attr("href");
				var format = card.attr("extension") || "epub";
				var size = card.attr("filesize") || "";
				var cover = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "";

				if (!url) continue;
				if (url.indexOf("/") === 0) url = result.baseUrl + url;
				if (cover && cover.indexOf("/") === 0) cover = result.baseUrl + cover;

				results.push({
					id: id || url,
					title: title,
					author: author,
					cover: cover,
					format: format.toLowerCase(),
					size: size,
					url: url,
					source: "Z-Library"
				});
			} catch (err) {
				cinder.warn("[Z-Lib] Card parse error: " + err);
			}
		}

		return results;
	},

	// ── Resolve ──

	resolve: async function(item) {
		var detailUrl = item.url;
		cinder.log("[Z-Lib] Resolving: " + item.title + " (" + item.format + ")");

		var headers = await this._getHeaders(detailUrl);
		var resp = await cinder.fetchBrowser(detailUrl, { headers: headers });
		if (!resp.data) throw new Error("Failed to load book page.");

		var html = resp.data;
		var doc = cinder.parseHTML(html);
		
		// 1. Direct Mirror Link (The one from the source: btn-default addDownloadedBook)
		var dlLink = doc.querySelector("a.addDownloadedBook, a.dlButton, a[href^='/dl/']");
		if (dlLink) {
			var finalUrl = dlLink.attr("href");
			if (finalUrl && finalUrl.indexOf("/") === 0) {
				var domain = detailUrl.match(/^https?:\/\/[^\/]+/)[0];
				finalUrl = domain + finalUrl;
			}
			if (finalUrl) {
				cinder.log("[Z-Lib] Found direct mirror link: " + finalUrl);
				// We keep this as an option, but we will also look for IPFS
			}
		}

		// 2. IPFS Extraction
		var gateway = (await cinder.store.get("ipfs_gateway")) || "cloudflare-ipfs.com";
		var filename = encodeURIComponent(item.title + "." + item.format);

		var cids = [];
		var copyElements = doc.querySelectorAll("[data-copy]");
		for (var i = 0; i < copyElements.length; i++) {
			var cid = copyElements[i].attr("data-copy");
			if (cid && cid.length > 30) {
				if (cid.indexOf("Qm") === 0) cids.unshift(cid);
				else if (cid.indexOf("ba") === 0) cids.push(cid);
			}
		}

		if (cids.length === 0) {
			var regexMatch = html.match(/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z2-7]{57})/g);
			if (regexMatch) cids = regexMatch;
		}

		if (cids.length > 0) {
			var selectedCid = cids.find(function(c) { return c.indexOf("Qm") === 0; }) || cids[0];
			var ipfsUrl = "https://" + gateway + "/ipfs/" + selectedCid + "?filename=" + filename;
			cinder.log("[Z-Lib] Resolved IPFS: " + ipfsUrl);
			return { url: ipfsUrl };
		}

		// 3. Fallback to Mirror Link if IPFS failed
		if (dlLink && dlLink.attr("href")) {
			var finalUrl = dlLink.attr("href");
			if (finalUrl.indexOf("/") === 0) {
				var domain = detailUrl.match(/^https?:\/\/[^\/]+/)[0];
				finalUrl = domain + finalUrl;
			}
			return { url: finalUrl, headers: headers };
		}

		// 4. Reader Link (Streaming)
		var readerLink = doc.querySelector("a.reader-link");
		if (readerLink && readerLink.attr("href")) {
			return { url: readerLink.attr("href") };
		}

		throw new Error("No guest-accessible download or IPFS CID found.");
	}
};
