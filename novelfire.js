var NovelFireSource = {};

NovelFireSource.id = "novelfire";
NovelFireSource.name = "Novel Fire";
NovelFireSource.version = "0.1.0-cinder";
NovelFireSource.icon = "NF";
NovelFireSource.description = "Search and build public chaptered web novels from Novel Fire into EPUB on device. No debrid required.";
NovelFireSource.contentType = "books";
NovelFireSource.contentTypes = ["webnovel", "ebook"];
NovelFireSource.contentSubtypes = ["webFiction", "lightNovel", "wuxia", "xianxia", "xuanhuan"];
NovelFireSource.capabilities = {
	search: true,
	discover: false,
	download: false,
	resolve: false,
	bookChapters: true,
	manga: false,
};

NovelFireSource.BASE_URL = "https://novelfire.net";

NovelFireSource._headers = function(referer) {
	return {
		"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"Referer": referer || this.BASE_URL + "/",
	};
};

NovelFireSource._sleep = function(ms) {
	if (typeof setTimeout !== "function") return Promise.resolve();
	return new Promise(function(resolve) {
		setTimeout(resolve, ms);
	});
};

NovelFireSource._decode = function(text) {
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

NovelFireSource._stripTags = function(html) {
	return this._decode(String(html || "")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]*>/g, " "));
};

