var FreeMagazinesSource = {};

FreeMagazinesSource.id = "freemagazines-hotfix";
FreeMagazinesSource.name = "FreeMagazines.top (Hotfix)";
FreeMagazinesSource.version = "1.1.5-cinder-hotfix";
FreeMagazinesSource.icon = "\uD83D\uDCF0";
FreeMagazinesSource.description = "Browse and search PDF magazines from FreeMagazines.top with on-device resolution.";
FreeMagazinesSource.contentType = "magazine";
FreeMagazinesSource.contentTypes = ["magazine"];
FreeMagazinesSource.capabilities = {
	search: true,
	discover: true,
	download: false,
	resolve: true,
	searchDownloads: true,
	manga: false,
};

FreeMagazinesSource.BASE_URL = "https://freemagazines.top";
FreeMagazinesSource.PROXY_RESOLVE_URL = "https://fmproxy.tonystegall.net/resolve";

FreeMagazinesSource.CATEGORIES = [
	{ id: "architecture-real-estate-building", title: "Architecture & Real Estate" },
	{ id: "audio-music", title: "Audio & Music" },
	{ id: "aviation-aeronautics-aerospace", title: "Aviation & Aerospace" },
	{ id: "boating-yachting", title: "Boating & Yachting" },
	{ id: "cars-automobiles", title: "Automotive" },
	{ id: "computers-hardwares-softwares", title: "Computers & Software" },
	{ id: "daily-weekly-newspapers", title: "Newspapers" },
	{ id: "digital-electronics", title: "Digital & Electronics" },
	{ id: "fashion-luxury-lifestyle-celebrities", title: "Fashion & Lifestyle" },
	{ id: "finances-businesses-economics", title: "Finance & Business" },
	{ id: "fitness-health-wellbeing", title: "Fitness & Health" },
	{ id: "food-cooking-baking-diet-recipes", title: "Food & Cooking" },
	{ id: "gaming-games", title: "Gaming" },
	{ id: "gardening", title: "Gardening" },
	{ id: "history", title: "History" },
	{ id: "hobby-and-leisure", title: "Hobbies & Leisure" },
	{ id: "internet-security-networks-programmation-ai", title: "Internet & Security" },
	{ id: "interiors-homes-decors-designs", title: "Home & Design" },
	{ id: "journalism-writing-culture", title: "Writing & Culture" },
	{ id: "knitting-sewing-crafting-quilting-beading", title: "Knitting & Crafts" },
	{ id: "miniature-modelling-magazines", title: "Miniature & Modelling" },
	{ id: "mobiles-apps-android-iphone-ios-smart-devices", title: "Mobile & Smart Devices" },
	{ id: "motorcycles-bikes", title: "Motorcycles & Bikes" },
	{ id: "movies-media-tv-shows-entertainment", title: "Movies & TV" },
	{ id: "pets-animals", title: "Pets & Animals" },
	{ id: "photography-photoshop-painting-arts-graphics", title: "Photography & Art" },
	{ id: "politics-current-affairs", title: "Politics & Current Affairs" },
	{ id: "ships-magazines", title: "Marine & Nautical" },
	{ id: "sports", title: "Sports" },
	{ id: "technology-engineering-sciences-artificial-intelligence", title: "Science & Technology" },
	{ id: "train-railway", title: "Train & Railway" },
	{ id: "travel-recreation-tourism-outdoors-adventures", title: "Travel & Outdoors" },
	{ id: "trucks-magazines", title: "Trucks & Commercial" },
	{ id: "womens-magazines", title: "Women's Interest" },
	{ id: "woodcraft-woodworking-woodcarving", title: "Woodworking" },
];

FreeMagazinesSource._headers = function() {
	return {
		"User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": this.BASE_URL + "/",
	};
};

