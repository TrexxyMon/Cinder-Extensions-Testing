var NovelUpdatesSource = {};

NovelUpdatesSource.id = "novelupdates";
NovelUpdatesSource.name = "NovelUpdates";
NovelUpdatesSource.version = "0.1.0-cinder";
NovelUpdatesSource.icon = "NU";
NovelUpdatesSource.description =
	"Search and discover translated web novels, view metadata, and build available chapters into EPUB. Some chapter links require a signed-in website session.";
NovelUpdatesSource.contentType = "webnovel";
NovelUpdatesSource.contentTypes = ["webnovel", "ebook"];
NovelUpdatesSource.contentSubtypes = ["lightNovel", "translatedNovel"];
NovelUpdatesSource.excludeFromDefaultMetadataProviders = false;
NovelUpdatesSource.browser = {
	startUrl: "https://www.novelupdates.com/",
	userAgent: "desktop",
	requiresAuth: true,
};
NovelUpdatesSource.capabilities = {
	search: true,
	discover: true,
	download: false,
	resolve: false,
	searchDownloads: false,
	bookChapters: true,
	manga: false,
};

NovelUpdatesSource.BASE_URL = "https://www.novelupdates.com/";
NovelUpdatesSource.AJAX_URL =
	"https://www.novelupdates.com/wp-admin/admin-ajax.php";

NovelUpdatesSource._decode = function(value) {
	var text = String(value || "");
	if (typeof cinder !== "undefined" && cinder.normalizeText) {
		return cinder.normalizeText(text);
	}
	return text
		.replace(/&#(\d+);/g, function(_, code) {
			return String.fromCharCode(parseInt(code, 10));
		})
		.replace(/&#x([0-9a-f]+);/gi, function(_, code) {
			return String.fromCharCode(parseInt(code, 16));
		})
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#0?39;|&apos;/gi, "'")
		.replace(/&nbsp;/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
};