NovelFireSource._absoluteUrl = function(url, baseUrl) {
	var value = this._decode(url || "").trim();
	var base = baseUrl || this.BASE_URL + "/";
	if (!value) return "";
	if (/^https?:\/\//i.test(value)) return value;
	if (value.indexOf("//") === 0) return "https:" + value;
	if (typeof cinder !== "undefined" && cinder.resolveUrl) {
		return cinder.resolveUrl(value, base);
	}
	if (value.charAt(0) === "/") return this.BASE_URL + value;
	return this.BASE_URL + "/" + value.replace(/^\/+/, "");
};

NovelFireSource._fetchHtml = async function(url, referer) {
	var response = null;
	var lastStatus = 0;
	for (var attempt = 1; attempt <= 3; attempt++) {
		try {
			response = await cinder.fetch(url, {
				headers: this._headers(referer),
				timeout: 30000,
			});
			lastStatus = response && response.status ? Number(response.status) : 0;
			if (response && response.status >= 200 && response.status < 300 && response.data != null) {
				return String(response.data || "");
			}
		} catch (_) {}

		if (cinder.fetchBrowser) {
			response = await cinder.fetchBrowser(url, {
				headers: this._headers(referer),
				timeout: 35000,
			});
			lastStatus = response && response.status ? Number(response.status) : lastStatus;
			if (response && response.status >= 200 && response.status < 300 && response.data != null) {
				return String(response.data || "");
			}
		}

		if (attempt < 3 && (!lastStatus || lastStatus === 429 || lastStatus >= 500)) {
			await this._sleep(900 * attempt);
			continue;
		}
		break;
	}
	throw new Error("Novel Fire request failed" + (lastStatus ? " (HTTP " + lastStatus + ")" : "") + ": " + url);
};

NovelFireSource._searchUrl = function(query, page) {
	var url = this.BASE_URL + "/search?keyword=" + encodeURIComponent(query || "");
	if (page && page > 0) url += "&page=" + encodeURIComponent(page + 1);
	return url;
};

NovelFireSource._bookPath = function(value) {
	var raw = String(value || "").trim();
	if (!raw) return "";
	var match = raw.match(/https?:\/\/[^\/]+(\/book\/[^?#]+)/i);
	if (match) return match[1].replace(/\/+$/, "");
	match = raw.match(/(\/book\/[^?#]+)/i);
	if (match) return match[1].replace(/\/+$/, "");
	if (/^book\//i.test(raw)) return "/" + raw.replace(/\/+$/, "");
	if (/^[a-z0-9][a-z0-9-]+$/i.test(raw)) return "/book/" + raw;
	return "";
};

NovelFireSource._bookUrl = function(bookId) {
	var path = this._bookPath(bookId);
	if (!path) throw new Error("Invalid Novel Fire book ID: " + bookId);
	path = path.replace(/\/(?:chapters?|chapter-\d+.*)$/i, "");
	return this.BASE_URL + path;
};

NovelFireSource._chapterUrl = function(chapterId) {
	var raw = String(chapterId || "").trim();
	if (/^https?:\/\//i.test(raw)) return raw;
	if (raw.charAt(0) === "/") return this.BASE_URL + raw;
	return this.BASE_URL + "/" + raw.replace(/^\/+/, "");
};

NovelFireSource._slugFromPath = function(path) {
	var parts = String(path || "").split("/").filter(Boolean);
	return parts.length ? parts[parts.length - 1] : "";
};

NovelFireSource._extractMeta = function(html, name) {
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

NovelFireSource._parseSearchResults = function(html) {
	var body = String(html || "").split(/<section\b[^>]*class=["'][^"']*popular-novels/i)[0];
	var results = [];
	var seen = {};
	var itemRe = /<li\b[^>]*class=["'][^"']*novel-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
	var item;
	while ((item = itemRe.exec(body)) !== null) {
		var htmlItem = item[1] || "";
		var link = htmlItem.match(/<a\b([^>]*)href=["']([^"']*\/book\/[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/i);
		if (!link) continue;
		var bookPath = this._bookPath(link[2]);
		if (!bookPath || seen[bookPath]) continue;
		var attrs = String((link[1] || "") + " " + (link[3] || ""));
		var titleAttr = (attrs.match(/\btitle=["']([^"']+)["']/i) || [])[1] || "";
		var titleMatch = htmlItem.match(/class=["'][^"']*novel-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:h3|h4|div|span)>/i);
		var title = this._stripTags(titleAttr || (titleMatch && titleMatch[1]) || link[4]) || this._decode(this._slugFromPath(bookPath).replace(/-/g, " "));
		if (!title) continue;
		var imageMatch = htmlItem.match(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["'][^>]*>/i);
		var countMatch = htmlItem.match(/([\d,]+)\s+chapters?/i);
		seen[bookPath] = true;
		results.push({
			id: bookPath,
			title: title,
			author: "",
			cover: imageMatch && imageMatch[1] ? this._absoluteUrl(imageMatch[1], this.BASE_URL + "/") : "",
			url: this.BASE_URL + bookPath,
			format: "epub",
			size: countMatch ? countMatch[1].replace(/,/g, "") + " chapters" : "",
			source: "Novel Fire",
			extra: {
				bookPath: bookPath,
			},
		});
	}
	return results;
};

NovelFireSource.search = async function(query, page) {
	if (!query || !String(query).trim()) return [];
	var html = await this._fetchHtml(this._searchUrl(String(query).trim(), page || 0), this.BASE_URL + "/");
	return this._parseSearchResults(html).slice(0, 40);
};

NovelFireSource._chapterNumber = function(url, title, fallback) {
	var value = String(url || "") + " " + String(title || "");
	var match = value.match(/chapter[-\s_]*(\d+(?:\.\d+)?)/i)
		|| value.match(/\bch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i);
	var number = match ? parseFloat(match[1]) : NaN;
	return isNaN(number) ? fallback : number;
};

NovelFireSource._chapterCountFromHtml = function(html) {
	var text = String(html || "");
	var patterns = [
		/A\s+total\s+of\s+([\d,]+)\s+chapters/i,
		/([\d,]+)\s*<\/strong>\s*<small>\s*Chapters\s*<\/small>/i,
		/chapterNumber\s*&&\s*chapterNumber\s*<=\s*([\d,]+)/i,
		/([\d,]+)\s+chapters?\s+have\s+been/i,
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = text.match(patterns[i]);
		if (match && match[1]) {
			var count = parseInt(String(match[1]).replace(/,/g, ""), 10);
			if (!isNaN(count) && count > 0) return Math.min(count, 10000);
		}
	}
	return 0;
};

NovelFireSource._parseChapterLinks = function(html, bookUrl) {
	var chapters = [];
	var seen = {};
	var bookPath = this._bookPath(bookUrl);
	var slug = this._slugFromPath(bookPath);
	var anchorRe = /<a\b([^>]*)href=["']([^"']*\/book\/[^"']*\/chapter-[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
	var match;
	while ((match = anchorRe.exec(String(html || ""))) !== null) {
		var href = match[2] || "";
		if (slug && href.indexOf(slug) === -1) continue;
		var chapterUrl = this._absoluteUrl(href, bookUrl);
		if (!chapterUrl || seen[chapterUrl]) continue;
		var attrs = String((match[1] || "") + " " + (match[3] || ""));
		var titleAttr = (attrs.match(/\btitle=["']([^"']+)["']/i) || [])[1] || "";
		var titleMatch = String(match[0]).match(/class=["'][^"']*chapter-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:strong|span|div)>/i);
		var title = this._stripTags(titleAttr || (titleMatch && titleMatch[1]) || match[4]) || "Chapter " + (chapters.length + 1);
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

NovelFireSource._expandNumericChapterList = function(bookUrl, knownChapters, totalCount) {
	if (!totalCount || totalCount <= knownChapters.length) return knownChapters;
	var knownByNumber = {};
	for (var i = 0; i < knownChapters.length; i++) {
		var number = this._chapterNumber(knownChapters[i].url || knownChapters[i].id, knownChapters[i].title, 0);
		if (number > 0) knownByNumber[String(number)] = knownChapters[i];
	}
	var chapters = [];
	for (var n = 1; n <= totalCount; n++) {
		var known = knownByNumber[String(n)];
		var url = bookUrl.replace(/\/+$/, "") + "/chapter-" + n;
		chapters.push({
			id: known && known.id ? known.id : url,
			title: known && known.title ? known.title : "Chapter " + n,
			index: n,
			url: known && known.url ? known.url : url,
			datePublished: known && known.datePublished ? known.datePublished : undefined,
		});
	}
	return chapters;
};

NovelFireSource._lastChapterListPage = function(html) {
	var maxPage = 1;
	var regex = /[?&]page=(\d+)/gi;
	var match;
	while ((match = regex.exec(String(html || ""))) !== null) {
		var page = parseInt(match[1], 10);
		if (!isNaN(page) && page > maxPage) maxPage = page;
	}
	return Math.min(maxPage, 100);
};

NovelFireSource._mergeChapters = function(target, additions) {
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

NovelFireSource.getBookChapters = async function(bookId) {
	var bookUrl = this._bookUrl(bookId);
	var chaptersUrl = bookUrl.replace(/\/+$/, "") + "/chapters";
	var html = await this._fetchHtml(chaptersUrl, bookUrl);
	var chapters = this._parseChapterLinks(html, bookUrl);
	var totalCount = this._chapterCountFromHtml(html);
	if (totalCount > chapters.length) {
		return this._expandNumericChapterList(bookUrl, chapters, totalCount);
	}
	var lastPage = this._lastChapterListPage(html);
	for (var page = 2; page <= lastPage; page++) {
		var pageUrl = chaptersUrl + "?page=" + page;
		this._mergeChapters(chapters, this._parseChapterLinks(await this._fetchHtml(pageUrl, bookUrl), bookUrl));
	}
	if (!chapters.length) {
		chapters = this._parseChapterLinks(await this._fetchHtml(bookUrl, this.BASE_URL + "/"), bookUrl);
	}
	if (!chapters.length) {
		throw new Error("Novel Fire did not expose any chapter links for this novel.");
	}
	return chapters;
};

NovelFireSource._extractContentHtml = function(html) {
	var text = String(html || "");
	var patterns = [
		/<div\b[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div\b[^>]*class=["'][^"']*(?:box-notification|nf-ads|chapternav|report-container)[^"']*["']|<\/div>\s*<div\b[^>]*class=["'][^"']*box-notification)/i,
		/<div\b[^>]*id=["']chapter-container["'][^>]*>[\s\S]*?<div\b[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>/i,
		/<article\b[^>]*id=["']chapter-article["'][^>]*>([\s\S]*?)<\/article>/i,
	];
	for (var i = 0; i < patterns.length; i++) {
		var match = text.match(patterns[i]);
		if (match && this._stripTags(match[1]).length > 200) return match[1];
	}
	return "";
};

NovelFireSource._titleFromChapterPage = function(html, fallbackUrl) {
	var match = String(html || "").match(/class=["'][^"']*chapter-title[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|h2|span|div)>/i)
		|| String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	if (match) return this._stripTags(match[1]);
	var title = this._extractMeta(html, "og:title") || this._extractMeta(html, "twitter:title");
	if (title) return title.replace(/\s+-\s+Novel Fire\s*$/i, "").trim();
	return this._decode(this._slugFromPath(fallbackUrl || "Chapter").replace(/-/g, " "));
};

NovelFireSource._sanitizeChapterHtml = function(html, pageUrl) {
	var cleaned = String(html || "");
	cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
	cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
	cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
	cleaned = cleaned.replace(/<ins[\s\S]*?<\/ins>/gi, "");
	cleaned = cleaned.replace(/<div\b[^>]*class=["'][^"']*(?:nf-ads|box-notification|chapternav|report-container|text-center|box-notice|adcash)[^"']*["'][\s\S]*?<\/div>/gi, "");
	cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
	cleaned = cleaned.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "");
	cleaned = cleaned.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
	cleaned = cleaned.replace(/javascript:/gi, "");
	return cleaned.replace(/(href|src)=(['"])([^'"]+)\2/gi, function(_, attr, quote, value) {
		if (!value || value.indexOf("data:") === 0 || value.indexOf("#") === 0) return attr + "=" + quote + value + quote;
		return attr + "=" + quote + NovelFireSource._absoluteUrl(value, pageUrl) + quote;
	});
};

NovelFireSource.getBookChapter = async function(chapterId) {
	var chapterUrl = this._chapterUrl(chapterId);
	var html = await this._fetchHtml(chapterUrl, this.BASE_URL + "/");
	var content = this._extractContentHtml(html);
	if (!content) {
		throw new Error("Could not locate Novel Fire chapter content.");
	}
	return {
		id: chapterUrl,
		title: this._titleFromChapterPage(html, chapterUrl),
		url: chapterUrl,
		html: this._sanitizeChapterHtml(content, chapterUrl),
	};
};

__cinderExport = NovelFireSource;
