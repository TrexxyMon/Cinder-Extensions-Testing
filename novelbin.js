var NovelBinSource = {};

NovelBinSource.id = "novelbin";
NovelBinSource.name = "NovelBin";
NovelBinSource.version = "0.1.2-cinder";
NovelBinSource.icon = "NB";
NovelBinSource.description = "Search and build public chaptered web novels from NovelBin into EPUB on device. No debrid required.";
NovelBinSource.contentType = "books";
NovelBinSource.contentTypes = ["webnovel", "ebook"];
NovelBinSource.contentSubtypes = ["webFiction", "lightNovel", "wuxia", "xianxia", "xuanhuan"];
NovelBinSource.capabilities = {
	search: true,
	discover: false,
	download: false,
	resolve: false,
	bookChapters: true,
	manga: false,
};

NovelBinSource.BASE_URL = "https://www.novelbin.cc";

NovelBinSource.getSettings = function() {
	return [
		{
			id: "base_url",
			label: "Base URL",
			type: "text",
			defaultValue: "https://www.novelbin.cc",
			placeholder: "https://www.novelbin.cc",
		},
	];
};

NovelBinSource._activeBaseUrl = "";

NovelBinSource._normalizeBaseUrl = function(value) {
	var base = String(value || "").trim();
	if (!base) return this.BASE_URL;
	if (!/^https?:\/\//i.test(base)) base = "https://" + base;
	return base.replace(/\/+$/, "");
};

NovelBinSource._getBaseUrl = async function() {
	var configured = "";
	try {
		if (typeof cinder !== "undefined" && cinder.store && cinder.store.get) {
			configured = await cinder.store.get("base_url");
		}
	} catch (_) {}
	this._activeBaseUrl = this._normalizeBaseUrl(configured || this.BASE_URL);
	return this._activeBaseUrl;
};

NovelBinSource._baseUrl = function() {
	return this._activeBaseUrl || this.BASE_URL;
};

NovelBinSource._headers = function(referer) {
	return {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": referer || this.BASE_URL + "/",
	};
};

NovelBinSource._browserHeaders = function(referer, expectedKind) {
	var headers = this._headers(referer);
	headers["X-Cinder-Suppress-Interactive"] = "1";
	headers["X-Cinder-Visible-Layout"] = "1";
	headers["X-Cinder-Wake-Page"] = "1";
	headers["X-Cinder-Min-Wait-Ms"] = "4500";
	headers["X-Cinder-Max-Wait-Ms"] = "18000";
	if (expectedKind === "search") headers["X-Cinder-Wait-For-Selector"] = "a[href*='/book/'], a[href*='/b/'], a[href*='/novel-book/']";
	if (expectedKind === "chapters") headers["X-Cinder-Wait-For-Selector"] = "a[href*='chapter']";
	if (expectedKind === "chapter") headers["X-Cinder-Wait-For-Selector"] = "#chr-content, #chapter-content, .chapter-content";
	return headers;
};

NovelBinSource._looksBlockedHtml = function(html) {
	var text = String(html || "").toLowerCase();
	return text.indexOf("cf-chl") >= 0 ||
		text.indexOf("just a moment") >= 0 ||
		text.indexOf("checking your browser") >= 0 ||
		text.indexOf("verify you are human") >= 0 ||
		text.indexOf("security challenge") >= 0 ||
		text.indexOf("ddos-guard") >= 0 ||
		text.indexOf("captcha") >= 0 ||
		text.indexOf("error code: 522") >= 0 ||
		text.indexOf("connection timed out") >= 0;
};

NovelBinSource._hasExpectedHtml = function(html, expectedKind) {
	if (!expectedKind) return String(html || "").length > 100;
	if (expectedKind === "search") return this._parseSearchResults(html).length > 0 || /href=["'][^"']*\/(?:book|b|novel-book)\/[^"']+/i.test(String(html || ""));
	if (expectedKind === "chapters") return this._parseChapterLinks(html, this._baseUrl() + "/book/placeholder").length > 0 || /href=["'][^"']*chapter/i.test(String(html || ""));
	if (expectedKind === "chapter") return !!this._extractContentHtml(html);
	return String(html || "").length > 100;
};

NovelBinSource._sleep = function(ms) {
	if (typeof setTimeout !== "function") return Promise.resolve();
	return new Promise(function(resolve) {
		setTimeout(resolve, ms);
	});
};

NovelBinSource._decode = function(text) {
	var value = String(text || "");
	if (typeof cinder !== "undefined" && cinder.normalizeText) {
		return cinder.normalizeText(value);
	}
	return value
		.replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(parseInt(code, 10)); })
		.replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); })
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&rsquo;/g, "'")
		.replace(/&lsquo;/g, "'")
		.replace(/&ldquo;/g, '"')
		.replace(/&rdquo;/g, '"')
		.replace(/&ndash;/g, "-")
		.replace(/&mdash;/g, "-")
		.replace(/&hellip;/g, "...")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
};