NovelUpdatesSource._absoluteUrl = function(value, base) {
	var url = String(value || "").trim();
	if (!url) return "";
	if (/^https?:\/\//i.test(url)) return url;
	if (url.indexOf("//") === 0) return "https:" + url;
	if (typeof cinder !== "undefined" && cinder.resolveUrl) {
		return cinder.resolveUrl(url, base || this.BASE_URL);
	}
	if (url.charAt(0) === "/") {
		return this.BASE_URL.replace(/\/$/, "") + url;
	}
	return (base || this.BASE_URL).replace(/\/[^/]*$/, "/") + url;
};

NovelUpdatesSource._browserHeaders = function(selector) {
	return {
		Accept:
			"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
		"X-Cinder-Wait-For-Selector": selector || "body",
		"X-Cinder-Min-Wait-Ms": "900",
		"X-Cinder-Max-Wait-Ms": "45000",
		"X-Cinder-Visible-Layout": "1",
	};
};

NovelUpdatesSource._looksUsable = function(html, selector) {
	var source = String(html || "");
	if (source.length < 250) return false;
	if (/just a moment|checking your browser|verify you are human/i.test(source)) {
		return false;
	}
	if (!selector) return true;
	try {
		return !!cinder.parseHTML(source).querySelector(selector);
	} catch (_) {
		return false;
	}
};

NovelUpdatesSource._fetchHtml = async function(url, selector) {
	var response = null;
	try {
		response = await cinder.fetch(url, {
			headers: {
				Accept: "text/html,application/xhtml+xml",
				"Accept-Language": "en-US,en;q=0.9",
			},
			timeout: 20000,
		});
	} catch (_) {}
	var html = response && response.data ? String(response.data) : "";
	if (this._looksUsable(html, selector)) return html;

	if (!cinder.fetchBrowser) {
		throw new Error(
			"Website browser support is unavailable in this Cinder build.",
		);
	}
	response = await cinder.fetchBrowser(url, {
		browserUserAgent: "desktop",
		headers: this._browserHeaders(selector),
		timeout: 50000,
	});
	html = response && response.data ? String(response.data) : "";
	if (!this._looksUsable(html, selector)) {
		throw new Error(
			"NovelUpdates did not return a usable page. Open the extension website, complete any challenge or login, then retry.",
		);
	}
	return html;
};

NovelUpdatesSource._parseResults = function(html) {
	var doc = cinder.parseHTML(String(html || ""));
	var cards = doc.querySelectorAll("div.search_main_box_nu");
	var results = [];
	for (var i = 0; i < cards.length; i++) {
		var link = cards[i].querySelector(".search_title > a");
		if (!link) continue;
		var href = this._absoluteUrl(link.attr("href"), this.BASE_URL);
		var title = this._decode(link.text());
		if (!href || !title) continue;
		var image = cards[i].querySelector("img");
		var cover = image
			? image.attr("data-lazy-src") ||
				image.attr("data-src") ||
				image.attr("src")
			: "";
		var authorNode =
			cards[i].querySelector(".search_stats a[href*='/nauthor/']") ||
			cards[i].querySelector("a[href*='/nauthor/']");
		results.push({
			id: href,
			title: title,
			author: authorNode ? this._decode(authorNode.text()) : undefined,
			cover: cover ? this._absoluteUrl(cover, href) : undefined,
			url: href,
			source: this.name,
			format: "epub",
			contentType: "webnovel",
			contentTypes: ["webnovel", "ebook"],
			contentSubtypes: ["lightNovel", "translatedNovel"],
		});
	}
	return results;
};

NovelUpdatesSource._seriesUrl = function(bookId) {
	var value = this._decode(bookId);
	if (/^https?:\/\//i.test(value)) return value;
	if (!value) throw new Error("Invalid NovelUpdates series id.");
	return this.BASE_URL + "series/" + value.replace(/^\/+|\/+$/g, "") + "/";
};

NovelUpdatesSource._parseDetails = function(bookId, html) {
	var doc = cinder.parseHTML(html);
	var titleNode = doc.querySelector(".seriestitlenu");
	var coverNode = doc.querySelector(".wpb_wrapper img");
	var authorNodes = doc.querySelectorAll("#authtag");
	var genreNodes = doc.querySelectorAll("#seriesgenre a");
	var authors = [];
	var genres = [];
	for (var i = 0; i < authorNodes.length; i++) {
		var author = this._decode(authorNodes[i].text());
		if (author) authors.push(author);
	}
	for (var j = 0; j < genreNodes.length; j++) {
		var genre = this._decode(genreNodes[j].text());
		if (genre) genres.push(genre);
	}
	var summaryNode = doc.querySelector("#editdescription");
	var typeNode = doc.querySelector("#showtype");
	var description = summaryNode ? this._decode(summaryNode.text()) : "";
	var novelType = typeNode ? this._decode(typeNode.text()) : "";
	if (novelType) {
		description += (description ? "\n\n" : "") + "Type: " + novelType;
	}
	var cover = coverNode
		? coverNode.attr("data-lazy-src") ||
			coverNode.attr("data-src") ||
			coverNode.attr("src")
		: "";
	return {
		id: this._seriesUrl(bookId),
		title: titleNode ? this._decode(titleNode.text()) : undefined,
		author: authors.length ? authors.join(", ") : undefined,
		cover: cover
			? this._absoluteUrl(cover, this._seriesUrl(bookId))
			: undefined,
		description: description || undefined,
		genres: genres.length ? genres : undefined,
		url: this._seriesUrl(bookId),
		source: this.name,
		format: "epub",
		contentType: "webnovel",
		contentTypes: ["webnovel", "ebook"],
		contentSubtypes: ["lightNovel", "translatedNovel"],
	};
};

NovelUpdatesSource.search = async function(query, page) {
	var cleanQuery = String(query || "").trim();
	if (!cleanQuery) return [];
	var url =
		this.BASE_URL +
		"series-finder/?sf=1&sh=" +
		encodeURIComponent(cleanQuery) +
		"&sort=srank&order=asc&pg=" +
		String((page || 0) + 1);
	var html = await this._fetchHtml(url, "div.search_main_box_nu");
	return this._parseResults(html).slice(0, 25);
};

NovelUpdatesSource.getBookDetails = async function(bookId) {
	var url = this._seriesUrl(bookId);
	var html = await this._fetchHtml(url, ".seriestitlenu");
	return this._parseDetails(url, html);
};

NovelUpdatesSource._fetchChapterListHtml = async function(seriesUrl, postId) {
	var body =
		"action=nd_getchapters&mygrr=0&mypostid=" + encodeURIComponent(postId);
	var headers = {
		Accept: "text/html,*/*",
		"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
		"X-Requested-With": "XMLHttpRequest",
		Referer: seriesUrl,
	};
	var response = null;
	try {
		response = await cinder.fetch(this.AJAX_URL, {
			method: "POST",
			headers: headers,
			body: body,
			timeout: 25000,
		});
	} catch (_) {}
	var html = response && response.data ? String(response.data) : "";
	if (/<li\b[^>]*sp_li_chp/i.test(html)) return html;

	if (!cinder.fetchBrowser) return html;
	var browserHeaders = this._browserHeaders("li.sp_li_chp");
	for (var key in headers) browserHeaders[key] = headers[key];
	response = await cinder.fetchBrowser(this.AJAX_URL, {
		method: "POST",
		body: body,
		headers: browserHeaders,
		browserUserAgent: "desktop",
		timeout: 50000,
	});
	return response && response.data ? String(response.data) : "";
};

NovelUpdatesSource.getBookChapters = async function(bookId) {
	var seriesUrl = this._seriesUrl(bookId);
	var detailsHtml = await this._fetchHtml(seriesUrl, ".seriestitlenu");
	var detailsDoc = cinder.parseHTML(detailsHtml);
	var postIdNode = detailsDoc.querySelector("input#mypostid");
	var postId = postIdNode ? postIdNode.attr("value") : "";
	if (!postId) {
		throw new Error("NovelUpdates did not expose a series chapter id.");
	}
	var chaptersHtml = await this._fetchChapterListHtml(seriesUrl, postId);
	var doc = cinder.parseHTML(chaptersHtml);
	var items = doc.querySelectorAll("li.sp_li_chp");
	if (!items.length) {
		throw new Error(
			"No chapter links were returned. Open the extension website and sign in, then retry.",
		);
	}
	var chapters = [];
	for (var i = 0; i < items.length; i++) {
		var anchors = items[i].querySelectorAll("a");
		if (!anchors.length) continue;
		var link = anchors.length > 1 ? anchors[1] : anchors[0];
		var href = this._absoluteUrl(link.attr("href"), seriesUrl);
		if (!href) continue;
		var linkTitle = this._decode(link.text());
		var itemTitle = this._decode(items[i].text());
		var title = linkTitle || itemTitle || "Chapter " + String(i + 1);
		chapters.push({
			id: JSON.stringify({ url: href, title: title }),
			title: title,
			url: href,
			index: i,
		});
	}
	chapters.reverse();
	for (var j = 0; j < chapters.length; j++) chapters[j].index = j;
	return chapters;
};

NovelUpdatesSource._stripUnsafeMarkup = function(html) {
	return String(html || "")
		.replace(/<(script|style|noscript|iframe|form|button|nav|footer|header)\b[\s\S]*?<\/\1>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
		.replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, "");
};

NovelUpdatesSource._absolutizeMarkup = function(html, baseUrl) {
	var self = this;
	return String(html || "").replace(
		/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi,
		function(match, attr, quote, value) {
			if (
				!value ||
				/^(?:data:|blob:|mailto:|tel:|javascript:|#)/i.test(value)
			) {
				return match;
			}
			return (
				attr +
				"=" +
				quote +
				self._absoluteUrl(value, baseUrl) +
				quote
			);
		},
	);
};

NovelUpdatesSource.getBookChapter = async function(chapterId) {
	var payload = {};
	try {
		payload = JSON.parse(String(chapterId || ""));
	} catch (_) {
		payload = { url: String(chapterId || ""), title: "Chapter" };
	}
	var url = this._absoluteUrl(payload.url, this.BASE_URL);
	if (!url) throw new Error("Invalid chapter URL.");
	var html = await this._fetchHtml(url, "body");
	var doc = cinder.parseHTML(html);
	var selectors = [
		"[itemprop='articleBody']",
		".chapter-content",
		"#chapter-content",
		".chapter__content",
		".chapter-body",
		".reading-content",
		".reader-content",
		".entry-content",
		".post-content",
		"article .content",
		"article",
		"main",
	];
	var content = null;
	for (var i = 0; i < selectors.length; i++) {
		var candidate = doc.querySelector(selectors[i]);
		if (candidate && this._decode(candidate.text()).length >= 120) {
			content = candidate;
			break;
		}
	}
	if (!content) {
		throw new Error(
			"Could not identify the chapter text on this translator website.",
		);
	}
	var body = this._stripUnsafeMarkup(content.html());
	body = this._absolutizeMarkup(body, url);
	if (this._decode(body).length < 120) {
		throw new Error("The translator website returned an empty chapter.");
	}
	return {
		id: chapterId,
		title: this._decode(payload.title) || "Chapter",
		html: "<section>" + body + "</section>",
		url: url,
	};
};

NovelUpdatesSource.getDiscoverSections = async function() {
	return [
		{ id: "latest", title: "Recently Updated", icon: "time-outline" },
		{ id: "popular-month", title: "Popular This Month", icon: "flame-outline" },
		{ id: "popular-all", title: "Popular All Time", icon: "trending-up-outline" },
		{ id: "rated", title: "Highest Rated", icon: "star-outline" },
		{ id: "completed", title: "Recently Completed", icon: "checkmark-circle-outline" },
	];
};

NovelUpdatesSource.getDiscoverItems = async function(sectionId, page) {
	var paths = {
		latest: "series-finder/?sf=1&sort=sdate&order=desc",
		"popular-month": "series-ranking/?rank=popmonth",
		"popular-all": "series-ranking/?rank=popular",
		rated: "series-finder/?sf=1&sort=srate&order=desc",
		completed: "series-finder/?sf=1&ss=2&sort=sdate&order=desc",
	};
	var path = paths[sectionId] || paths.latest;
	var separator = path.indexOf("?") >= 0 ? "&" : "?";
	var url = this.BASE_URL + path + separator + "pg=" + String((page || 0) + 1);
	var html = await this._fetchHtml(url, "div.search_main_box_nu");
	return this._parseResults(html).slice(0, 25);
};

NovelUpdatesSource.testConnection = async function() {
	var results = await this.search("test", 0);
	if (!results.length) {
		throw new Error("NovelUpdates connected but returned no usable results.");
	}
	return true;
};

__cinderExport = NovelUpdatesSource;
