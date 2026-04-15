// ─── Anna's Archive Slow Download Extension ──────────────────
//
// Searches Anna's Archive and resolves free "slow download" links
// directly on the user's device. No VPS, no API key, no subscription.
//
// Strategy: Uses plain HTTP fetch first (fast, no ads). Falls back
// to browser-based fetch ONLY when Cloudflare blocks the request.

__cinderExport = {
	id: "annas-archive-slow",
	name: "Anna's Archive (Slow)",
	version: "1.3.0",
	icon: "📚",
	description: "Free slow downloads from Anna's Archive. No account or API key needed.",
	contentType: "books",

	capabilities: {
		search: true,           // Has search() method
		discover: false,
		download: false,
		resolve: true,          // Has resolve() for multi-step download
		searchDownloads: true,  // Shows in "Search Downloads" on book detail
		manga: false,
	},

	getSettings: function() {
		return [
			{
				id: "preferred_format",
				label: "Preferred Format",
				type: "select",
				defaultValue: "epub",
				options: [
					{ label: "EPUB", value: "epub" },
					{ label: "PDF", value: "pdf" },
					{ label: "Any", value: "" },
				],
			},
			{
				id: "preferred_domain",
				label: "Preferred Domain",
				type: "select",
				defaultValue: "annas-archive.gd",
				options: [
					{ label: "annas-archive.gd", value: "annas-archive.gd" },
					{ label: "annas-archive.gs", value: "annas-archive.gs" },
					{ label: "annas-archive.se", value: "annas-archive.se" },
					{ label: "annas-archive.li", value: "annas-archive.li" },
				],
			},
		];
	},

	// ── Internals ──

	_BASE_DOMAINS: [
		"annas-archive.gd",
		"annas-archive.gs",
		"annas-archive.se",
		"annas-archive.li",
	],

	_getBaseUrl: async function() {
		var pref = await cinder.store.get("preferred_domain");
		if (pref) return "https://" + pref;
		return "https://" + this._BASE_DOMAINS[0];
	},

	// Smart fetch: try plain HTTP first (no ads/popups), fall back to browser only if Cloudflare blocks
	_smartFetch: async function(url) {
		try {
			var resp = await cinder.fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.5",
				},
			});

			// Check for Cloudflare challenge (403 or short challenge page)
			if (resp.status === 403 || (resp.data && resp.data.indexOf("cf-challenge") !== -1) || (resp.data && resp.data.length < 500 && resp.data.indexOf("challenge") !== -1)) {
				cinder.log("[AA] Cloudflare detected, falling back to browser fetch for: " + url);
				return await cinder.fetchBrowser(url);
			}

			if (resp.status === 200 && resp.data && resp.data.length > 500) {
				return resp;
			}

			cinder.warn("[AA] Unexpected status " + resp.status + " for: " + url);
			// Try browser as fallback for unexpected responses
			return await cinder.fetchBrowser(url);
		} catch (err) {
			cinder.warn("[AA] fetch failed, trying browser: " + err);
			return await cinder.fetchBrowser(url);
		}
	},

	_fetchWithFallback: async function(path) {
		var pref = await cinder.store.get("preferred_domain");
		var domains = this._BASE_DOMAINS.slice();

		if (pref) {
			domains = domains.filter(function(d) { return d !== pref; });
			domains.unshift(pref);
		}

		var lastErr = null;
		for (var i = 0; i < domains.length; i++) {
			var url = "https://" + domains[i] + path;
			try {
				cinder.log("[AA] Trying: " + url);
				var resp = await this._smartFetch(url);
				if (resp.status === 200 && resp.data && resp.data.length > 500) {
					return resp;
				}
				cinder.warn("[AA] " + domains[i] + " returned status " + resp.status);
			} catch (err) {
				cinder.warn("[AA] " + domains[i] + " failed: " + err);
				lastErr = err;
			}
		}
		throw lastErr || new Error("All domains failed for path: " + path);
	},

	// ── Search ──

	search: async function(query, page) {
		if (!page) page = 0;

		var format = await cinder.store.get("preferred_format");
		var extParam = format ? "&ext=" + format : "";
		var searchPath = "/search?q=" + encodeURIComponent(query) + extParam
			+ "&page=" + (page + 1) + "&sort=&lang=en";

		var resp = await this._fetchWithFallback(searchPath);
		var doc = cinder.parseHTML(resp.data);
		var results = [];

		var items = doc.querySelectorAll("a[href*='/md5/']");
		cinder.log("[AA] Found " + items.length + " result links");

		for (var i = 0; i < items.length; i++) {
			try {
				var link = items[i];
				var href = link.attr("href") || "";
				if (!href || href.indexOf("/md5/") === -1) continue;

				var md5Match = href.match(/\/md5\/([a-f0-9]+)/i);
				if (!md5Match) continue;
				var md5 = md5Match[1];

				var fullText = link.text() || "";
				var lines = fullText.split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l; });

				var title = "";
				var author = "";
				var fileFormat = "";
				var size = "";

				for (var j = 0; j < lines.length; j++) {
					var line = lines[j];
					var formatMatch = line.match(/\b(epub|pdf|mobi|azw3|cbz|cbr|fb2|djvu)\b/i);
					if (formatMatch && !fileFormat) fileFormat = formatMatch[1].toLowerCase();
					var sizeMatch = line.match(/(\d+\.?\d*\s*[KMG]B)/i);
					if (sizeMatch && !size) size = sizeMatch[1];
				}

				if (lines.length > 0) title = lines[0];
				title = title.replace(/\b(epub|pdf|mobi|azw3|cbz|cbr|fb2|djvu)\b/gi, "")
					.replace(/\d+\.?\d*\s*[KMG]B/gi, "")
					.replace(/\b[a-z]{2}\b/g, "")
					.replace(/\s+/g, " ").trim();
				if (lines.length > 1) author = lines[1];

				var coverImg = link.querySelector("img");
				var cover = coverImg ? (coverImg.attr("src") || "") : "";

				if (title) {
					results.push({
						id: md5,
						title: title,
						author: author,
						cover: cover,
						format: fileFormat || "epub",
						size: size,
						url: md5,
						source: "Anna's Archive",
					});
				}
			} catch (parseErr) {
				cinder.warn("[AA] Failed to parse result " + i + ": " + parseErr);
			}
		}

		cinder.log("[AA] Parsed " + results.length + " results");
		return results;
	},

	// ── Resolve ──

	resolve: async function(item) {
		var md5 = item.url || item.id;
		cinder.log("[AA] Resolving md5: " + md5);

		// Step 1: Load book detail page
		var detailPath = "/md5/" + md5;
		var detailResp = await this._fetchWithFallback(detailPath);
		var detailDoc = cinder.parseHTML(detailResp.data);

		// Step 2: Find slow download links
		var slowLinks = [];
		var allLinks = detailDoc.querySelectorAll("a[href*='/slow_download/']");

		for (var i = 0; i < allLinks.length; i++) {
			var href = allLinks[i].attr("href");
			if (href) slowLinks.push(href);
		}

		cinder.log("[AA] Found " + slowLinks.length + " slow download links");

		if (slowLinks.length === 0) {
			for (var idx = 0; idx < 10; idx++) {
				slowLinks.push("/slow_download/" + md5 + "/0/" + idx);
			}
			cinder.log("[AA] Constructed 10 fallback slow links");
		}

		// Step 3: Prefer no-waitlist links (indices 5-9)
		var noWaitlist = [];
		var waitlist = [];
		for (var j = 0; j < slowLinks.length; j++) {
			var indexMatch = slowLinks[j].match(/\/(\d+)$/);
			var linkIndex = indexMatch ? parseInt(indexMatch[1]) : j;
			if (linkIndex >= 5) {
				noWaitlist.push(slowLinks[j]);
			} else {
				waitlist.push(slowLinks[j]);
			}
		}
		var orderedLinks = noWaitlist.concat(waitlist);
		cinder.log("[AA] Ordered: " + noWaitlist.length + " no-waitlist, " + waitlist.length + " waitlist");

		// Step 4: Try each slow link
		var lastError = null;
		for (var k = 0; k < orderedLinks.length; k++) {
			try {
				var slowPath = orderedLinks[k];
				cinder.log("[AA] Trying slow link " + (k+1) + "/" + orderedLinks.length + ": " + slowPath);

				var slowResp = await this._fetchWithFallback(slowPath);
				var slowDoc = cinder.parseHTML(slowResp.data);
				var downloadUrl = null;

				// Look for download links
				var downloadSelectors = [
					"a[href*='.epub']",
					"a[href*='.pdf']",
					"a[href*='.mobi']",
					"a[href*='.azw3']",
					"a[href*='.cbz']",
					"a[href*='download']",
					"a.btn",
					"a[href*='get']",
				];

				for (var s = 0; s < downloadSelectors.length; s++) {
					var dlLinks = slowDoc.querySelectorAll(downloadSelectors[s]);
					for (var d = 0; d < dlLinks.length; d++) {
						var dlHref = dlLinks[d].attr("href");
						if (dlHref && dlHref.indexOf("slow_download") === -1
							&& dlHref.indexOf("/md5/") === -1
							&& dlHref.length > 10) {
							downloadUrl = dlHref;
							break;
						}
					}
					if (downloadUrl) break;
				}

				// Check meta refresh redirect
				if (!downloadUrl) {
					var metas = slowDoc.querySelectorAll("meta[http-equiv='refresh']");
					for (var m = 0; m < metas.length; m++) {
						var content = metas[m].attr("content") || "";
						var urlMatch = content.match(/url=(.+)/i);
						if (urlMatch) {
							downloadUrl = urlMatch[1].trim();
							break;
						}
					}
				}

				// Check external links
				if (!downloadUrl) {
					var extLinks = slowDoc.querySelectorAll("a[href^='http']");
					for (var e = 0; e < extLinks.length; e++) {
						var extHref = extLinks[e].attr("href") || "";
						if (extHref.indexOf("annas-archive") !== -1) continue;
						if (extHref.indexOf("cloudflare") !== -1) continue;
						if (extHref.indexOf("javascript") !== -1) continue;
						if (extHref.indexOf("#") === 0) continue;
						if (extHref.indexOf("apple.com") !== -1) continue;
						if (extHref.indexOf("google.com") !== -1) continue;
						if (extHref.indexOf("facebook.com") !== -1) continue;
						downloadUrl = extHref;
						cinder.log("[AA] Found external link: " + downloadUrl);
						break;
					}
				}

				if (downloadUrl) {
					if (downloadUrl.indexOf("http") !== 0) {
						var baseUrl = await this._getBaseUrl();
						downloadUrl = baseUrl + downloadUrl;
					}
					cinder.log("[AA] Resolved download URL: " + downloadUrl);
					return {
						url: downloadUrl,
						headers: {
							"Referer": (await this._getBaseUrl()) + slowPath,
						},
					};
				}

				cinder.warn("[AA] No download URL on slow link " + (k+1));
			} catch (err) {
				cinder.warn("[AA] Slow link " + (k+1) + " failed: " + err);
				lastError = err;
			}
		}

		throw lastError || new Error("Could not resolve download. All slow mirrors may be temporarily unavailable.");
	},
};
