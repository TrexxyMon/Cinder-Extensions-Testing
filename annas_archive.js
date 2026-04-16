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
	version: "1.5.6",
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

	// Formats Cinder can actually read
	_SUPPORTED_FORMATS: ["epub", "pdf"],

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

		// Step 1: Load book detail page to find slow download links
		var detailPath = "/md5/" + md5;
		var detailResp = await this._fetchWithFallback(detailPath);
		var detailDoc = cinder.parseHTML(detailResp.data);

		// Step 2: Find slow download links on the detail page
		var slowLinks = [];
		var allLinks = detailDoc.querySelectorAll("a[href*='/slow_download/']");
		for (var i = 0; i < allLinks.length; i++) {
			var href = allLinks[i].attr("href");
			if (href) slowLinks.push(href);
		}
		cinder.log("[AA] Found " + slowLinks.length + " slow download links on detail page");

		if (slowLinks.length === 0) {
			for (var idx = 0; idx < 8; idx++) {
				slowLinks.push("/slow_download/" + md5 + "/0/" + idx);
			}
			cinder.log("[AA] Constructed 8 fallback slow links");
		}

		// Step 3: Order links smartly
		// Indices 5,7 give clickable download links (best)
		// Indices 6,8 give copy-paste URLs only (buttons/text)
		// Indices 0-4 require waitlist (worst)
		var clickable = []; // 5, 7
		var copyPaste = []; // 6, 8
		var waitlist = [];  // 0-4
		for (var j = 0; j < slowLinks.length; j++) {
			var indexMatch = slowLinks[j].match(/\/(\d+)$/);
			var linkIndex = indexMatch ? parseInt(indexMatch[1]) : j;
			if (linkIndex === 5 || linkIndex === 7) {
				clickable.push(slowLinks[j]);
			} else if (linkIndex === 6 || linkIndex === 8) {
				copyPaste.push(slowLinks[j]);
			} else {
				waitlist.push(slowLinks[j]);
			}
		}
		var orderedLinks = clickable.concat(copyPaste).concat(waitlist);
		cinder.log("[AA] Order: " + clickable.length + " clickable, " + copyPaste.length + " copy-paste, " + waitlist.length + " waitlist");

		// Step 4: For each slow link, use fetchBrowser (DDoS-Guard + JS countdown)
		// The slow download page has a 5s JS countdown, then reveals download link
		var lastError = null;
		var baseUrl = await this._getBaseUrl();

		for (var k = 0; k < orderedLinks.length; k++) {
			try {
				var slowPath = orderedLinks[k];
				// Make absolute URL
				var slowUrl = slowPath.indexOf("http") === 0 ? slowPath : baseUrl + slowPath;
				cinder.log("[AA] Fetching slow link " + (k+1) + ": " + slowUrl);

				// MUST use fetchBrowser — DDoS-Guard blocks plain HTTP,
				// and the download link only appears after JS countdown
				var slowResp = await cinder.fetchBrowser(slowUrl);

				if (!slowResp.data || slowResp.data.length < 200) {
					cinder.warn("[AA] Slow link " + (k+1) + " returned empty/short response");
					continue;
				}

				// Log what we got for debugging
				var snippet = slowResp.data.substring(0, 300).replace(/\s+/g, " ");
				cinder.log("[AA] HTML snippet (" + slowResp.data.length + " chars): " + snippet);

				// Check if we got a DDoS-Guard challenge instead of the real page
				if (slowResp.data.indexOf("DDoS-Guard") !== -1 && slowResp.data.indexOf("Download") === -1) {
					cinder.warn("[AA] Got DDoS-Guard challenge page, not real content. Trying next link...");
					continue;
				}

				var slowDoc = cinder.parseHTML(slowResp.data);
				var downloadUrl = null;

				// Strategy 0: Regex on raw HTML for the "Download now" anchor
				// Most reliable — parseHTML can choke on 178KB pages with Dark Reader injection
				var dnMatch = slowResp.data.match(/href="(https?:\/\/[^"]+)"[^>]*>[^<]*Download now/i);
				if (dnMatch && dnMatch[1] && dnMatch[1].indexOf("annas-archive") === -1) {
					downloadUrl = dnMatch[1];
					cinder.log("[AA] ✅ Found download link via regex: " + downloadUrl);
				}

				// Strategy 0.5: clipboard.writeText URL extraction
				// Copy-paste servers (6, 8) have no "Download now" anchor.
				// The URL lives inside: navigator.clipboard.writeText('http://...')
				// Prefer HTTPS over HTTP (momot.rs > raw IP) since iOS blocks plain HTTP
				if (!downloadUrl) {
					var clipMatches = slowResp.data.match(/clipboard\.writeText\(['"]([^'"]+)['"]\)/g);
					if (clipMatches) {
						var httpsClip = null;
						var httpClip = null;
						for (var cm = 0; cm < clipMatches.length; cm++) {
							var clipInner = clipMatches[cm].match(/clipboard\.writeText\(['"]([^'"]+)['"]\)/);
							if (clipInner && clipInner[1] && clipInner[1].match(/^https?:\/\//)) {
								var clipUrl = clipInner[1];
								if (clipUrl.indexOf("annas-archive") !== -1) continue;
								if (clipUrl.indexOf("https://") === 0 && !httpsClip) {
									httpsClip = clipUrl;
								} else if (!httpClip) {
									httpClip = clipUrl;
								}
							}
						}
						// Prefer HTTPS (works on iOS), fall back to HTTP
						downloadUrl = httpsClip || httpClip || null;
						if (downloadUrl) {
							cinder.log("[AA] ✅ Found download link via clipboard (" + (httpsClip ? "HTTPS" : "HTTP") + "): " + downloadUrl);
						}
					}
				}

				// Strategy 1: Look for "📚 Download now" anchor via DOM (fallback)
				if (!downloadUrl) {
					var allAnchors = slowDoc.querySelectorAll("a");
					for (var a = 0; a < allAnchors.length; a++) {
						var anchorText = allAnchors[a].text() || "";
						var anchorHref = allAnchors[a].attr("href") || "";
						if (anchorText.indexOf("Download now") !== -1 && anchorHref.indexOf("http") === 0) {
							if (anchorHref.indexOf("annas-archive") === -1) {
								downloadUrl = anchorHref;
								cinder.log("[AA] Found 'Download now' anchor: " + downloadUrl);
								break;
							}
						}
					}
				}

				// Strategy 2: Look for URLs in button text (servers 6, 8 — copy-paste)
				if (!downloadUrl) {
					var buttons = slowDoc.querySelectorAll("button");
					for (var b = 0; b < buttons.length; b++) {
						var btnText = buttons[b].text() || "";
						var urlInBtn = btnText.match(/https?:\/\/[^\s<>"]+/);
						if (urlInBtn && urlInBtn[0].indexOf("annas-archive") === -1) {
							downloadUrl = urlInBtn[0];
							cinder.log("[AA] Found URL in button: " + downloadUrl);
							break;
						}
					}
				}

				// Strategy 3: Look for bare URLs in page text (copy-paste servers)
				if (!downloadUrl) {
					var bodyText = slowResp.data;
					// Find URLs that look like partner download links
					var urlMatches = bodyText.match(/https?:\/\/[a-z0-9.-]+(:\d+)?\/[^\s<>"']+/gi);
					if (urlMatches) {
						for (var u = 0; u < urlMatches.length; u++) {
							var candidateUrl = urlMatches[u];
							if (candidateUrl.indexOf("annas-archive") !== -1) continue;
							if (candidateUrl.indexOf("cloudflare") !== -1) continue;
							if (candidateUrl.indexOf("ddos-guard") !== -1) continue;
							if (candidateUrl.indexOf("apple.com") !== -1) continue;
							if (candidateUrl.indexOf("google.com") !== -1) continue;
							if (candidateUrl.indexOf("facebook.com") !== -1) continue;
							if (candidateUrl.indexOf("t.me") !== -1) continue;
							if (candidateUrl.indexOf("telegram") !== -1) continue;
							if (candidateUrl.indexOf("github.com") !== -1) continue;
							if (candidateUrl.indexOf("twitter.com") !== -1) continue;
							if (candidateUrl.indexOf("reddit.com") !== -1) continue;
							if (candidateUrl.indexOf("wikipedia.org") !== -1) continue;
							if (candidateUrl.indexOf("mozilla.org") !== -1) continue;
							if (candidateUrl.indexOf("darkreader") !== -1) continue;
							if (candidateUrl.indexOf("motrix") !== -1) continue;
							if (candidateUrl.indexOf("readera") !== -1) continue;
							if (candidateUrl.indexOf("calibre") !== -1) continue;
							if (candidateUrl.indexOf("printfriendly") !== -1) continue;
							if (candidateUrl.indexOf("cloudconvert") !== -1) continue;
							if (candidateUrl.indexOf("w3.org") !== -1) continue;
							if (candidateUrl.indexOf("schema.org") !== -1) continue;
							if (candidateUrl.indexOf("jsdelivr") !== -1) continue;
							if (candidateUrl.indexOf("cdnjs") !== -1) continue;
							if (candidateUrl.indexOf("matrix.to") !== -1) continue;
							if (candidateUrl.indexOf("open-slum") !== -1) continue;
							if (candidateUrl.indexOf("archivecommunication") !== -1) continue;
							if (candidateUrl.indexOf("translate.annas") !== -1) continue;
							if (candidateUrl.indexOf("software.annas") !== -1) continue;
							if (candidateUrl.indexOf("torrentfreak") !== -1) continue;
							if (candidateUrl.indexOf("covers.z-lib") !== -1) continue;
							// Likely the partner download link
							downloadUrl = candidateUrl;
							cinder.log("[AA] Found URL in page text: " + downloadUrl);
							break;
						}
					}
				}

				// Strategy 4: External anchor links as last resort
				if (!downloadUrl) {
					var extLinks = slowDoc.querySelectorAll("a[href^='http']");
					for (var e = 0; e < extLinks.length; e++) {
						var extHref = extLinks[e].attr("href") || "";
						if (extHref.indexOf("annas-archive") !== -1) continue;
						if (extHref.indexOf("cloudflare") !== -1) continue;
						if (extHref.indexOf("apple.com") !== -1) continue;
						if (extHref.indexOf("google.com") !== -1) continue;
						if (extHref.indexOf("facebook.com") !== -1) continue;
						if (extHref.indexOf("t.me") !== -1) continue;
						if (extHref.indexOf("telegram") !== -1) continue;
						if (extHref.indexOf("github.com") !== -1) continue;
						if (extHref.indexOf("twitter.com") !== -1) continue;
						if (extHref.indexOf("reddit.com") !== -1) continue;
						if (extHref.indexOf("wikipedia.org") !== -1) continue;
						if (extHref.indexOf("mozilla.org") !== -1) continue;
						if (extHref.indexOf("darkreader") !== -1) continue;
						if (extHref.indexOf("motrix") !== -1) continue;
						if (extHref.indexOf("readera") !== -1) continue;
						if (extHref.indexOf("calibre") !== -1) continue;
						if (extHref.indexOf("printfriendly") !== -1) continue;
						if (extHref.indexOf("matrix.to") !== -1) continue;
						if (extHref.indexOf("open-slum") !== -1) continue;
						if (extHref.indexOf("archivecommunication") !== -1) continue;
						if (extHref.indexOf("translate.annas") !== -1) continue;
						if (extHref.indexOf("software.annas") !== -1) continue;
						if (extHref.indexOf("torrentfreak") !== -1) continue;
						if (extHref.indexOf("covers.z-lib") !== -1) continue;
						if (extHref.indexOf("cloudconvert") !== -1) continue;
						if (extHref.indexOf("ddos-guard") !== -1) continue;
						if (extHref.indexOf("#") === 0) continue;
						downloadUrl = extHref;
						cinder.log("[AA] Found external link: " + downloadUrl);
						break;
					}
				}

				if (downloadUrl) {
					// Ensure absolute URL
					if (downloadUrl.indexOf("http") !== 0) {
						downloadUrl = baseUrl + downloadUrl;
					}

					// Validate file format — skip unsupported types (fb2, djvu, etc.)
					var decodedUrl = decodeURIComponent(downloadUrl).toLowerCase();
					var extMatch = decodedUrl.match(/\.(epub|pdf|fb2|mobi|azw3?|djvu|cbz|cbr|txt)(?:\?|$)/);
					if (extMatch) {
						var fileExt = extMatch[1];
						if (this._SUPPORTED_FORMATS.indexOf(fileExt) === -1) {
							cinder.warn("[AA] ⚠️ Skipping unsupported format '" + fileExt + "' on link " + (k+1) + ", trying next mirror...");
							continue;
						}
					}

					// Skip plain HTTP URLs — iOS App Transport Security blocks them
					if (downloadUrl.indexOf("http://") === 0) {
						cinder.warn("[AA] ⚠️ Skipping plain HTTP URL on link " + (k+1) + " (blocked by iOS ATS), trying next mirror...");
						continue;
					}

					cinder.log("[AA] ✅ Resolved: " + downloadUrl);
					return {
						url: downloadUrl,
						headers: {
							"Referer": slowUrl,
						},
					};
				}

				cinder.warn("[AA] No download URL found on slow link " + (k+1) + " (HTML length: " + slowResp.data.length + ")");
			} catch (err) {
				cinder.warn("[AA] Slow link " + (k+1) + " failed: " + err);
				lastError = err;
			}
		}

		throw lastError || new Error("Could not resolve download. The book may not have free slow download mirrors available.");
	},
};
