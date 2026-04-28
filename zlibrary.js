// ─── Z-Library Direct Download Extension v1.9.2 ──────────────────
//
// Integrated Z-Library scraper with TorBox Native support and IPFS.
// v1.9.2: 
// 1. Delegates TorBox WebDL entirely to Cinder's native DownloadManager 
//    so it can properly delete the WebDL *after* the file saves to disk.
// 2. Removes custom headers from the download response so Cinder's 
//    DownloadManager properly probes the URLs and rejects HTML limit pages.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "1.9.2",
	icon: "📖",
	description: "Z-Library scraper with native TorBox WebDL and multi-gateway IPFS bypass.",
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
				id: "priority_source",
				label: "Priority Source",
				type: "select",
				defaultValue: "ipfs",
				options: [
					{ label: "IPFS Bypass (Reliable - Default)", value: "ipfs" },
					{ label: "Direct Mirror (Fastest)", value: "mirror" }
				],
			}
		];
	},

	// ── Internals ──

	_DOMAINS: ["zlib.li", "z-lib.gs", "z-library.rs", "singlelogin.re"],

	_getHeaders: async function(refererUrl) {
		var headers = {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			"Accept-Language": "en-US,en;q=0.9",
			"Upgrade-Insecure-Requests": "1"
		};
		if (refererUrl) headers["Referer"] = refererUrl;
		var ip = Math.floor(Math.random() * 255) + "." + Math.floor(Math.random() * 255) + "." + Math.floor(Math.random() * 255) + "." + Math.floor(Math.random() * 255);
		headers["X-Forwarded-For"] = ip;
		return headers;
	},

	_fetchWithFallback: async function(path) {
		var pref = await cinder.store.get("preferred_domain");
		var domains = this._DOMAINS.slice();
		if (pref) { domains = domains.filter(function(d) { return d !== pref; }); domains.unshift(pref); }
		for (var i = 0; i < domains.length; i++) {
			var url = "https://" + domains[i] + path;
			try {
				var headers = await this._getHeaders(url);
				var resp = await cinder.fetchBrowser(url, { headers: headers });
				if (resp.status === 200 && resp.data && resp.data.length > 500) return { data: resp.data, baseUrl: "https://" + domains[i] };
			} catch (err) {}
		}
		throw new Error("Z-Library mirrors are currently unreachable.");
	},

	// ── Search ──

	search: async function(query, page) {
		if (!page) page = 0;
		var searchPath = "/s/" + encodeURIComponent(query);
		if (page > 0) searchPath += "?page=" + (page + 1);
		var result = await this._fetchWithFallback(searchPath);
		var doc = cinder.parseHTML(result.data);
		var cards = doc.querySelectorAll("z-bookcard");
		var results = [];
		for (var i = 0; i < cards.length; i++) {
			try {
				var card = cards[i];
				results.push({
					id: card.attr("id"),
					title: card.querySelector("[slot='title']").text().trim(),
					author: card.querySelector("[slot='author']").text().trim(),
					cover: result.baseUrl + card.querySelector("img").attr("data-src"),
					format: (card.attr("extension") || "epub").toLowerCase(),
					size: card.attr("filesize") || "",
					url: result.baseUrl + card.attr("href"),
					source: "Z-Library"
				});
			} catch (err) {}
		}
		return results;
	},

	// ── Resolve ──

	resolve: async function(item) {
		cinder.log("[Z-Lib] Resolving: " + item.title);
		var headers = await this._getHeaders(item.url);
		var resp = await cinder.fetchBrowser(item.url, { headers: headers });
		if (!resp.data) throw new Error("Failed to load book page.");

		var html = resp.data;
		var doc = cinder.parseHTML(html);

		// 1. Direct Mirror Link (Usually triggers HTML limits, but TorBox WebDL can bypass)
		var dlLink = doc.querySelector("a.addDownloadedBook, a[href^='/dl/']");
		var mirrorUrl = null;
		if (dlLink) {
			mirrorUrl = dlLink.attr("href");
			if (mirrorUrl.indexOf("/") === 0) mirrorUrl = item.url.match(/^https?:\/\/[^\/]+/)[0] + mirrorUrl;
		}

		// 2. IPFS Links (Most reliable direct download)
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

		var ipfsGateways = [
			"gateway.pinata.cloud",
			"cloudflare-ipfs.com",
			"ipfs.io",
			"dweb.link"
		];
		
		var fallbackUrls = [];
		if (cids.length > 0) {
			var selectedCid = cids.find(function(c) { return c.indexOf("Qm") === 0; }) || cids[0];
			var filename = encodeURIComponent(item.title + "." + item.format);
			for (var g = 0; g < ipfsGateways.length; g++) {
				fallbackUrls.push("https://" + ipfsGateways[g] + "/ipfs/" + selectedCid + "?filename=" + filename);
			}
		}

		var priority = (await cinder.store.get("priority_source")) || "ipfs";

		// 3. Delegate execution cleanly to Cinder's native DownloadManager.
		// By omitting 'headers', we force DownloadManager to PROBE the urls. 
		// If mirrorUrl returns HTML (limit reached/Cloudflare), Cinder will automatically reject it and try the IPFS fallbacks.
		// By providing debridLink, Cinder natively handles TorBox WebDL creation and deletion AFTER download.

		var finalUrls = [];
		if (priority === "ipfs" && fallbackUrls.length > 0) {
			finalUrls = fallbackUrls;
			if (mirrorUrl) finalUrls.push(mirrorUrl + "?slow_download=true"); // append param to force tier 2
		} else {
			if (mirrorUrl) finalUrls.push(mirrorUrl);
			if (fallbackUrls.length > 0) finalUrls = finalUrls.concat(fallbackUrls);
		}

		if (finalUrls.length === 0) {
			throw new Error("No guest-accessible download or IPFS CID found on page.");
		}

		cinder.log("[Z-Lib] Resolved endpoints. Primary: " + finalUrls[0]);

		return { 
			url: finalUrls[0], 
			fallbackUrls: finalUrls.slice(1),
			debridLink: mirrorUrl // Cinder securely maps this to TorBox WebDL if the user has TorBox enabled
		};
	}
};
