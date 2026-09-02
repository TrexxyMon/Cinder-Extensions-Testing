var MayberrySource = {};

MayberrySource.id = "mayberry";
MayberrySource.name = "Mayberry";
MayberrySource.version = "0.1.0-cinder";
MayberrySource.icon = "MB";
MayberrySource.description = "Search and download EPUB books from the federated Mayberry library network.";
MayberrySource.contentType = "books";
MayberrySource.contentTypes = ["ebook"];
MayberrySource.language = "Multilingual";
MayberrySource.excludeFromDefaultMetadataProviders = true;
MayberrySource.capabilities = {
	search: true,
	discover: true,
	download: true,
	resolve: false,
	searchDownloads: true,
	manga: false,
};

MayberrySource.BASE_URL = "https://mayberry.pub";
MayberrySource._feedCache = {};
MayberrySource._pendingFeeds = {};
MayberrySource._sections = {
	releases: "/opds/releases",
	new: "/opds/new",
	popular: "/opds/popular",
};

MayberrySource._absoluteUrl = function(value, baseUrl) {
	var url = String(value || "").trim();
	if (!url) return "";
	if (/^https?:\/\//i.test(url)) return url;
	if (url.indexOf("//") === 0) return "https:" + url;
	try {
		return new URL(url, baseUrl || this.BASE_URL).href;
	} catch (error) {
		if (url.charAt(0) === "/") return this.BASE_URL + url;
		return (baseUrl || this.BASE_URL).replace(/\/+$/, "") + "/" + url.replace(/^\/+/, "");
	}
};

MayberrySource._cleanText = function(value) {
	var text = String(value || "").replace(/\s+/g, " ").trim();
	if (text && typeof cinder !== "undefined" && typeof cinder.normalizeText === "function") {
		return cinder.normalizeText(text);
	}
	return text
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#(?:39|x27);/gi, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
};

MayberrySource._text = function(element) {
	if (!element || typeof element.text !== "function") return "";
	return this._cleanText(element.text());
};

MayberrySource._headers = function() {
	return {
		Accept: "application/atom+xml;profile=opds-catalog, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
	};
};

MayberrySource._fetchFeed = async function(pathOrUrl, maxAgeMs) {
	var url = this._absoluteUrl(pathOrUrl || "/opds", this.BASE_URL);
	var now = Date.now();
	var cached = this._feedCache[url];
	if (cached && now - cached.savedAt <= Math.max(0, Number(maxAgeMs) || 0)) {
		return { doc: cinder.parseXML(cached.data), url: url };
	}

	if (!this._pendingFeeds[url]) {
		var self = this;
		this._pendingFeeds[url] = (async function() {
			var lastError = null;
			for (var attempt = 0; attempt < 2; attempt++) {
				try {
					var response = await cinder.fetch(url, {
						headers: self._headers(),
						timeout: 15000,
					});
					var status = Number(response && response.status) || 0;
					var data = String((response && response.data) || "");
					if (status === 200 && /<(?:[A-Za-z0-9_-]+:)?feed(?:\s|>)/i.test(data)) {
						return data;
					}
					if (status === 200 && /<html|<!doctype/i.test(data)) {
						throw new Error("Mayberry returned a web page instead of its OPDS catalog.");
					}
					if (status === 404) throw new Error("The requested Mayberry catalog page is unavailable.");
					if (status >= 500 || status === 0) {
						lastError = new Error("Mayberry is temporarily unavailable" + (status ? " (HTTP " + status + ")" : "") + ".");
						continue;
					}
					throw new Error("Mayberry returned HTTP " + status + ".");
				} catch (error) {
					lastError = error;
					if (attempt === 0) continue;
				}
			}
			throw lastError || new Error("Could not reach Mayberry.");
		})();
	}

	try {
		var data = await this._pendingFeeds[url];
		this._feedCache[url] = { data: data, savedAt: Date.now() };
		return { doc: cinder.parseXML(data), url: url };
	} finally {
		delete this._pendingFeeds[url];
	}
};

MayberrySource._entryAuthor = function(entry) {
	var names = entry.querySelectorAll("author name");
	var authors = [];
	var seen = {};
	for (var i = 0; i < names.length; i++) {
		var author = this._text(names[i]);
		var key = author.toLowerCase();
		if (author && !seen[key]) {
			seen[key] = true;
			authors.push(author);
		}
	}
	return authors.length ? authors.join(", ") : "Unknown";
};

MayberrySource._entryCategories = function(entry) {
	var categories = entry.querySelectorAll("category");
	var values = [];
	var seen = {};
	for (var i = 0; i < categories.length; i++) {
		var value = this._cleanText(categories[i].attr("label") || categories[i].attr("term") || "");
		value = value.replace(/^"+|"+$/g, "").trim();
		var key = value.toLowerCase();
		if (value && !seen[key]) {
			seen[key] = true;
			values.push(value);
		}
	}
	return values.slice(0, 12);
};

MayberrySource._parseEntry = function(entry, feedUrl) {
	var title = this._text(entry.querySelector("title"));
	if (!title) return null;

	var id = this._text(entry.querySelector("id"));
	var summary = this._text(entry.querySelector("summary"));
	if (!summary) summary = this._text(entry.querySelector("content"));
	var links = entry.querySelectorAll("link");
	var cover = "";
	var thumbnail = "";
	var downloadUrl = "";

	for (var i = 0; i < links.length; i++) {
		var rel = String(links[i].attr("rel") || "").toLowerCase();
		var type = String(links[i].attr("type") || "").toLowerCase();
		var href = String(links[i].attr("href") || "").trim();
		if (!href) continue;

		if (rel.indexOf("thumbnail") >= 0) {
			if (!thumbnail) thumbnail = href;
		} else if (rel.indexOf("image") >= 0 || type.indexOf("image/") === 0) {
			if (!cover) cover = href;
		}

		var isAcquisition = rel.indexOf("acquisition") >= 0;
		var isEpub = type.indexOf("application/epub+zip") >= 0 || /\.epub(?:$|[?#])/i.test(href);
		if (!downloadUrl && (isAcquisition || isEpub) && type.indexOf("atom") < 0 && type.indexOf("xml") < 0) {
			downloadUrl = href;
		}
	}

	if (!downloadUrl) return null;
	var absoluteDownloadUrl = this._absoluteUrl(downloadUrl, feedUrl);
	var categories = this._entryCategories(entry);
	var author = this._entryAuthor(entry);
	return {
		id: id || absoluteDownloadUrl,
		title: title,
		author: author,
		cover: this._absoluteUrl(cover || thumbnail, feedUrl) || undefined,
		url: absoluteDownloadUrl,
		format: "epub",
		source: "Mayberry",
		description: summary || undefined,
		extra: {
			description: summary || undefined,
			summary: summary || undefined,
			categories: categories,
			genres: categories,
			downloadUrl: absoluteDownloadUrl,
		},
	};
};

MayberrySource._parseBooks = function(feed) {
	var entries = feed.doc.querySelectorAll("entry");
	var results = [];
	var seen = {};
	for (var i = 0; i < entries.length; i++) {
		var result = this._parseEntry(entries[i], feed.url);
		if (!result) continue;
		var key = String(result.id || result.url || (result.title + "|" + result.author)).toLowerCase();
		if (seen[key]) continue;
		seen[key] = true;
		results.push(result);
	}
	return results;
};

MayberrySource._pagedUrl = function(path, page, query) {
	var pageNumber = Math.max(0, Number(page) || 0);
	var url = path;
	if (query !== undefined) url += "?q=" + encodeURIComponent(String(query || ""));
	if (pageNumber > 0) url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + pageNumber;
	return url;
};

MayberrySource.search = async function(query, page) {
	var term = String(query || "").trim();
	if (!term) return [];
	var path = this._pagedUrl("/opds/search", page, term);
	var feed = await this._fetchFeed(path, 60000);
	return this._parseBooks(feed);
};

MayberrySource.getDiscoverSections = async function() {
	return [
		{ id: "releases", title: "New Releases", icon: "sparkles" },
		{ id: "new", title: "New Arrivals", icon: "time" },
		{ id: "popular", title: "Top Reads", icon: "trending-up" },
	];
};

MayberrySource.getDiscoverItems = async function(sectionId, page) {
	var path = this._sections[String(sectionId || "")];
	if (!path) return [];
	var feed = await this._fetchFeed(this._pagedUrl(path, page), 90000);
	return this._parseBooks(feed);
};

MayberrySource.testConnection = async function() {
	var feed = await this._fetchFeed("/opds", 300000);
	var title = this._text(feed.doc.querySelector("feed > title")) || this._text(feed.doc.querySelector("title"));
	if (!title || title.toLowerCase().indexOf("mayberry") < 0) {
		throw new Error("The server did not return the Mayberry OPDS catalog.");
	}
	return true;
};

MayberrySource.getSettings = function() {
	return [];
};

__cinderExport = MayberrySource;
