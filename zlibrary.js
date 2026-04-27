// ─── Z-Library Direct Download Extension v1.9.1 ──────────────────
//
// Integrated Z-Library scraper with TorBox and IPFS.
// v1.9.1: Auto-pulls TorBox key from global settings and implements 
// immediate WebDL cleanup to preserve account limits.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "1.9.1",
	icon: "📖",
	description: "Advanced Z-Library scraper with TorBox and IPFS bypass.",
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
				label: "TorBox API Key (Manual Override)",
				type: "text",
				defaultValue: "",
				description: "Optional. If blank, the extension pulls from Cinder's global Debrid settings."
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

		// 1. TorBox Logic
		// Try to pull key from: 1. Extension Setting, 2. Global Debrid Setting
		var tbKey = (await cinder.store.get("torbox_api_key")) || (await cinder.store.get("cinder_debrid_apikey_torbox")) || (await cinder.store.get("debrid_torbox_key"));
		
		var dlLink = doc.querySelector("a.addDownloadedBook, a[href^='/dl/']");
		var mirrorUrl = null;
		if (dlLink) {
			mirrorUrl = dlLink.attr("href");
			if (mirrorUrl.indexOf("/") === 0) mirrorUrl = item.url.match(/^https?:\/\/[^\/]+/)[0] + mirrorUrl;
		}

		if (tbKey && mirrorUrl) {
			cinder.log("[Z-Lib] Attempting TorBox WebDL Proxy...");
			try {
				var tbResp = await cinder.fetchBrowser("https://api.torbox.app/v1/api/webdl", {
					method: "POST",
					headers: { "Authorization": "Bearer " + tbKey, "Content-Type": "application/json" },
					body: JSON.stringify({ link: mirrorUrl, type: "webdl" })
				});
				var tbData = JSON.parse(tbResp.data);
				if (tbData.success && tbData.data && tbData.data.download_url) {
					var finalUrl = tbData.data.download_url;
					var webdlId = tbData.data.id;
					
					// Immediate Cleanup: Delete the WebDL from TorBox since we have the URL
					if (webdlId) {
						cinder.log("[Z-Lib] TorBox success. Cleaning up WebDL ID: " + webdlId);
						cinder.fetchBrowser("https://api.torbox.app/v1/api/webdl?id=" + webdlId, {
							method: "DELETE",
							headers: { "Authorization": "Bearer " + tbKey }
						}).catch(function(){}); // Fire and forget
					}
					
					return { url: finalUrl };
				}
			} catch (e) {
				cinder.warn("[Z-Lib] TorBox failed: " + e.message + ". Falling back to IPFS...");
			}
		}

		// 2. IPFS Fallback
		cinder.log("[Z-Lib] Resolving via IPFS...");
		var gateway = (await cinder.store.get("ipfs_gateway")) || "gateway.pinata.cloud";
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
			var ipfsUrl = "https://" + gateway + "/ipfs/" + selectedCid + "?filename=" + encodeURIComponent(item.title + "." + item.format);
			return { url: ipfsUrl };
		}

		// 3. Mirror Fallback (Likely returns HTML if you see Litera)
		if (mirrorUrl) return { url: mirrorUrl, headers: headers };

		throw new Error("All download methods (TorBox, IPFS, Mirror) failed.");
	}
};
