// ─── Z-Library Direct Download Extension v1.5.0 ──────────────────
//
// Integrated Z-Library scraper with IPFS CID extraction.
// Bypasses guest limits by resolving IPFS CIDs via gateways.
// Supports both downloading and direct reader streaming links.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "1.5.1",
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
				defaultValue: "ipfs.io",
				options: [
					{ label: "ipfs.io", value: "ipfs.io" },
					{ label: "cloudflare-ipfs.com", value: "cloudflare-ipfs.com" },
					{ label: "gateway.pinata.cloud", value: "gateway.pinata.cloud" },
					{ label: "dweb.link", value: "dweb.link" },
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
			"Cache-Control": "max-age=0",
			"Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
			"Sec-Ch-Ua-Mobile": "?0",
			"Sec-Ch-Ua-Platform": '"Windows"',
			"Upgrade-Insecure-Requests": "1"
		};
		
		if (url) {
			try {
				var domainMatch = url.match(/^https?:\/\/[^\/]+/);
				if (domainMatch) {
					headers["Referer"] = domainMatch[0] + "/";
					headers["Origin"] = domainMatch[0];
				}
			} catch (e) {}
		}
		
		// IP Spoofing (Randomize X-Forwarded-For)
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
		
		// Target the 2026 z-bookcard structure
		var cards = doc.querySelectorAll("z-bookcard");
		cinder.log("[Z-Lib] Found " + cards.length + " bookcards");
		
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
		
		// 1. Check for Reader Link (Streaming support)
		var readerLink = doc.querySelector("a.reader-link");
		if (readerLink) {
			var readerUrl = readerLink.attr("href");
			if (readerUrl) {
				cinder.log("[Z-Lib] Found Reader link: " + readerUrl);
				// If we have an IPFS link as well, prioritize it for download parity,
				// but we'll check for it first.
			}
		}

		// 2. IPFS Extraction (The most robust method for guests)
		// Pattern: Look for data-copy attributes or text patterns containing CIDs
		var gateway = (await cinder.store.get("ipfs_gateway")) || "ipfs.io";
		var filename = encodeURIComponent(item.title + "." + item.format);

		// A. Look for CID in elements (the "IPFS: CID" section)
		// Many mirrors use data-copy on the CID text
		var copyElements = doc.querySelectorAll("[data-copy]");
		for (var i = 0; i < copyElements.length; i++) {
			var cid = copyElements[i].attr("data-copy");
			// CIDs are usually 46 chars (Qm...) or 59 chars (ba...)
			if (cid && cid.length > 30 && (cid.indexOf("Qm") === 0 || cid.indexOf("ba") === 0)) {
				var ipfsUrl = "https://" + gateway + "/ipfs/" + cid + "?filename=" + filename;
				cinder.log("[Z-Lib] Resolved IPFS via data-copy: " + ipfsUrl);
				return { url: ipfsUrl };
			}
		}

		// B. Regex fallback on raw HTML for CID patterns
		var cidMatch = html.match(/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z2-7]{57})/g);
		if (cidMatch) {
			// Take the first valid CID found
			var cid = cidMatch[0];
			var ipfsUrl = "https://" + gateway + "/ipfs/" + cid + "?filename=" + filename;
			cinder.log("[Z-Lib] Resolved IPFS via Regex: " + ipfsUrl);
			return { url: ipfsUrl };
		}

		// 3. Fallback to Reader URL if it looks like a direct resource
		if (readerLink && readerLink.attr("href")) {
			return { url: readerLink.attr("href") };
		}

		// 4. Last Resort: The standard download link (likely triggers guest limit HTML)
		var dlLink = doc.querySelector("a.addDownloadedBook, a.dlButton, a[href^='/dl/']");
		if (dlLink) {
			var finalUrl = dlLink.attr("href");
			if (finalUrl.indexOf("/") === 0) {
				var domain = detailUrl.match(/^https?:\/\/[^\/]+/)[0];
				finalUrl = domain + finalUrl;
			}
			cinder.log("[Z-Lib] Fallback to direct DL link (Caution: may be HTML): " + finalUrl);
			return { url: finalUrl, headers: headers };
		}

		throw new Error("No guest-accessible download or IPFS CID found. This book may require a Z-Library account.");
	}
};
