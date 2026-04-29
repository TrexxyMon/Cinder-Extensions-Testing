// ─── Z-Library Direct Download Extension v2.0.0 ──────────────────
//
// Uses Z-Library for search (excellent catalog) and LibGen as the
// download backend. Z-Library blocks guest downloads with Cloudflare
// and daily limits, returning HTML pages instead of files. LibGen
// mirrors the same content without these restrictions.
//
// Flow: Z-Lib Search → Z-Lib Detail → LibGen lookup by title → Download

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "2.0.0",
	icon: "📖",
	description: "Z-Library search with LibGen download backend. No account required.",
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
				id: "libgen_domain",
				label: "LibGen Mirror",
				type: "select",
				defaultValue: "libgen.li",
				options: [
					{ label: "libgen.li (Primary)", value: "libgen.li" },
					{ label: "libgen.rs", value: "libgen.rs" },
					{ label: "libgen.is", value: "libgen.is" },
					{ label: "libgen.st", value: "libgen.st" }
				],
			}
		];
	},

	// ── Internals ──

	_ZLIB_DOMAINS: ["zlib.li", "z-lib.gs", "z-library.rs", "singlelogin.re"],

	_getHeaders: function() {
		return {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9"
		};
	},

	_fetchZlib: async function(path) {
		var headers = this._getHeaders();
		for (var i = 0; i < this._ZLIB_DOMAINS.length; i++) {
			var url = "https://" + this._ZLIB_DOMAINS[i] + path;
			try {
				var resp = await cinder.fetchBrowser(url, { headers: headers });
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					return { data: resp.data, baseUrl: "https://" + this._ZLIB_DOMAINS[i] };
				}
			} catch (err) {}
		}
		throw new Error("Z-Library mirrors are currently unreachable.");
	},

	_fetchLibgen: async function(path, domain) {
		var headers = this._getHeaders();
		var url = "https://" + domain + path;
		cinder.log("[Z-Lib] Fetching LibGen: " + url);
		var resp = await cinder.fetchBrowser(url, { headers: headers });
		if (resp.status === 200 && resp.data) return resp.data;
		throw new Error("LibGen request failed: HTTP " + resp.status);
	},

	// ── Search (Z-Library) ──

	search: async function(query, page) {
		if (!page) page = 0;
		var searchPath = "/s/" + encodeURIComponent(query);
		if (page > 0) searchPath += "?page=" + (page + 1);
		var result = await this._fetchZlib(searchPath);
		var doc = cinder.parseHTML(result.data);
		var cards = doc.querySelectorAll("z-bookcard");
		var results = [];
		for (var i = 0; i < cards.length; i++) {
			try {
				var card = cards[i];
				var imgEl = card.querySelector("img");
				var coverSrc = imgEl ? (imgEl.attr("data-src") || imgEl.attr("src") || "") : "";
				if (coverSrc && coverSrc.indexOf("/") === 0) coverSrc = result.baseUrl + coverSrc;
				var bookUrl = card.attr("href") || "";
				if (bookUrl.indexOf("/") === 0) bookUrl = result.baseUrl + bookUrl;
				results.push({
					id: card.attr("id") || bookUrl,
					title: card.querySelector("[slot='title']").text().trim(),
					author: card.querySelector("[slot='author']").text().trim(),
					cover: coverSrc,
					format: (card.attr("extension") || "epub").toLowerCase(),
					size: card.attr("filesize") || "",
					url: bookUrl,
					source: "Z-Library"
				});
			} catch (err) {}
		}
		return results;
	},

	// ── Resolve (LibGen Backend) ──

	resolve: async function(item) {
		cinder.log("[Z-Lib] Resolving: " + item.title + " by " + item.author);

		var domain = (await cinder.store.get("libgen_domain")) || "libgen.li";
		var format = item.format || "epub";

		// Step 1: Search LibGen for the same book
		var searchQuery = encodeURIComponent(item.title + " " + (item.author || ""));
		var searchPath = "/index.php?req=" + searchQuery + "&res=25&columns[]=t&columns[]=a&columns[]=e";
		
		var searchHtml;
		try {
			searchHtml = await this._fetchLibgen(searchPath, domain);
		} catch (e) {
			cinder.warn("[Z-Lib] Primary LibGen mirror failed, trying fallbacks...");
			var fallbacks = ["libgen.li", "libgen.rs", "libgen.is", "libgen.st"];
			for (var f = 0; f < fallbacks.length; f++) {
				if (fallbacks[f] === domain) continue;
				try {
					searchHtml = await this._fetchLibgen(searchPath, fallbacks[f]);
					domain = fallbacks[f];
					break;
				} catch (e2) {}
			}
			if (!searchHtml) throw new Error("All LibGen mirrors are unreachable.");
		}

		// Step 2: Extract MD5 hashes from search results
		var md5Regex = /md5=([A-Fa-f0-9]{32})/gi;
		var md5Matches = [];
		var match;
		while ((match = md5Regex.exec(searchHtml)) !== null) {
			if (md5Matches.indexOf(match[1].toLowerCase()) === -1) {
				md5Matches.push(match[1].toLowerCase());
			}
		}

		if (md5Matches.length === 0) {
			throw new Error("Book not found on LibGen. Try searching with a shorter title.");
		}

		cinder.log("[Z-Lib] Found " + md5Matches.length + " LibGen results. Using first MD5: " + md5Matches[0]);

		// Step 3: Fetch the ads/download page to get the keyed download URL
		var md5 = md5Matches[0];
		var adsPath = "/ads.php?md5=" + md5;
		
		var adsHtml;
		try {
			adsHtml = await this._fetchLibgen(adsPath, domain);
		} catch (e) {
			cinder.warn("[Z-Lib] ads.php failed: " + e.message);
		}

		var downloadUrls = [];

		if (adsHtml) {
			// Extract the keyed download link: get.php?md5=...&key=...
			var keyMatch = adsHtml.match(/get\.php\?md5=[A-Fa-f0-9]{32}&(?:amp;)?key=([A-Z0-9]+)/i);
			if (keyMatch) {
				var keyedUrl = "https://" + domain + "/get.php?md5=" + md5 + "&key=" + keyMatch[1];
				cinder.log("[Z-Lib] Found keyed download URL: " + keyedUrl);
				downloadUrls.push(keyedUrl);
			}
		}

		// Step 4: Add fallback download URLs (keyless, may redirect)
		downloadUrls.push("https://" + domain + "/get.php?md5=" + md5);

		// Step 5: Also add IPFS CIDs from the Z-Library page if available
		try {
			var headers = this._getHeaders();
			var zlibResp = await cinder.fetchBrowser(item.url, { headers: headers });
			if (zlibResp.data) {
				var doc = cinder.parseHTML(zlibResp.data);
				var cids = [];
				var copyElements = doc.querySelectorAll("[data-copy]");
				for (var i = 0; i < copyElements.length; i++) {
					var cid = copyElements[i].attr("data-copy");
					if (cid && cid.length > 30) {
						if (cid.indexOf("Qm") === 0) cids.unshift(cid);
						else if (cid.indexOf("ba") === 0) cids.push(cid);
					}
				}
				if (cids.length > 0) {
					var selectedCid = cids.find(function(c) { return c.indexOf("Qm") === 0; }) || cids[0];
					var filename = encodeURIComponent(item.title + "." + format);
					downloadUrls.push("https://gateway.pinata.cloud/ipfs/" + selectedCid + "?filename=" + filename);
					downloadUrls.push("https://cloudflare-ipfs.com/ipfs/" + selectedCid + "?filename=" + filename);
					downloadUrls.push("https://ipfs.io/ipfs/" + selectedCid + "?filename=" + filename);
				}
			}
		} catch (e) {
			cinder.warn("[Z-Lib] IPFS extraction skipped: " + e.message);
		}

		cinder.log("[Z-Lib] Resolved " + downloadUrls.length + " download URLs. Primary: " + downloadUrls[0]);

		// Return URLs without custom headers so Cinder's DownloadManager 
		// will probe them and reject any HTML responses automatically.
		// Also provide debridLink so TorBox users get accelerated downloads.
		return {
			url: downloadUrls[0],
			fallbackUrls: downloadUrls.slice(1),
			debridLink: downloadUrls[0]
		};
	}
};
