// ─── Z-Library Direct Download Extension v2.1.0 ──────────────────
//
// Native Z-Library extension. Uses cinder.fetchBrowser (real WebView)
// to load Z-Library pages, which passes Cloudflare challenges and 
// establishes shared cookies. Since WebView has sharedCookiesEnabled,
// the native downloader automatically inherits those cookies when
// fetching the /dl/ link from the same domain.
//
// KEY INSIGHT: The WebView's cookies are shared with the native HTTP
// layer. By browsing Z-Library in the WebView first, we establish the
// session cookies needed for the download to succeed.

__cinderExport = {
	id: "zlibrary-direct",
	name: "Z-Library (Direct)",
	version: "2.2.9",
	icon: "📖",
	description: "Native Z-Library downloader. Uses WebView session for Cloudflare bypass.",
	contentType: "books",
	contentTypes: ["ebook"],
	excludeFromDefaultMetadataProviders: true,

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
					{ label: "singlelogin.re", value: "singlelogin.re" }
				],
			}
		];
	},

	// ── Internals ──

	_DOMAINS: ["zlib.li", "z-lib.gs", "z-library.rs", "singlelogin.re"],

	_isIntermediateUrl: function(url) {
		if (!url) return true;
		try {
			var parsed = new URL(url);
			var path = (parsed.pathname || "").toLowerCase();
			return path.indexOf("/dl/") !== -1 || path.indexOf("/book/") !== -1 || path.indexOf("/s/") !== -1;
		} catch (err) {
			var lower = String(url).toLowerCase();
			return lower.indexOf("/dl/") !== -1 || lower.indexOf("/book/") !== -1 || lower.indexOf("/s/") !== -1;
		}
	},

	// Use fetchBrowser (WebView) for ALL Z-Library requests.
	// This ensures Cloudflare is bypassed and session cookies are established
	// in the shared cookie jar before we attempt to download.
	_fetchZlib: async function(path) {
		var pref = await cinder.store.get("preferred_domain");
		var domains = this._DOMAINS.slice();
		if (pref) {
			domains = domains.filter(function(d) { return d !== pref; });
			domains.unshift(pref);
		}
		for (var i = 0; i < domains.length; i++) {
			var url = "https://" + domains[i] + path;
			try {
				// fetchBrowser = real WebView with JS execution + Cloudflare bypass
				// This also sets sharedCookies that expo-file-system will use
				var resp = await cinder.fetchBrowser(url);
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					return { data: resp.data, baseUrl: "https://" + domains[i], domain: domains[i] };
				}
			} catch (err) {
				cinder.warn("[Z-Lib] Mirror " + domains[i] + " failed: " + err);
			}
		}
		throw new Error("Z-Library mirrors are currently unreachable.");
	},

	// ── Search ──

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

	// ── Resolve ──

	resolve: async function(item) {
		cinder.log("[Z-Lib] Resolving: " + item.title);

		// Step 1: Load the book detail page via WebView (fetchBrowser).
		// This is CRITICAL - the WebView will:
		//   a) Execute Cloudflare challenge JavaScript
		//   b) Store the resulting cookies in the shared cookie jar
		//   c) Return the fully rendered HTML with the download link
		cinder.log("[Z-Lib] Loading detail page via WebView: " + item.url);
		var resp = await cinder.fetchBrowser(item.url);
		if (!resp.data || resp.data.length < 500) {
			throw new Error("Failed to load book page.");
		}

		var html = resp.data;
		var doc = cinder.parseHTML(html);
		var domain = item.url.match(/^https?:\/\/([^\/]+)/)[0];

		// Step 2: Extract the download link (the addDownloadedBook class or /dl/ path)
		var dlLink = null;
		
		// Method A: Look for the specific download button
		var dlEl = doc.querySelector("a.addDownloadedBook");
		if (dlEl) {
			dlLink = dlEl.attr("href");
			cinder.log("[Z-Lib] Found addDownloadedBook link: " + dlLink);
		}
		
		// Method B: Find any /dl/ link
		if (!dlLink) {
			var allLinks = doc.querySelectorAll("a[href]");
			for (var i = 0; i < allLinks.length; i++) {
				var href = allLinks[i].attr("href");
				if (href && href.indexOf("/dl/") !== -1) {
					// Skip reader links
					var cls = allLinks[i].attr("class") || "";
					if (cls.indexOf("reader") === -1) {
						dlLink = href;
						cinder.log("[Z-Lib] Found /dl/ link: " + dlLink);
						break;
					}
				}
			}
		}

		// Method C: Regex fallback on raw HTML
		if (!dlLink) {
			var dlMatch = html.match(/href=["'](\/dl\/[A-Za-z0-9]+)["']/);
			if (dlMatch) {
				dlLink = dlMatch[1];
				cinder.log("[Z-Lib] Found /dl/ link via regex: " + dlLink);
			}
		}

		if (!dlLink) {
			throw new Error("No download link found on the book page.");
		}

		// Make it absolute
		if (dlLink.indexOf("/") === 0) {
			dlLink = domain + dlLink;
		}

		// Check if the detail page shows a daily limit warning
		var dailyLimitHit = html.indexOf("Daily limit") !== -1 || html.indexOf("daily limit") !== -1;

		if (dailyLimitHit) {
			throw new Error("Z-Library reported a daily download limit on the book page.");
		}

										// Download through the WebView browser engine so we can capture native
		// download responses or browser-context binary bytes before falling back.
		if (!dailyLimitHit) {
			cinder.log("[Z-Lib] Downloading file via WebView browser context: " + dlLink);
			try {
				var binResp = await cinder.fetchBrowserBinary(dlLink);
				if (binResp.status === 200 && binResp.data) {
					if (typeof binResp.data === "string" && binResp.data.indexOf("URL:") === 0) {
						var finalUrl = binResp.data.substring(4);
						if (this._isIntermediateUrl(finalUrl)) {
							cinder.warn("[Z-Lib] Native WebView download event returned intermediary URL: " + finalUrl);
						} else {
							cinder.log("[Z-Lib] SUCCESS: Got final download URL from WebView: " + finalUrl);
							return {
								url: finalUrl,
								fileName: item.title + "." + (item.format || "epub"),
								headers: {
									Referer: item.url
								}
							};
						}
					}
					if (binResp.data.length > 100) {
						var prefix = binResp.data.substring(0, 4);
						if (prefix === "UEsD" || prefix === "UEsF") {
							cinder.log("[Z-Lib] SUCCESS: Got EPUB via WebView (" + Math.round(binResp.data.length * 3/4/1024) + " KB)");
							return {
								url: "data:application/epub+zip;base64," + binResp.data,
								fileName: item.title + "." + (item.format || "epub")
							};
						}
						if (prefix === "JVBE") {
							cinder.log("[Z-Lib] SUCCESS: Got PDF via WebView (" + Math.round(binResp.data.length * 3/4/1024) + " KB)");
							return {
								url: "data:application/pdf;base64," + binResp.data,
								fileName: item.title + ".pdf"
							};
						}
						cinder.warn("[Z-Lib] WebView returned non-ebook data (prefix: " + prefix + "). Trying IPFS...");
					} else {
						cinder.warn("[Z-Lib] WebView binary fetch failed or was too short. Trying IPFS...");
					}
				} else {
					cinder.warn("[Z-Lib] WebView binary fetch failed. Trying IPFS...");
				}
			} catch (e) {
				var message = (e && e.message) ? e.message : String(e);
				if (message.toLowerCase().indexOf("daily download limit") !== -1 || message.toLowerCase().indexOf("daily limit") !== -1) {
					throw new Error(message);
				}
				cinder.warn("[Z-Lib] WebView binary fetch error: " + message + ". Trying IPFS...");
			}
		}

		// Step 4: IPFS fallback
		var fallbackUrls = [];
		var cids = [];
		var copyElements = doc.querySelectorAll("[data-copy]");
		for (var j = 0; j < copyElements.length; j++) {
			var cid = copyElements[j].attr("data-copy");
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
			var filename = encodeURIComponent(item.title + "." + item.format);
			fallbackUrls.push("https://gateway.pinata.cloud/ipfs/" + selectedCid + "?filename=" + filename);
			fallbackUrls.push("https://cloudflare-ipfs.com/ipfs/" + selectedCid + "?filename=" + filename);
			fallbackUrls.push("https://ipfs.io/ipfs/" + selectedCid + "?filename=" + filename);
		}

		if (fallbackUrls.length === 0) {
			if (dailyLimitHit) {
				throw new Error("Z-Library daily download limit reached and no IPFS fallback available. Try again later or use a VPN.");
			}
			throw new Error("Download failed. The file could not be fetched from Z-Library or IPFS.");
		}

		cinder.log("[Z-Lib] Using IPFS fallback. " + fallbackUrls.length + " URLs available.");
		return {
			url: fallbackUrls[0],
			fallbackUrls: fallbackUrls.slice(1)
		};
	}
};