FreeMagazinesSource._decode = function(text) {
	if (!text) return "";
	return String(text)
		.replace(/&#039;/g, "'")
		.replace(/&#8211;/g, "\u2013")
		.replace(/&#8212;/g, "\u2014")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&rsquo;/g, "\u2019")
		.replace(/&hellip;/g, "\u2026")
		.replace(/&nbsp;/g, " ")
		.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();
};

FreeMagazinesSource._slugToFileName = function(title) {
	var safe = String(title || "magazine")
		.replace(/[\\/:*?"<>|]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return (safe || "magazine") + ".pdf";
};

FreeMagazinesSource._normalizeUrl = function(url) {
	return String(url || "")
		.replace(/\\u0026/g, "&")
		.replace(/\\\//g, "/")
		.replace(/&amp;/g, "&")
		.replace(/[),.;]+$/g, "")
		.trim();
};

FreeMagazinesSource._parseListings = function(html) {
	var self = this;
	var results = [];
	var seen = {};
	var doc = cinder.parseHTML(html || "");

	doc.querySelectorAll("h2 a").forEach(function(link) {
		var href = link.attr("href") || "";
		if (!href || href.indexOf(self.BASE_URL) !== 0) return;
		if (href.indexOf("/category/") >= 0 || href.indexOf("/page/") >= 0 || href.indexOf("/wp-") >= 0) return;
		if (seen[href]) return;
		seen[href] = true;

		var title = self._decode(link.text());
		if (!title) return;

		var cover = "";
		var pos = html.indexOf(href);
		if (pos >= 0) {
			var chunk = html.substring(Math.max(0, pos - 1400), pos + 700);
			var imgMatch = chunk.match(/https:\/\/freemagazines\.top\/wp-content\/uploads\/[^"'<>\s]+\.(?:webp|jpg|jpeg|png)/i);
			if (imgMatch) cover = imgMatch[0];
		}

		results.push({
			id: href,
			title: title,
			author: "Magazine",
			cover: cover,
			url: href,
			format: "pdf",
			source: self.name,
			extra: { articleUrl: href },
		});
	});

	return results;
};

FreeMagazinesSource._extractLimeWireUrl = function(html) {
	var doc = cinder.parseHTML(html || "");
	var links = doc.querySelectorAll("a[href]");
	for (var i = 0; i < links.length; i++) {
		var href = links[i].attr("href") || "";
		if (href.indexOf("https://limewire.com/d/") === 0 || href.indexOf("http://limewire.com/d/") === 0) {
			return this._normalizeUrl(href);
		}
	}
	var match = String(html || "").match(/https?:\/\/limewire\.com\/d\/[A-Za-z0-9]+(?:#[A-Za-z0-9_\-]+)?/);
	return match ? this._normalizeUrl(match[0]) : "";
};

FreeMagazinesSource._getHeader = function(headers, name) {
	var target = String(name || "").toLowerCase();
	headers = headers || {};
	for (var key in headers) {
		if (Object.prototype.hasOwnProperty.call(headers, key) && String(key).toLowerCase() === target) {
			return headers[key];
		}
	}
	return "";
};

FreeMagazinesSource._cookieHeaderFromSetCookie = function(headers) {
	var raw = this._getHeader(headers, "set-cookie");
	if (!raw) return "";
	var parts = Array.isArray(raw) ? raw : [String(raw)];
	var cookies = {};
	var wanted = /(?:^|,\s*)((?:production_access_token|__csrf_[A-Za-z0-9_]+|__cacheId|lmwr_client_id_apilimewirecom)=([^;,\s]*))/g;
	for (var i = 0; i < parts.length; i++) {
		var text = String(parts[i] || "");
		var match;
		while ((match = wanted.exec(text))) {
			var pair = match[1];
			var eq = pair.indexOf("=");
			if (eq <= 0) continue;
			var name = pair.substring(0, eq);
			var value = pair.substring(eq + 1);
			if (value) cookies[name] = value;
		}
	}
	return Object.keys(cookies)
		.map(function(name) { return name + "=" + cookies[name]; })
		.join("; ");
};

FreeMagazinesSource._decodeRouteHtml = function(html) {
	return String(html || "")
		.replace(/\\"/g, '"')
		.replace(/\\u0026/g, "&")
		.replace(/\\\//g, "/");
};

FreeMagazinesSource._extractLimeWireDownloadRequest = function(html) {
	var decoded = this._decodeRouteHtml(html);
	var uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
	var pair = decoded.match(new RegExp('"(' + uuid + ')","originalSharingBucketId","(' + uuid + ')"'));
	var selfCsrf = decoded.match(/"selfCsrf","([^"]+)"/);
	var fileName = decoded.match(/"name","([^"]+\.(?:pdf|epub|cbz|cbr))"/i);
	if (!pair || !selfCsrf) return null;
	return {
		contentItemId: pair[1],
		bucketId: pair[2],
		csrfToken: selfCsrf[1],
		fileName: fileName ? this._decode(fileName[1]) : "",
	};
};

FreeMagazinesSource._resolveLimeWireApi = async function(limeUrl, request, cookieHeader) {
	if (!request || !request.bucketId || !request.contentItemId || !request.csrfToken) return "";
	var apiUrl = "https://api.limewire.com/sharing/download/" + request.bucketId;
	var body = JSON.stringify({
		contentItems: [{ id: request.contentItemId }],
	});
	var headers = {
		"User-Agent": this._headers()["User-Agent"],
		"Accept": "application/json, text/plain, */*",
		"Content-Type": "application/json",
		"Origin": "https://limewire.com",
		"Referer": String(limeUrl || "").replace(/#.*$/, ""),
		"x-csrf-token": request.csrfToken,
	};
	if (cookieHeader) headers.Cookie = cookieHeader;

	var response = await cinder.fetch(apiUrl, {
		method: "POST",
		headers: headers,
		body: body,
		timeout: 20000,
	});
	if (!response || response.status !== 200) {
		cinder.warn("[FreeMagazines] LimeWire API resolve failed with status " + (response ? response.status : 0));
		return "";
	}
	return this._pickDownloadUrl(response.data || "");
};

FreeMagazinesSource._findUrls = function(value, out) {
	if (value === null || value === undefined) return;
	if (typeof value === "string") {
		var re = /https?:\/\/[^"'\s\\<>]+/g;
		var m;
		while ((m = re.exec(value))) out.push(this._normalizeUrl(m[0]));
		return;
	}
	if (Array.isArray(value)) {
		for (var i = 0; i < value.length; i++) this._findUrls(value[i], out);
		return;
	}
	if (typeof value === "object") {
		for (var key in value) {
			if (Object.prototype.hasOwnProperty.call(value, key)) {
				this._findUrls(value[key], out);
			}
		}
	}
};

FreeMagazinesSource._pickDownloadUrl = function(capturedData) {
	var payload = capturedData;
	try {
		payload = JSON.parse(capturedData);
	} catch (err) {}

	var body = payload && payload.body ? payload.body : payload;
	try {
		body = typeof body === "string" ? JSON.parse(body) : body;
	} catch (err2) {}

	var urls = [];
	this._findUrls(body, urls);
	if (payload && payload.url) this._findUrls(payload.url, urls);

	var filtered = urls.filter(function(url) {
		var lower = String(url || "").toLowerCase();
		if (!lower) return false;
		if (lower.indexOf("api.limewire.com/sharing/download/") >= 0) return false;
		if (lower.indexOf("limewire.com/d/") >= 0) return false;
		if (lower.indexOf("limewire.com/") >= 0 && lower.indexOf(".pdf") < 0) return false;
		return true;
	});

	var pdf = filtered.find(function(url) {
		return String(url).toLowerCase().indexOf(".pdf") >= 0;
	});
	return pdf || filtered[0] || "";
};

FreeMagazinesSource.search = async function(query, page) {
	try {
		var url = this.BASE_URL + "/?s=" + encodeURIComponent(query || "");
		var response = await cinder.fetch(url, {
			headers: this._headers(),
			timeout: 20000,
		});
		if (!response || response.status !== 200) return [];
		return this._parseListings(response.data || "");
	} catch (err) {
		cinder.warn("[FreeMagazines] search failed: " + (err && err.message ? err.message : String(err)));
		return [];
	}
};

FreeMagazinesSource.getDiscoverSections = async function() {
	return this.CATEGORIES.map(function(category) {
		return { id: category.id, title: category.title, icon: "\uD83D\uDCF0" };
	});
};

FreeMagazinesSource.getDiscoverItems = async function(sectionId, page) {
	var p = (page || 0) + 1;
	try {
		var url = p === 1
			? this.BASE_URL + "/category/" + sectionId + "/"
			: this.BASE_URL + "/category/" + sectionId + "/page/" + p + "/";
		var response = await cinder.fetch(url, {
			headers: this._headers(),
			timeout: 20000,
		});
		if (!response || response.status !== 200) return [];
		return this._parseListings(response.data || "");
	} catch (err) {
		cinder.warn("[FreeMagazines] discover failed: " + (err && err.message ? err.message : String(err)));
		return [];
	}
};

FreeMagazinesSource.resolve = async function(item) {
	var pageUrl = (item && item.extra && item.extra.articleUrl) || (item && item.url) || "";
	if (!pageUrl) throw new Error("No article URL.");

	cinder.log("[FreeMagazines] Resolving article: " + pageUrl);
	var article = await cinder.fetch(pageUrl, {
		headers: this._headers(),
		timeout: 20000,
	});

	var html = article && article.data ? article.data : "";
	var limeUrl = this._extractLimeWireUrl(html);

	if (!limeUrl) {
		cinder.log("[FreeMagazines] LimeWire link not in static HTML; trying browser-rendered article page.");
		var browserArticle = await cinder.fetchBrowser(pageUrl, {
			headers: Object.assign({}, this._headers(), {
				"X-Cinder-Suppress-Interactive": "1",
				"X-Cinder-Min-Wait-Ms": "8000",
				"X-Cinder-Max-Wait-Ms": "16000",
				"X-Cinder-Wake-Page": "1",
			}),
		});
		html = browserArticle && browserArticle.data ? browserArticle.data : "";
		limeUrl = this._extractLimeWireUrl(html);
	}

	if (!limeUrl) throw new Error("No LimeWire download link found on the magazine page.");

	var fileName = this._slugToFileName(item && item.title);
	var fileUrl = "";

	cinder.log("[FreeMagazines] Resolving LimeWire route data: " + limeUrl);
	var limePage = await cinder.fetch(limeUrl, {
		headers: {
			"User-Agent": this._headers()["User-Agent"],
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"Referer": this.BASE_URL + "/",
		},
		timeout: 20000,
	});
	var limeHtml = limePage && limePage.data ? limePage.data : "";
	var downloadRequest = this._extractLimeWireDownloadRequest(limeHtml);
	var cookieHeader = this._cookieHeaderFromSetCookie(limePage && limePage.headers);
	if (downloadRequest) {
		if (downloadRequest.fileName) {
			fileName = this._slugToFileName(downloadRequest.fileName.replace(/\.(?:pdf|epub|cbz|cbr)$/i, ""));
		}
		fileUrl = await this._resolveLimeWireApi(limeUrl, downloadRequest, cookieHeader);
	}

	if (!fileUrl && downloadRequest) {
		cinder.log("[FreeMagazines] Retrying LimeWire API after browser cookie priming.");
		await cinder.fetchBrowser(limeUrl, {
			headers: {
				"Referer": this.BASE_URL + "/",
				"X-Cinder-Suppress-Interactive": "1",
				"X-Cinder-Min-Wait-Ms": "1200",
				"X-Cinder-Max-Wait-Ms": "5000",
			},
		});
		fileUrl = await this._resolveLimeWireApi(limeUrl, downloadRequest, "");
	}

	if (!fileUrl) {
		cinder.log("[FreeMagazines] Capturing LimeWire download API as fallback: " + limeUrl);
		var captured = await cinder.fetchBrowserCaptured(limeUrl, {
			headers: {
				"Referer": this.BASE_URL + "/",
				"X-Cinder-Capture-Url-Includes": "api.limewire.com/sharing/download/",
				"X-Cinder-Max-Wait-Ms": "12000",
				"X-Cinder-Suppress-Interactive": "1",
			},
		});
		fileUrl = captured && captured.data ? this._pickDownloadUrl(captured.data) : "";
	}

	if (!fileUrl) {
		cinder.warn("[FreeMagazines] Browser capture did not expose a file URL; trying browser binary fallback.");
		var binary = await cinder.fetchBrowserBinary(limeUrl, {
			headers: {
				"Referer": this.BASE_URL + "/",
				"X-Cinder-Browser-Context-Url": limeUrl,
			},
		});
		if (binary && binary.data) {
			if (typeof binary.data === "string" && binary.data.indexOf("URL:") === 0) {
				fileUrl = this._normalizeUrl(binary.data.substring(4));
			} else if (String(binary.data).substring(0, 4) === "JVBE") {
				return {
					url: "data:application/pdf;base64," + binary.data,
					fileName: this._slugToFileName(item && item.title),
				};
			}
		}
	}

	if (!fileUrl) {
		cinder.warn("[FreeMagazines] On-device resolve failed; using temporary proxy fallback.");
		return {
			url: this.PROXY_RESOLVE_URL + "?url=" + encodeURIComponent(pageUrl),
			fileName: fileName,
			headers: {
				"User-Agent": this._headers()["User-Agent"],
			},
		};
	}

	return {
		url: fileUrl,
		fileName: fileName,
		headers: {
			"Referer": limeUrl,
			"User-Agent": this._headers()["User-Agent"],
		},
	};
};

__cinderExport = FreeMagazinesSource;
