// ─── Anna's Archive Download Extension v2.0.0 ──────────────────
//
// Multi-strategy download accelerator for Anna's Archive.
//
// Resolution order (fastest → slowest):
//   1. AA Supporter Key → fast_download (instant, no queue)
//   2. Library.lol CDN  → direct link from Libgen mirrors (fast CDN)
//   3. Parallel Mirror Race → start 2-3 slow mirrors simultaneously
//   4. Sequential Slow Download → classic single-mirror fallback
//
// TorBox integration: always returns debridLink for TorBox users.

__cinderExport = {
	id: "annas-archive-slow",
	name: "Anna's Archive",
	version: "2.0.0",
	icon: "📚",
	description: "Fast downloads from Anna's Archive with multiple acceleration strategies.",
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
				id: "aa_supporter_key",
				label: "AA Supporter Key (Optional)",
				type: "text",
				defaultValue: "",
				placeholder: "Paste your supporter secret key",
				description: "From annas-archive.se/account. Unlocks fast downloads.",
			},
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
			{
				id: "enable_libgen",
				label: "Try Libgen CDN First",
				type: "select",
				defaultValue: "true",
				options: [
					{ label: "Enabled", value: "true" },
					{ label: "Disabled", value: "false" },
				],
			},
			{
				id: "enable_mirror_race",
				label: "Parallel Mirror Racing",
				type: "select",
				defaultValue: "true",
				options: [
					{ label: "Enabled", value: "true" },
					{ label: "Disabled", value: "false" },
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

	_SUPPORTED_FORMATS: ["epub", "pdf"],

	// Domains to skip when filtering URLs from page text
	_JUNK_DOMAINS: [
		"annas-archive", "cloudflare", "ddos-guard", "apple.com", "google.com",
		"facebook.com", "t.me", "telegram", "github.com", "twitter.com",
		"reddit.com", "wikipedia.org", "mozilla.org", "darkreader", "motrix",
		"readera", "calibre", "printfriendly", "cloudconvert", "w3.org",
		"schema.org", "jsdelivr", "cdnjs", "matrix.to", "open-slum",
		"archivecommunication", "translate.annas", "software.annas",
		"torrentfreak", "covers.z-lib", "jdownloader",
	],

	_getBaseUrl: async function() {
		var pref = await cinder.store.get("preferred_domain");
		if (pref) return "https://" + pref;
		return "https://" + this._BASE_DOMAINS[0];
	},

	_smartFetch: async function(url) {
		try {
			var resp = await cinder.fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.5",
				},
			});

			if (resp.status === 403 || (resp.data && resp.data.indexOf("cf-challenge") !== -1) || (resp.data && resp.data.length < 500 && resp.data.indexOf("challenge") !== -1)) {
				cinder.log("[AA] Cloudflare detected, falling back to browser fetch for: " + url);
				return await cinder.fetchBrowser(url);
			}

			if (resp.status === 200 && resp.data && resp.data.length > 500) {
				return resp;
			}

			cinder.warn("[AA] Unexpected status " + resp.status + " for: " + url);
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

	// Check if a URL is a junk/social link
	_isJunkUrl: function(url) {
		var lower = url.toLowerCase();
		for (var i = 0; i < this._JUNK_DOMAINS.length; i++) {
			if (lower.indexOf(this._JUNK_DOMAINS[i]) !== -1) return true;
		}
		return false;
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

				var titleLinkStr = '<a href="/md5/' + md5 + '"';
				var idx = resp.data.indexOf(titleLinkStr);
				idx = resp.data.indexOf(titleLinkStr, idx + 10);
				
				if (idx !== -1) {
					var rawBlock = resp.data.substring(idx, idx + 4000);
					var cleanText = rawBlock.replace(/<[^>]+>/g, ' ');
					
					var metaLineMatch = cleanText.match(/([^\n·]+·[^\n·]+·[^\n·]*(?:MB|KB|GB|KiB|MiB)[^\n]*)/i);
					var searchTarget = metaLineMatch ? metaLineMatch[1] : cleanText;

					var formatMatch = searchTarget.match(/\b(epub|pdf|mobi|azw3|cbz|cbr|fb2|djvu)\b/i);
					if (formatMatch) fileFormat = formatMatch[1].toLowerCase();
					
					var sizeMatch = searchTarget.match(/(\d+\.?\d*\s*[KMGi]i?B)/i);
					if (sizeMatch) size = sizeMatch[1].replace(/\s+/g, "");
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
					var supported = this._SUPPORTED_FORMATS;
					if (fileFormat && supported.indexOf(fileFormat) === -1) continue;
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

		cinder.log("[AA] Parsed " + results.length + " results (epub/pdf only)");
		return results;
	},

	// ═══════════════════════════════════════════════════════════
	// ── Resolve: Multi-Strategy Download Accelerator ──
	// ═══════════════════════════════════════════════════════════

	resolve: async function(item) {
		var md5 = item.url || item.id;
		cinder.log("[AA] Resolving md5: " + md5);

		var debridLink = "https://annas-archive.gl/md5/" + md5;

		// ── Strategy 1: AA Supporter Key (fast_download) ──
		try {
			var supporterKey = await cinder.store.get("aa_supporter_key");
			if (supporterKey && supporterKey.trim()) {
				supporterKey = supporterKey.trim();
				cinder.log("[AA] 🔑 Trying fast_download with supporter key...");
				var baseUrl = await this._getBaseUrl();

				// Try fast_download endpoint — no queue, instant download
				var fastUrl = baseUrl + "/fast_download/" + md5 + "/0/2?secret=" + encodeURIComponent(supporterKey);
				var fastResp = await this._smartFetch(fastUrl);

				if (fastResp.status === 200 && fastResp.data && fastResp.data.length > 500) {
					var downloadUrl = this._extractDownloadUrl(fastResp.data);
					if (downloadUrl) {
						cinder.log("[AA] 🚀 Fast download resolved: " + downloadUrl.substring(0, 80));
						return {
							url: downloadUrl,
							debridLink: debridLink,
							headers: {
								"Referer": fastUrl,
								"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
							},
						};
					}
				}
				cinder.warn("[AA] Fast download failed (status " + fastResp.status + "), falling through to other strategies");
			}
		} catch (fastErr) {
			cinder.warn("[AA] Fast download error: " + fastErr);
		}

		// ── Strategy 2: Library.lol / Libgen CDN First-Pass ──
		var enableLibgen = await cinder.store.get("enable_libgen");
		if (enableLibgen !== "false") {
			try {
				cinder.log("[AA] 📖 Trying Library.lol CDN for md5: " + md5);
				var libgenResult = await this._tryLibgenCDN(md5);
				if (libgenResult) {
					cinder.log("[AA] 🚀 Libgen CDN resolved: " + libgenResult.substring(0, 80));
					return {
						url: libgenResult,
						debridLink: debridLink,
						headers: {
							"Referer": "https://library.lol/",
							"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
						},
					};
				}
			} catch (libErr) {
				cinder.warn("[AA] Libgen CDN failed: " + libErr);
			}
		}

		// ── Load detail page to find slow download links ──
		var detailPath = "/md5/" + md5;
		var detailResp = await this._fetchWithFallback(detailPath);
		var detailDoc = cinder.parseHTML(detailResp.data);

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

		// Order links: HTTPS anchors (6, 8) first, then copy-paste (5, 7), then waitlist (0-4)
		var httpsAnchors = [];
		var copyPaste = [];
		var waitlist = [];
		for (var j = 0; j < slowLinks.length; j++) {
			var indexMatch = slowLinks[j].match(/\/(\d+)$/);
			var linkIndex = indexMatch ? parseInt(indexMatch[1]) : j;
			if (linkIndex === 6 || linkIndex === 8) {
				httpsAnchors.push(slowLinks[j]);
			} else if (linkIndex === 5 || linkIndex === 7) {
				copyPaste.push(slowLinks[j]);
			} else {
				waitlist.push(slowLinks[j]);
			}
		}
		var orderedLinks = httpsAnchors.concat(copyPaste).concat(waitlist);
		cinder.log("[AA] Order: " + httpsAnchors.length + " https-anchor, " + copyPaste.length + " copy-paste, " + waitlist.length + " waitlist");

		var baseUrl = await this._getBaseUrl();

		// ── Strategy 3: Parallel Mirror Race ──
		var enableRace = await cinder.store.get("enable_mirror_race");
		if (enableRace !== "false" && httpsAnchors.length >= 2) {
			try {
				cinder.log("[AA] 🏁 Starting parallel mirror race with " + httpsAnchors.length + " HTTPS mirrors...");
				var raceResult = await this._raceMirrors(httpsAnchors, baseUrl);
				if (raceResult) {
					cinder.log("[AA] 🚀 Mirror race winner: " + raceResult.url.substring(0, 80));
					return {
						url: raceResult.url,
						debridLink: debridLink,
						headers: {
							"Referer": raceResult.referer,
							"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
						},
					};
				}
			} catch (raceErr) {
				cinder.warn("[AA] Mirror race failed: " + raceErr);
			}
		}

		// ── Strategy 4: Sequential Slow Download (original fallback) ──
		cinder.log("[AA] 🐢 Falling back to sequential slow download...");
		var lastError = null;

		for (var k = 0; k < orderedLinks.length; k++) {
			try {
				var slowPath = orderedLinks[k];
				var slowUrl = slowPath.indexOf("http") === 0 ? slowPath : baseUrl + slowPath;
				cinder.log("[AA] Fetching slow link " + (k+1) + ": " + slowUrl);

				var slowResp = await cinder.fetchBrowser(slowUrl);

				if (!slowResp.data || slowResp.data.length < 200) {
					cinder.warn("[AA] Slow link " + (k+1) + " returned empty/short response");
					continue;
				}

				if (slowResp.data.indexOf("DDoS-Guard") !== -1 && slowResp.data.indexOf("Download") === -1) {
					cinder.warn("[AA] Got DDoS-Guard challenge page, trying next...");
					continue;
				}

				var downloadUrl = this._extractDownloadUrl(slowResp.data);

				if (downloadUrl) {
					// Validate format
					var decodedUrl = decodeURIComponent(downloadUrl).toLowerCase();
					var extMatch = decodedUrl.match(/\.(epub|pdf|fb2|mobi|azw3?|djvu|cbz|cbr|txt)(?:\?|$)/);
					if (extMatch) {
						var fileExt = extMatch[1];
						if (this._SUPPORTED_FORMATS.indexOf(fileExt) === -1) {
							cinder.warn("[AA] ⚠️ Skipping unsupported format '" + fileExt + "' on link " + (k+1));
							continue;
						}
					}

					// Skip plain HTTP (iOS ATS blocks)
					if (downloadUrl.indexOf("http://") === 0) {
						cinder.warn("[AA] ⚠️ Skipping plain HTTP on link " + (k+1));
						continue;
					}

					cinder.log("[AA] ✅ Resolved: " + downloadUrl);
					return {
						url: downloadUrl,
						debridLink: debridLink,
						headers: {
							"Referer": slowUrl,
							"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
						},
					};
				}

				cinder.warn("[AA] No download URL found on slow link " + (k+1));
			} catch (err) {
				cinder.warn("[AA] Slow link " + (k+1) + " failed: " + err);
				lastError = err;
			}
		}

		throw lastError || new Error("Could not resolve download. The book may not have free download mirrors available.");
	},

	// ═══════════════════════════════════════════════════════════
	// ── Strategy Helpers ──
	// ═══════════════════════════════════════════════════════════

	/**
	 * Strategy 2: Try Library.lol CDN using the MD5 hash.
	 * Returns the direct download URL or null.
	 */
	_tryLibgenCDN: async function(md5) {
		// Library.lol serves as a redirect page with the actual download link
		var libUrl = "https://library.lol/main/" + md5;
		try {
			var resp = await cinder.fetch(libUrl, {
				headers: {
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
					"Accept": "text/html",
				},
				timeout: 8000,
			});

			if (resp.status === 200 && resp.data && resp.data.length > 200) {
				// Library.lol page has a download link like: <a href="https://download.library.lol/main/...">
				var dlMatch = resp.data.match(/href="(https?:\/\/download\.library\.lol\/[^"]+)"/i);
				if (dlMatch && dlMatch[1]) {
					// Verify link is alive with a quick HEAD-style probe
					var probeResp = await cinder.fetch(dlMatch[1], {
						headers: { "Range": "bytes=0-1024" },
						timeout: 5000,
					});
					if (probeResp.status === 200 || probeResp.status === 206) {
						return dlMatch[1];
					}
					cinder.warn("[AA] Library.lol link returned " + probeResp.status);
				}

				// Also try cloudflare-ipfs or other CDN links on the page
				var cdnMatch = resp.data.match(/href="(https?:\/\/[^"]*(?:cloudflare-ipfs|ipfs\.io|pinata)[^"]+)"/i);
				if (cdnMatch && cdnMatch[1]) {
					cinder.log("[AA] Found IPFS CDN link: " + cdnMatch[1].substring(0, 60));
					return cdnMatch[1];
				}
			}
		} catch (err) {
			cinder.warn("[AA] Library.lol fetch failed: " + err);
		}

		// Try libgen.li as alternate
		try {
			var altUrl = "https://libgen.li/ads.php?md5=" + md5;
			var altResp = await cinder.fetch(altUrl, {
				headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
				timeout: 6000,
			});
			if (altResp.status === 200 && altResp.data) {
				var altMatch = altResp.data.match(/href="(https?:\/\/[^"]*(?:get|download)[^"]+)"/i);
				if (altMatch && altMatch[1] && altMatch[1].indexOf("libgen") !== -1) {
					return altMatch[1];
				}
			}
		} catch (err2) {
			cinder.warn("[AA] libgen.li fallback failed: " + err2);
		}

		return null;
	},

	/**
	 * Strategy 3: Race multiple slow download mirrors simultaneously.
	 * Resolves all mirror pages at once, returns the first one that yields a download URL.
	 */
	_raceMirrors: async function(mirrorPaths, baseUrl) {
		var self = this;
		var resolved = false;

		// Create promises for each mirror
		var promises = mirrorPaths.map(function(path, index) {
			var slowUrl = path.indexOf("http") === 0 ? path : baseUrl + path;
			return cinder.fetchBrowser(slowUrl).then(function(resp) {
				if (resolved) return null; // Another mirror already won
				if (!resp.data || resp.data.length < 200) return null;
				if (resp.data.indexOf("DDoS-Guard") !== -1 && resp.data.indexOf("Download") === -1) return null;

				var downloadUrl = self._extractDownloadUrl(resp.data);
				if (!downloadUrl) return null;

				// Validate: must be HTTPS and supported format
				if (downloadUrl.indexOf("http://") === 0) return null;
				var decoded = decodeURIComponent(downloadUrl).toLowerCase();
				var extMatch = decoded.match(/\.(epub|pdf|fb2|mobi|azw3?|djvu|cbz|cbr|txt)(?:\?|$)/);
				if (extMatch && self._SUPPORTED_FORMATS.indexOf(extMatch[1]) === -1) return null;

				resolved = true;
				cinder.log("[AA] 🏆 Mirror " + (index + 1) + " won the race!");
				return { url: downloadUrl, referer: slowUrl };
			}).catch(function(err) {
				cinder.warn("[AA] Mirror " + (index + 1) + " race entry failed: " + err);
				return null;
			});
		});

		// Wait for first non-null result
		var results = await Promise.all(promises); // Note: can't use Promise.any in sandboxed env
		for (var i = 0; i < results.length; i++) {
			if (results[i]) return results[i];
		}
		return null;
	},

	/**
	 * Extract a download URL from an AA slow_download or fast_download HTML page.
	 * Consolidates all extraction strategies into one reusable function.
	 */
	_extractDownloadUrl: function(html) {
		var downloadUrl = null;

		// Strategy 0: Regex for "Download now" anchor (most reliable)
		var dnMatch = html.match(/href="(https?:\/\/[^"]+)"[^>]*>[^<]*Download now/i);
		if (dnMatch && dnMatch[1] && dnMatch[1].indexOf("annas-archive") === -1) {
			downloadUrl = dnMatch[1];
			cinder.log("[AA] Found via 'Download now' regex");
			return downloadUrl;
		}

		// Strategy 0.5: clipboard.writeText URL extraction
		var clipMatches = html.match(/clipboard\.writeText\(['"]([^'"]+)['"]\)/g);
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
			downloadUrl = httpsClip || httpClip || null;
			if (downloadUrl) {
				cinder.log("[AA] Found via clipboard (" + (httpsClip ? "HTTPS" : "HTTP") + ")");
				return downloadUrl;
			}
		}

		// Strategy 1: DOM-parsed "Download now" anchor
		var doc = cinder.parseHTML(html);
		var allAnchors = doc.querySelectorAll("a");
		for (var a = 0; a < allAnchors.length; a++) {
			var anchorText = allAnchors[a].text() || "";
			var anchorHref = allAnchors[a].attr("href") || "";
			if (anchorText.indexOf("Download now") !== -1 && anchorHref.indexOf("http") === 0) {
				if (anchorHref.indexOf("annas-archive") === -1) {
					cinder.log("[AA] Found via DOM anchor");
					return anchorHref;
				}
			}
		}

		// Strategy 2: Bare URLs in page text (partner download links)
		var urlMatches = html.match(/https?:\/\/[a-z0-9.-]+(:\d+)?\/[^\s<>"']+/gi);
		if (urlMatches) {
			var self = this;
			for (var u = 0; u < urlMatches.length; u++) {
				var candidate = urlMatches[u];
				if (self._isJunkUrl(candidate)) continue;
				if (candidate.indexOf("#") === 0) continue;
				// Prefer URLs with file extensions
				var candidateLower = candidate.toLowerCase();
				if (candidateLower.indexOf(".epub") !== -1 || candidateLower.indexOf(".pdf") !== -1 ||
					candidateLower.indexOf("/d3/") !== -1 || candidateLower.indexOf("/download") !== -1) {
					cinder.log("[AA] Found via URL scan");
					return candidate;
				}
			}
		}

		return null;
	},
};