NovelBinSource._stripTags = function(html) {
	return this._decode(String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]*>/g, " "));
};

NovelBinSource._absoluteUrl = function(url, baseUrl) {
	var value = this._decode(url || "").trim();
	var base = baseUrl || this._baseUrl() + "/";
	if (!value) return "";
	if (/^https?:\/\//i.test(value)) return value;
	if (value.indexOf("//") === 0) return "https:" + value;
	if (typeof cinder !== "undefined" && cinder.resolveUrl) {
		return cinder.resolveUrl(value, base);
	}
	var root = (String(base).match(/^https?:\/\/[^\/]+/i) || [this._baseUrl()])[0];
	if (value.charAt(0) === "/") return root + value;
	return root + "/" + value.replace(/^\/+/, "");
};

NovelBinSource._fetchHtml = async function(url, referer, expectedKind) {
	var response = null;
	var lastStatus = 0;
	var lastLength = 0;
	for (var attempt = 1; attempt <= 3; attempt++) {
		try {
			response = await cinder.fetch(url, {
				headers: this._headers(referer),
				timeout: 10000,
			});
			lastStatus = response && response.status ? Number(response.status) : 0;
			var directHtml = response && response.data != null ? String(response.data || "") : "";
			lastLength = directHtml.length || lastLength;
			if (response && response.status >= 200 && response.status < 300 && directHtml && !this._looksBlockedHtml(directHtml) && this._hasExpectedHtml(directHtml, expectedKind)) {
				return directHtml;
			}
			if (lastStatus >= 520 && lastStatus <= 524) {
				break;
			}
		} catch (_) {}

		if (cinder.fetchBrowser && lastStatus !== 0) {
			response = await cinder.fetchBrowser(url, {
				headers: this._browserHeaders(referer, expectedKind),
				timeout: 18000,
			});
			lastStatus = response && response.status ? Number(response.status) : lastStatus;
			var browserHtml = response && response.data != null ? String(response.data || "") : "";
			lastLength = browserHtml.length || lastLength;
			if (response && response.status >= 200 && response.status < 300 && browserHtml && !this._looksBlockedHtml(browserHtml) && this._hasExpectedHtml(browserHtml, expectedKind)) {
				return browserHtml;
			}
		}

		if (!lastStatus && !lastLength) {
			break;
		}

		if (attempt < 3 && (!lastStatus || lastStatus === 429 || lastStatus >= 500)) {
			await this._sleep(900 * attempt);
			continue;
		}
		break;
	}

	var base = this._baseUrl();
	var reason = lastStatus ? "HTTP " + lastStatus : "connection failed";
	if (lastStatus >= 500 || lastStatus === 0 || lastLength < 100) {
		throw new Error("NovelBin did not return a usable page from " + base + " (" + reason + "). If this host is down for your network, set a working NovelBin mirror in the extension settings.");
	}
	throw new Error("NovelBin request failed (" + reason + "): " + url);
};

NovelBinSource._searchUrl = function(query, page) {
	var url = this._baseUrl() + "/search?keyword=" + encodeURIComponent(query || "");
	if (page && page > 0) url += "&page=" + encodeURIComponent(page + 1);
	return url;
};

NovelBinSource._bookPath = function(value) {
	var raw = String(value || "").trim();
	if (!raw) return "";
	var match = raw.match(/https?:\/\/[^\/]+(\/(?:book|b|novel-book)\/[^?#]+)/i);
	if (match) return match[1].replace(/\/+$/, "");
	match = raw.match(/(\/(?:book|b|novel-book)\/[^?#]+)/i);
	if (match) return match[1].replace(/\/+$/, "");
	if (/^(?:book|b|novel-book)\//i.test(raw)) return "/" + raw.replace(/\/+$/, "");
	if (/^[a-z0-9][a-z0-9-]+$/i.test(raw)) return "/book/" + raw;
	return "";
};

NovelBinSource._bookUrl = function(bookId) {
	var path = this._bookPath(bookId);
	if (!path) throw new Error("Invalid NovelBin book ID: " + bookId);
	path = path.replace(/\/(?:chapters?|chapter-\d+.*)$/i, "");
	return this._baseUrl() + path;
};

NovelBinSource._chapterUrl = function(chapterId) {
	var raw = String(chapterId || "").trim();
	if (/^https?:\/\//i.test(raw)) return raw;
	if (raw.charAt(0) === "/") return this._baseUrl() + raw;
	return this._baseUrl() + "/" + raw.replace(/^\/+/, "");
};

NovelBinSource._slugFromBookPath = function(bookPath) {
	var parts = String(bookPath || "").split("/").filter(Boolean);
	return parts.length ? parts[parts.length - 1] : "";
};

NovelBinSource._titleFromPath = function(path) {
	var slug = this._slugFromBookPath(path);
	return this._decode(slug.replace(/-/g, " "));
};

NovelBinSource._extractMeta = function(html, name) {
	var key = String(name || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
	var patterns = [
		new RegExp("<meta[^>]+property=[\"']" + key + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']" + key + "[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+name=[\"']" + key + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
		new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+name=[\"']" + key + "[\"'][^>]*>", "i"),
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = String(html || "").match(patterns[i]);
		if (match && match[1]) return this._decode(match[1]);
	}
	return "";
};

NovelBinSource._extractImageNear = function(html, index, pageUrl) {
	var start = Math.max(0, index - 1500);
	var end = Math.min(String(html || "").length, index + 1500);
	var chunk = String(html || "").slice(start, end);
	var imgMatch = chunk.match(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i);
	return imgMatch && imgMatch[1] ? this._absoluteUrl(imgMatch[1], pageUrl) : "";
};

NovelBinSource._extractAuthorNear = function(html, index) {
	var chunk = String(html || "").slice(Math.max(0, index - 700), Math.min(String(html || "").length, index + 1200));
	var authorMatch = chunk.match(/class=["'][^"']*author[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p)>/i)
		|| chunk.match(/(?:Author|Author\(s\))\s*:?<\/?[^>]*>\s*([\s\S]{0,220}?)(?:<\/(?:span|div|p|li)>)/i);
	return authorMatch ? this._stripTags(authorMatch[1]) : "";
};

NovelBinSource._chapterCountNear = function(html, index) {
	var chunk = String(html || "").slice(Math.max(0, index - 700), Math.min(String(html || "").length, index + 1500));
	var countMatch = chunk.match(/([\d,]+)\s+chapters?/i);
	return countMatch ? countMatch[1].replace(/,/g, "") + " chapters" : "";
};

NovelBinSource._parseSearchResults = function(html) {
	var body = String(html || "");
	var cutoff = body.search(/(?:popular|recommended|latest)[\s\S]{0,120}novels/i);
	if (cutoff > 0) body = body.slice(0, cutoff);

	var results = [];
	var seen = {};
	var anchorRe = /<a\b([^>]*)href=["']([^"']*\/(?:book|b|novel-book)\/[^"'#?]+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
	var match;
	while ((match = anchorRe.exec(body)) !== null) {
		var href = match[2] || "";
		if (/\/chapter[-\/]/i.test(href) || /\/chapters?$/i.test(href)) continue;
		var bookPath = this._bookPath(href);
		if (!bookPath || seen[bookPath]) continue;
		var attrs = String((match[1] || "") + " " + (match[3] || ""));
		var titleAttr = (attrs.match(/\btitle=["']([^"']+)["']/i) || [])[1] || "";
		var title = this._stripTags(titleAttr || match[4] || "") || this._titleFromPath(bookPath);
		if (!title || /^(?:read now|chapters?|novel|home)$/i.test(title)) continue;

		seen[bookPath] = true;
		results.push({
			id: bookPath,
			title: title,
			author: this._extractAuthorNear(body, match.index),
			cover: this._extractImageNear(body, match.index, this._baseUrl() + "/"),
			url: this._baseUrl() + bookPath,
			format: "epub",
			size: this._chapterCountNear(body, match.index),
			source: "NovelBin",
			extra: {
				bookPath: bookPath,
			},
		});
	}
	return results;
};

NovelBinSource.search = async function(query, page) {
	if (!query || !String(query).trim()) return [];
	await this._getBaseUrl();
	var html = await this._fetchHtml(this._searchUrl(String(query).trim(), page || 0), this._baseUrl() + "/", "search");
	return this._parseSearchResults(html).slice(0, 40);
};

NovelBinSource._extractTitleFromBookPage = function(html, fallback) {
	var title = this._extractMeta(html, "og:title");
	if (title) return title.replace(/\s+-\s+NovelBin\s*$/i, "").trim();
	var match = String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
		|| String(html || "").match(/class=["'][^"']*(?:novel-title|title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|h2|h3|div)>/i);
	return match ? this._stripTags(match[1]) : fallback;
};

NovelBinSource._chapterNumber = function(url, title, fallback) {
	var value = String(url || "") + " " + String(title || "");
	var match = value.match(/chapter[-\s_]*(\d+(?:\.\d+)?)/i)
		|| value.match(/\bch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i);
	var number = match ? parseFloat(match[1]) : NaN;
	return isNaN(number) ? fallback : number;
};

NovelBinSource._parseChapterLinks = function(html, bookUrl) {
	var chapters = [];
	var seen = {};
	var bookPath = this._bookPath(bookUrl);
	var slug = this._slugFromBookPath(bookPath);
	var anchorRe = /<a\b([^>]*)href=["']([^"']*\/(?:book|b|novel-book)\/[^"']*chapter[^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi;
	var match;
	while ((match = anchorRe.exec(String(html || ""))) !== null) {
		var href = match[2] || "";
		if (slug && href.indexOf(slug) === -1) continue;
		var chapterUrl = this._absoluteUrl(href, bookUrl);
		if (!chapterUrl || seen[chapterUrl]) continue;
		var attrs = String((match[1] || "") + " " + (match[3] || ""));
		var titleAttr = (attrs.match(/\btitle=["']([^"']+)["']/i) || [])[1] || "";
		var title = this._stripTags(titleAttr || match[4] || "") || "Chapter " + (chapters.length + 1);
		if (/^(?:previous|next|read now)$/i.test(title)) continue;
		var chapterNumber = this._chapterNumber(chapterUrl, title, chapters.length + 1);
		var dateMatch = String(match[0]).match(/datetime=["']([^"']+)["']/i);
		seen[chapterUrl] = true;
		chapters.push({
			id: chapterUrl,
			title: title,
			index: chapterNumber,
			url: chapterUrl,
			datePublished: dateMatch && dateMatch[1] ? dateMatch[1] : undefined,
		});
	}
	chapters.sort(function(a, b) {
		return (Number(a.index) || 0) - (Number(b.index) || 0);
	});
	for (var i = 0; i < chapters.length; i++) {
		chapters[i].index = i + 1;
	}
	return chapters;
};

NovelBinSource._lastChapterListPage = function(html) {
	var maxPage = 1;
	var regex = /[?&]page=(\d+)/gi;
	var match;
	while ((match = regex.exec(String(html || ""))) !== null) {
		var page = parseInt(match[1], 10);
		if (!isNaN(page) && page > maxPage) maxPage = page;
	}
	return Math.min(maxPage, 100);
};

NovelBinSource._mergeChapters = function(target, additions) {
	var seen = {};
	for (var i = 0; i < target.length; i++) {
		seen[target[i].url || target[i].id] = true;
	}
	for (var j = 0; j < additions.length; j++) {
		var key = additions[j].url || additions[j].id;
		if (!key || seen[key]) continue;
		seen[key] = true;
		target.push(additions[j]);
	}
	target.sort(function(a, b) {
		return (Number(a.index) || 0) - (Number(b.index) || 0);
	});
	for (var n = 0; n < target.length; n++) {
		target[n].index = n + 1;
	}
	return target;
};

NovelBinSource.getBookChapters = async function(bookId) {
	await this._getBaseUrl();
	var bookUrl = this._bookUrl(bookId);
	var html = await this._fetchHtml(bookUrl, this._baseUrl() + "/", "chapters");
	var chapters = this._parseChapterLinks(html, bookUrl);
	var lastPage = this._lastChapterListPage(html);
	for (var page = 2; page <= lastPage; page++) {
		var pageUrl = bookUrl.replace(/\/+$/, "") + "?page=" + page;
		this._mergeChapters(chapters, this._parseChapterLinks(await this._fetchHtml(pageUrl, bookUrl), bookUrl));
	}
	if (!chapters.length) {
		var chaptersUrl = bookUrl.replace(/\/+$/, "") + "/chapters";
		try {
			html = await this._fetchHtml(chaptersUrl, bookUrl, "chapters");
			chapters = this._parseChapterLinks(html, bookUrl);
			lastPage = this._lastChapterListPage(html);
			for (var chapterPage = 2; chapterPage <= lastPage; chapterPage++) {
				var chapterPageUrl = chaptersUrl + "?page=" + chapterPage;
				this._mergeChapters(chapters, this._parseChapterLinks(await this._fetchHtml(chapterPageUrl, bookUrl, "chapters"), bookUrl));
			}
		} catch (_) {}
	}
	if (!chapters.length) {
		throw new Error("NovelBin did not expose any chapter links for this novel.");
	}
	return chapters;
};

NovelBinSource._extractContentHtml = function(html) {
	var text = String(html || "");
	var patterns = [
		/<div\b[^>]*id=["']chr-content["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*(?:chr-nav|chapter-nav|nav-chapter|chapternav)[^"']*["']|<script|<\/section|<\/article)/i,
		/<div\b[^>]*id=["']chapter-content["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*(?:chr-nav|chapter-nav|nav-chapter|chapternav)[^"']*["']|<script|<\/section|<\/article)/i,
		/<div\b[^>]*class=["'][^"']*(?:chr-c|chapter-c|chapter-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*(?:chr-nav|chapter-nav|nav-chapter|chapternav)[^"']*["']|<script|<\/section|<\/article)/i,
		/<article\b[^>]*>([\s\S]*?)<\/article>/i,
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = text.match(patterns[i]);
		if (match && this._stripTags(match[1]).length > 200) return match[1];
	}
	return "";
};

NovelBinSource._titleFromChapterPage = function(html, fallbackUrl) {
	var match = String(html || "").match(/class=["'][^"']*(?:chr-title|chapter-title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|h2|span|div)>/i)
		|| String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	if (match) return this._stripTags(match[1]);
	var title = this._extractMeta(html, "og:title") || this._extractMeta(html, "twitter:title");
	if (title) return title.replace(/\s+-\s+NovelBin\s*$/i, "").trim();
	return this._titleFromPath(fallbackUrl || "Chapter");
};

NovelBinSource._sanitizeChapterHtml = function(html, pageUrl) {
	var cleaned = String(html || "");
	cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
	cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
	cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
	cleaned = cleaned.replace(/<ins[\s\S]*?<\/ins>/gi, "");
	cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
	cleaned = cleaned.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "");
	cleaned = cleaned.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
	cleaned = cleaned.replace(/javascript:/gi, "");
	return cleaned.replace(/(href|src)=(['"])([^'"]+)\2/gi, function(_, attr, quote, value) {
		if (!value || value.indexOf("data:") === 0 || value.indexOf("#") === 0) return attr + "=" + quote + value + quote;
		return attr + "=" + quote + NovelBinSource._absoluteUrl(value, pageUrl) + quote;
	});
};

NovelBinSource.getBookChapter = async function(chapterId) {
	await this._getBaseUrl();
	var chapterUrl = this._chapterUrl(chapterId);
	var html = await this._fetchHtml(chapterUrl, this._baseUrl() + "/", "chapter");
	var content = this._extractContentHtml(html);
	if (!content) {
		throw new Error("Could not locate NovelBin chapter content.");
	}
	return {
		id: chapterUrl,
		title: this._titleFromChapterPage(html, chapterUrl),
		url: chapterUrl,
		html: this._sanitizeChapterHtml(content, chapterUrl),
	};
};

__cinderExport = NovelBinSource;
