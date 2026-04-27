// ─── Z-Library Direct Download Extension v1.9.0 ──────────────────
//
// Integrated Z-Library scraper with IPFS and TorBox support.
// v1.9.0: Implements TorBox WebDL integration to bypass guest limits.
// Also includes robust IPFS extraction for non-TorBox users.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "1.9.0",
	icon: "📖",
	description: "Advanced Z-Library scraper with IPFS bypass and TorBox support.",
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
				id: "torbox_api_key",
				label: "TorBox API Key (Optional)",
				type: "text",
				defaultValue: "",
				description: "Used to bypass guest limits via TorBox WebDL."
			},
			{
				id: "priority_source",
				label: "Priority Source",
				type: "select",
				defaultValue: "mirror",
				options: [
					{ label: "Direct Mirror (Fastest)", value: "mirror" },
					{ label: "IPFS Bypass (Reliable)", value: "ipfs" }
				],
			},
			{
				id: "ipfs_gateway",
				label: "IPFS Gateway",
				type: "select",
				defaultValue: "gateway.pinata.cloud",
				options: [
					{ label: "gateway.pinata.cloud", value: "gateway.pinata.cloud" },
					{ label: "cloudflare-ipfs.com", value: "cloudflare-ipfs.com" },
					{ label: "ipfs.io", value: "ipfs.io" },
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
		"singlelogin.re"
	],

	_getHeaders: async function(refererUrl) {
		var headers = {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			"Accept-Language": "en-US,en;q=0.9",
			"Sec-Fetch-Site": "same-origin",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-User": "?1",
			"Sec-Fetch-Dest": "document",
			"Upgrade-Insecure-Requests": "1"
		};
		if (refererUrl) headers["Referer"] = refererUrl;
		
		// IP Spoofing
		var ip = Math.floor(Math.random() * 255) + "." +
			     Math.floor(Math.random() * 255) + "." +
			     Math.floor(Math.random() * 255) + "." +
			     Math.floor(Math.random() * 255);
		headers["X-Forwarded-For"] = ip;
		return headers;
	},

	_fetchWithFallback: async function(path) {
		var pref = await cinder.store.get("preferred_domain");
		var domains = this._DOMAINS.slice();
		if (pref) {
			domains = domains.filter(function(d) { return d !== pref; });
			domains.unshift(pref);
		}
		for (var i = 0; i < domains.length; i++) {
			var url = "https://" + domains[i] + path;
			try {
				var headers = await this._getHeaders(url);
				var resp = await cinder.fetchBrowser(url, { headers: headers });
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					return { data: resp.data, baseUrl: "https://" + domains[i] };
				}
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
				var title = card.querySelector("[slot='title']").text().trim();
				var author = card.querySelector("[slot='author']").text().trim();
				var url = card.attr("href");
				if (url.indexOf("/") === 0) url = result.baseUrl + url;
				results.push({
					id: card.attr("id"),
					title: title,
					author: author,
					cover: result.baseUrl + card.querySelector("img").attr("data-src"),
					format: (card.attr("extension") || "epub").toLowerCase(),
					size: card.attr("filesize") || "",
					url: url,
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

		// 1. Check for TorBox Integration
		var tbKey = await cinder.store.get("torbox_api_key");
		var dlLink = doc.querySelector("a.addDownloadedBook, a[href^='/dl/']");
		var mirrorUrl = null;
		if (dlLink) {
			mirrorUrl = dlLink.attr("href");
			if (mirrorUrl.indexOf("/") === 0) {
				mirrorUrl = item.url.match(/^https?:\/\/[^\/]+/)[0] + mirrorUrl;
			}
		}

		if (tbKey && mirrorUrl) {
			cinder.log("[Z-Lib] Using TorBox WebDL to proxy download...");
			try {
				var tbResp = await cinder.fetchBrowser("https://api.torbox.app/v1/api/webdl", {
					method: "POST",
					headers: { "Authorization": "Bearer " + tbKey, "Content-Type": "application/json" },
					body: JSON.stringify({ link: mirrorUrl, type: "webdl" })
				});
				var tbData = JSON.parse(tbResp.data);
				if (tbData.success && tbData.data && tbData.data.download_url) {
					cinder.log("[Z-Lib] TorBox Proxied: " + tbData.data.download_url);
					return { url: tbData.data.download_url };
				}
			} catch (e) {
				cinder.warn("[Z-Lib] TorBox WebDL failed, falling back...");
			}
		}

		// 2. IPFS Extraction (The most robust non-proxied method)
		var gateway = (await cinder.store.get("ipfs_gateway")) || "gateway.pinata.cloud";
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

		// 3. Last Resort: Direct Mirror (likely HTML limit page if you see Litera)
		if (mirrorUrl) {
			cinder.log("[Z-Lib] Using Direct Mirror (Caution: limit may be active): " + mirrorUrl);
			return { url: mirrorUrl, headers: headers };
		}

		throw new Error("No guest-accessible download or IPFS CID found.");
	}
};
