__cinderExport = {
	id: "generic-direct-fixture",
	name: "Generic Direct Fixture",
	version: "0.1.0",
	icon: "GDF",
	description: "Configurable placeholder download-source extension for controlled resolver experiments.",
	contentType: "books",
	contentTypes: ["ebook"],
	excludeFromDefaultMetadataProviders: true,

	capabilities: {
		search: true,
		discover: false,
		download: true,
		resolve: true,
		searchDownloads: true,
		manga: false,
	},

	getSettings: function() {
		return [
			{
				id: "base_url",
				label: "Base URL",
				type: "text",
				defaultValue: "https://example.invalid",
				placeholder: "https://example.invalid",
			},
			{
				id: "search_path",
				label: "Search Path",
				type: "text",
				defaultValue: "/search?q={query}&page={page}",
				placeholder: "/search?q={query}&page={page}",
			},
			{
				id: "result_selector",
				label: "Result Selector",
				type: "text",
				defaultValue: "[data-cinder-result], article, .result, .book-result",
				placeholder: "[data-cinder-result], article, .result",
			},
			{
				id: "direct_link_selector",
				label: "Direct Link Selector",
				type: "text",
				defaultValue: "a[data-direct-download], a.download, a[href$='.epub'], a[href$='.pdf'], a[href$='.cbz'], a[href$='.cbr']",
				placeholder: "a[data-direct-download], a.download",
			},
			{
				id: "placeholder_detail_template",
				label: "Placeholder Detail Template",
				type: "text",
				defaultValue: "https://placeholder.url/item/{id}",
				placeholder: "https://placeholder.url/item/{id}",
			},
			{
				id: "placeholder_download_template",
				label: "Placeholder Download Template",
				type: "text",
				defaultValue: "https://placeholder.url/get.php?id={id}&format={format}",
				placeholder: "https://placeholder.url/get.php?id={id}&format={format}",
			},
			{
				id: "placeholder_md5_download_template",
				label: "Placeholder MD5 Download Template",
				type: "text",
				defaultValue: "https://placeholder.url/download/{md5}?format={format}",
				placeholder: "https://placeholder.url/download/{md5}?format={format}",
			},
		];
	},

	_clean: function(value) {
		return cinder.normalizeText(String(value || ""))
			.replace(/\s+/g, " ")
			.trim();
	},

	_attr: function(node, name) {
		return node ? this._clean(node.attr(name) || "") : "";
	},

	_absUrl: function(baseUrl, value) {
		var url = this._clean(value);
		if (!url) return "";
		if (url.indexOf("//") === 0) return "https:" + url;
		if (/^https?:\/\//i.test(url)) return url;
		var base = this._clean(baseUrl).replace(/\/+$/, "");
		if (!base) return url;
		if (url.charAt(0) === "/") return base + url;
		return base + "/" + url;
	},

	_getSetting: async function(id, fallback) {
		var value = await cinder.store.get(id);
		value = this._clean(value);
		return value || fallback;
	},

	_getBaseUrl: async function() {
		return (await this._getSetting("base_url", "https://example.invalid")).replace(/\/+$/, "");
	},

	_fetchHtml: async function(url) {
		var resp = await cinder.fetch(url, {
			headers: {
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.8",
				"User-Agent": "Mozilla/5.0 (Cinder Research Fixture)",
			},
			timeout: 30000,
		});
		if (!resp || resp.status < 200 || resp.status >= 400) {
			throw new Error("Fixture request failed with status " + (resp ? resp.status : "unknown"));
		}
		return resp.data || "";
	},

	_searchUrl: async function(query, page) {
		var baseUrl = await this._getBaseUrl();
		var path = await this._getSetting("search_path", "/search?q={query}&page={page}");
		var resolved = path
			.replace(/\{query\}/g, encodeURIComponent(query || ""))
			.replace(/\{page\}/g, String((page || 0) + 1))
			.replace(/\{page0\}/g, String(page || 0));
		return this._absUrl(baseUrl, resolved);
	},

	_firstText: function(node, selectors) {
		for (var i = 0; i < selectors.length; i++) {
			var found = node.querySelector(selectors[i]);
			var text = found ? this._clean(found.text()) : "";
			if (text) return text;
		}
		return "";
	},

	_firstAttr: function(node, selectors, attrs) {
		for (var i = 0; i < selectors.length; i++) {
			var found = node.querySelector(selectors[i]);
			if (!found) continue;
			for (var j = 0; j < attrs.length; j++) {
				var value = this._attr(found, attrs[j]);
				if (value) return value;
			}
		}
		return "";
	},

	_detectFormat: function(text) {
		var match = this._clean(text).toLowerCase().match(/\b(epub|pdf|cbz|cbr|mobi|azw3|fb2)\b/);
		return match ? match[1] : "epub";
	},

	_renderTemplate: function(template, values) {
		values = values || {};
		return this._clean(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function(_all, key) {
			return encodeURIComponent(values[key] == null ? "" : String(values[key]));
		});
	},

	_fileIdFromUrl: function(url) {
		var text = String(url || "");
		var idMatch = text.match(/[?&]id=([0-9A-Za-z._-]+)/);
		if (idMatch) return idMatch[1];
		var pathMatch = text.match(/\/([0-9A-Za-z._-]+)(?:\.[a-z0-9]+)?(?:[?#]|$)/i);
		return pathMatch ? pathMatch[1] : "";
	},

	_md5FromUrl: function(url) {
		var text = String(url || "");
		var queryMatch = text.match(/[?&]md5=([0-9a-f]{8,64})/i);
		if (queryMatch) return queryMatch[1];
		var pathMatch = text.match(/\/md5\/([0-9a-f]{8,64})(?:[/?#]|$)/i);
		return pathMatch ? pathMatch[1] : "";
	},

	_isRestrictedDistributionUrl: function(url) {
		var lower = String(url || "").toLowerCase();
		return (
			lower.indexOf(".onion") !== -1 ||
			lower.indexOf("?md5=") !== -1 ||
			lower.indexOf("&md5=") !== -1 ||
			lower.indexOf("/torrents/") !== -1 ||
			lower.indexOf("/nzb/") !== -1 ||
			lower.indexOf("dbdumps") !== -1 ||
			lower.indexOf("/md5/") !== -1
		);
	},

	_placeholderDetailUrl: async function(id, format) {
		var template = await this._getSetting("placeholder_detail_template", "https://placeholder.url/item/{id}");
		return this._renderTemplate(template, {
			id: id,
			format: format || "epub",
		});
	},

	_placeholderDownloadUrl: async function(id, format, tokens) {
		tokens = tokens || {};
		var md5 = this._clean(tokens.md5 || "");
		var template = md5
			? await this._getSetting("placeholder_md5_download_template", "https://placeholder.url/download/{md5}?format={format}")
			: await this._getSetting("placeholder_download_template", "https://placeholder.url/get.php?id={id}&format={format}");
		return this._renderTemplate(template, {
			id: id,
			format: format || "epub",
			md5: md5,
		});
	},

	_parseLegacyTableRows: async function(doc) {
		var rows = doc.querySelectorAll("table tbody tr");
		var results = [];
		var seen = {};

		for (var i = 0; i < rows.length; i++) {
			try {
				var row = rows[i];
				var cells = row.querySelectorAll("td");
				if (!cells || cells.length < 8) continue;

				var infoCell = cells[0];
				var titleLink = infoCell.querySelector("a[data-detail]") ||
					infoCell.querySelector("a[href*='edition']") ||
					infoCell.querySelector("a[href]");
				var rawTitle = titleLink ? this._clean(titleLink.text()) : this._clean(infoCell.text());
				var series = this._firstText(infoCell, ["b"]);
				var title = rawTitle || series;
				if (!title || title.length < 2) continue;

				var author = this._clean(cells[1].text());
				var publisher = this._clean(cells[2].text());
				var year = this._clean(cells[3].text());
				var language = this._clean(cells[4].text());
				var pages = this._clean(cells[5].text());
				var sizeLink = cells[6].querySelector("a[href]");
				var size = this._clean(cells[6].text());
				var format = this._detectFormat(cells[7].text());
				var sizeHref = sizeLink ? sizeLink.attr("href") : "";
				var titleHref = titleLink ? titleLink.attr("href") : "";
				var sourceMd5 = this._md5FromUrl(sizeHref) || this._md5FromUrl(titleHref);
				var sourceId = sourceMd5 || this._fileIdFromUrl(sizeHref) || this._fileIdFromUrl(titleHref);
				if (!sourceId) sourceId = "row-" + i;

				var id = "fixture-table-" + sourceId + "-" + format;
				if (seen[id]) continue;
				seen[id] = true;

				var detailUrl = await this._placeholderDetailUrl(sourceId, format);
				var directUrl = await this._placeholderDownloadUrl(sourceId, format, { md5: sourceMd5 });
				results.push({
					id: id,
					title: title,
					author: author || undefined,
					url: detailUrl,
					format: format,
					size: size || undefined,
					source: "Generic Direct Fixture",
					extra: {
						directUrl: directUrl,
						detailUrl: detailUrl,
						md5: sourceMd5 || undefined,
						publisher: publisher || undefined,
						year: year || undefined,
						language: language || undefined,
						pages: pages || undefined,
						series: series && series !== title ? series : undefined,
					},
				});
			} catch (err) {
				cinder.warn("[GenericDirectFixture] Failed to parse table row: " + err);
			}
		}

		return results;
	},

	_parseResults: async function(html) {
		var baseUrl = await this._getBaseUrl();
		var selector = await this._getSetting(
			"result_selector",
			"[data-cinder-result], article, .result, .book-result",
		);
		var doc = cinder.parseHTML(html);
		var nodes = doc.querySelectorAll(selector);
		var results = await this._parseLegacyTableRows(doc);
		var seen = {};
		for (var existingIndex = 0; existingIndex < results.length; existingIndex++) {
			seen[results[existingIndex].id] = true;
		}

		for (var i = 0; i < nodes.length; i++) {
			try {
				var node = nodes[i];
				var title = this._attr(node, "data-title") ||
					this._firstText(node, ["[data-title]", ".title", ".book-title", "h1", "h2", "h3", "a"]);
				var author = this._attr(node, "data-author") ||
					this._firstText(node, ["[data-author]", ".author", ".book-author"]);
				var size = this._attr(node, "data-size") ||
					this._firstText(node, ["[data-size]", ".size", ".file-size"]);
				var format = this._attr(node, "data-format") || this._detectFormat(node.text());
				var cover = this._attr(node, "data-cover") ||
					this._firstAttr(node, ["img"], ["data-src", "src"]);
				var directUrl = this._attr(node, "data-direct-url") ||
					this._firstAttr(node, ["a[data-direct-download]"], ["href", "data-url"]);
				var detailUrl = this._attr(node, "data-url") ||
					this._attr(node, "data-detail-url") ||
					this._firstAttr(node, ["a[href]"], ["href"]);

				detailUrl = this._absUrl(baseUrl, detailUrl);
				directUrl = this._absUrl(baseUrl, directUrl);
				cover = this._absUrl(baseUrl, cover);
				if (!title || (!detailUrl && !directUrl)) continue;
				if (this._isRestrictedDistributionUrl(detailUrl)) {
					detailUrl = await this._placeholderDetailUrl(this._fileIdFromUrl(detailUrl) || this._clean(title).toLowerCase(), format);
				}
				if (this._isRestrictedDistributionUrl(directUrl)) {
					var directMd5 = this._md5FromUrl(directUrl);
					directUrl = await this._placeholderDownloadUrl(
						directMd5 || this._fileIdFromUrl(directUrl) || this._clean(title).toLowerCase(),
						format,
						{ md5: directMd5 },
					);
				}

				var id = (detailUrl || directUrl || title) + "#" + format;
				if (seen[id]) continue;
				seen[id] = true;
				results.push({
					id: id,
					title: title,
					author: author || undefined,
					cover: cover || undefined,
					url: detailUrl || directUrl,
					format: format,
					size: size || undefined,
					source: "Generic Direct Fixture",
					extra: {
						directUrl: directUrl || undefined,
						detailUrl: detailUrl || undefined,
					},
				});
			} catch (err) {
				cinder.warn("[GenericDirectFixture] Failed to parse result: " + err);
			}
		}

		return results.slice(0, 50);
	},

	_extractFormDownload: async function(doc, pageUrl, baseUrl) {
		var form = doc.querySelector("form[data-cinder-download], form.download, form[action]");
		if (!form) return null;
		var action = this._absUrl(baseUrl, form.attr("action") || pageUrl);
		if (!action) return null;

		var method = this._clean(form.attr("method") || "GET").toUpperCase();
		if (method !== "POST") method = "GET";

		var body = {};
		var inputs = form.querySelectorAll("input[name], select[name], textarea[name]");
		for (var i = 0; i < inputs.length; i++) {
			var input = inputs[i];
			var name = this._clean(input.attr("name") || "");
			if (!name) continue;
			body[name] = input.attr("value") || "";
		}

		return {
			url: action,
			downloadRequest: method === "POST"
				? { method: "POST", body: body, bodyEncoding: "form" }
				: undefined,
			headers: { Referer: pageUrl },
		};
	},

	search: async function(query, page) {
		var url = await this._searchUrl(query, page || 0);
		cinder.log("[GenericDirectFixture] Search: " + url);
		var html = await this._fetchHtml(url);
		return await this._parseResults(html);
	},

	resolve: async function(item) {
		var baseUrl = await this._getBaseUrl();
		var directUrl = this._absUrl(baseUrl, item && item.extra ? item.extra.directUrl : "");
		if (this._isRestrictedDistributionUrl(directUrl)) {
			var directMd5 = this._md5FromUrl(directUrl) || this._clean(item && item.extra ? item.extra.md5 : "");
			directUrl = await this._placeholderDownloadUrl(
				directMd5 || this._fileIdFromUrl(directUrl) || this._clean(item.id || item.title),
				item.format || "epub",
				{ md5: directMd5 },
			);
		}
		if (directUrl) {
			return {
				url: directUrl,
				fileName: this._clean(item.title || "download") + "." + (item.format || "epub"),
				headers: item.url ? { Referer: item.url } : undefined,
			};
		}

		var pageUrl = this._absUrl(baseUrl, item.url || (item.extra ? item.extra.detailUrl : ""));
		if (!pageUrl) throw new Error("No fixture detail URL to resolve.");

		cinder.log("[GenericDirectFixture] Resolve: " + pageUrl);
		var html = await this._fetchHtml(pageUrl);
		var doc = cinder.parseHTML(html);
		var selector = await this._getSetting(
			"direct_link_selector",
			"a[data-direct-download], a.download, a[href$='.epub'], a[href$='.pdf'], a[href$='.cbz'], a[href$='.cbr']",
		);
		var link = doc.querySelector(selector);
		var href = link
			? (link.attr("data-url") || link.attr("data-href") || link.attr("href") || "")
			: "";
		href = this._absUrl(baseUrl, href);
		if (this._isRestrictedDistributionUrl(href)) {
			var hrefMd5 = this._md5FromUrl(href) || this._clean(item && item.extra ? item.extra.md5 : "");
			href = await this._placeholderDownloadUrl(
				hrefMd5 || this._fileIdFromUrl(href) || this._clean(item.id || item.title),
				item.format || "epub",
				{ md5: hrefMd5 },
			);
		}
		if (href) {
			return {
				url: href,
				fileName: this._clean(item.title || "download") + "." + (item.format || this._detectFormat(href)),
				headers: { Referer: pageUrl },
			};
		}

		var formDownload = await this._extractFormDownload(doc, pageUrl, baseUrl);
		if (formDownload) {
			formDownload.fileName = this._clean(item.title || "download") + "." + (item.format || "epub");
			return formDownload;
		}

		throw new Error("No fixture direct link or download form found.");
	},
};
