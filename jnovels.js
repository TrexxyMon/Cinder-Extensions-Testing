var JNovelsSource = {};

JNovelsSource.id = "jnovels";
JNovelsSource.name = "JNovels";
JNovelsSource.version = "0.1.1-cinder";
JNovelsSource.icon = "JN";
JNovelsSource.description = "Search JNovels light novel EPUB/PDF posts with on-device link resolution.";
JNovelsSource.contentType = "books";
JNovelsSource.contentTypes = ["ebook", "webnovel"];
JNovelsSource.contentSubtypes = ["lightNovel", "webFiction"];
JNovelsSource.capabilities = {
    search: true,
    discover: true,
    download: false,
    resolve: true,
    searchDownloads: true,
    manga: false,
};

JNovelsSource.BASE_URL = "https://jnovels.com";
JNovelsSource.SHORTLINK_HOSTS = ["charexempire.com"];

JNovelsSource.SECTIONS = [
    { id: "light-novels-volumes-epub", title: "Light Novels EPUB" },
    { id: "light-novel-pdf-jnovels", title: "Light Novels PDF" },
    { id: "webnovel-list-jnovels", title: "Web Novels" },
];

JNovelsSource._headers = function(referer) {
    return {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": referer || this.BASE_URL + "/",
    };
};

JNovelsSource._decode = function(text) {
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
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

JNovelsSource._stripTags = function(html) {
    return this._decode(String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
};

JNovelsSource._absoluteUrl = function(url) {
    var value = this._decode(url || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.indexOf("//") === 0) return "https:" + value;
    if (value.charAt(0) === "/") return this.BASE_URL + value;
    return this.BASE_URL + "/" + value;
};

JNovelsSource._searchUrl = function(query, page) {
    var suffix = page && page > 0 ? "/page/" + (page + 1) + "/" : "/";
    return this.BASE_URL + suffix + "?s=" + encodeURIComponent(query || "");
};

JNovelsSource._sectionUrl = function(sectionId, page) {
    var base = this.BASE_URL + "/" + encodeURIComponent(sectionId).replace(/%2F/gi, "/") + "/";
    return page && page > 0 ? base + "page/" + (page + 1) + "/" : base;
};

JNovelsSource._inferFormat = function(title, url) {
    var value = String((title || "") + " " + (url || "")).toLowerCase();
    if (/\bpdf\b|\.pdf(?:\?|#|$)/.test(value)) return "pdf";
    if (/\bepub\b|\.epub(?:\?|#|$)/.test(value)) return "epub";
    if (/\bcbz\b|\.cbz(?:\?|#|$)/.test(value)) return "cbz";
    if (/\bcbr\b|\.cbr(?:\?|#|$)/.test(value)) return "cbr";
    return "epub";
};

JNovelsSource._cleanTitle = function(title) {
    return this._decode(title).replace(/\s+-\s+jnovels\s*$/i, "").replace(/\s+/g, " ").trim();
};

JNovelsSource._slug = function(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "jnovels";
};

JNovelsSource._fileName = function(item, format) {
    var base = this._slug((item && item.title) || "jnovels");
    var ext = String(format || (item && item.format) || "epub").toLowerCase();
    if (!/^(epub|pdf|cbz|cbr)$/.test(ext)) ext = "epub";
    return base + "." + ext;
};

JNovelsSource._extractMeta = function(html, property) {
    var prop = String(property || "").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    var patterns = [
        new RegExp("<meta[^>]+property=[\"']" + prop + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
        new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']" + prop + "[\"'][^>]*>", "i"),
        new RegExp("<meta[^>]+name=[\"']" + prop + "[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>", "i"),
    ];
    for (var i = 0; i < patterns.length; i++) {
        var match = String(html || "").match(patterns[i]);
        if (match && match[1]) return this._decode(match[1]);
    }
    return "";
};

JNovelsSource._extractImage = function(html) {
    var og = this._extractMeta(html, "og:image");
    if (og) return this._absoluteUrl(og);
    var img = String(html || "").match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
    return img && img[1] ? this._absoluteUrl(img[1]) : "";
};

JNovelsSource._extractAnchors = function(html) {
    var anchors = [];
    var regex = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = regex.exec(String(html || ""))) !== null) {
        anchors.push({
            href: this._absoluteUrl(match[2]),
            text: this._stripTags(match[4]),
            attrs: String((match[1] || "") + " " + (match[3] || "")),
        });
    }
    return anchors;
};

JNovelsSource._isShortlink = function(url) {
    var lower = String(url || "").toLowerCase();
    for (var i = 0; i < this.SHORTLINK_HOSTS.length; i++) {
        if (lower.indexOf("//" + this.SHORTLINK_HOSTS[i]) >= 0) return true;
    }
    return false;
};

JNovelsSource._isDirectFile = function(url) {
    return /\.(epub|pdf|cbz|cbr)(?:[?#].*)?$/i.test(String(url || ""));
};

JNovelsSource._pickDownloadLink = function(html, preferredFormat) {
    var anchors = this._extractAnchors(html);
    var direct = [];
    var shortlinks = [];
    for (var i = 0; i < anchors.length; i++) {
        var href = anchors[i].href;
        var text = anchors[i].text || "";
        if (!href) continue;
        if (this._isDirectFile(href)) {
            direct.push({ url: href, text: text });
        } else if (this._isShortlink(href)) {
            shortlinks.push({ url: href, text: text });
        }
    }

    var preferred = String(preferredFormat || "").toLowerCase();
    if (preferred) {
        for (var d = 0; d < direct.length; d++) {
            if (direct[d].url.toLowerCase().indexOf("." + preferred) >= 0 || direct[d].text.toLowerCase().indexOf(preferred) >= 0) {
                return direct[d].url;
            }
        }
    }
    if (direct.length) return direct[0].url;

    for (var s = 0; s < shortlinks.length; s++) {
        var label = String(shortlinks[s].text || "").toLowerCase();
        if (!preferred || label.indexOf(preferred) >= 0 || label.indexOf("volume") >= 0 || label.indexOf("download") >= 0) {
            return shortlinks[s].url;
        }
    }
    return shortlinks.length ? shortlinks[0].url : "";
};

JNovelsSource._resultFromArticle = function(article) {
    var titleMatch = article.match(/<h[12]\b[^>]*class=["'][^"']*(?:post-title|entry-title)[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[12]>/i)
        || article.match(/<h[12][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[12]>/i);
    if (!titleMatch) return null;

    var url = this._absoluteUrl(titleMatch[1]);
    var title = this._cleanTitle(titleMatch[2]);
    if (!url || !title) return null;
    if (/zerobooks/i.test(title)) return null;

    var cover = this._extractImage(article);
    var format = this._inferFormat(title, url);
    var downloadUrl = this._pickDownloadLink(article, format);
    var summaryMatch = article.match(/<div\b[^>]*class=["'][^"']*entry-summary[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    var summary = summaryMatch ? this._stripTags(summaryMatch[1]) : "";
    var dateMatch = article.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i);
    var id = this._slug(url) + "#" + (downloadUrl ? this._slug(downloadUrl) : format);

    return {
        id: id,
        title: title,
        author: undefined,
        cover: cover || undefined,
        url: url,
        format: format,
        source: "JNovels",
        size: "",
        datePublished: dateMatch && dateMatch[1] ? dateMatch[1] : undefined,
        extra: {
            articleUrl: url,
            downloadUrl: downloadUrl || undefined,
            preferredFormat: format,
            summary: summary || undefined,
        },
    };
};


JNovelsSource._parseDirectoryLinks = function(html) {
    var anchors = this._extractAnchors(html);
    var results = [];
    var seen = {};
    for (var i = 0; i < anchors.length; i++) {
        var href = anchors[i].href || "";
        var title = this._cleanTitle(anchors[i].text || "");
        if (!href || !title) continue;
        if (href.indexOf(this.BASE_URL + "/") !== 0) continue;
        if (/\/(?:page|category|tag|author|faq|release-date|randomizer|zerobooks|wp-content|webnovel-list|light-novel-pdf|light-novel-epub|light-novels-volumes|manga-cbz)\//i.test(href)) continue;
        if (/^(?:wn|manga|home|faq|list|gallery)$/i.test(title)) continue;
        if (/continue reading|share|home|light novels|webnovel list|release calendar|randomizer|faq/i.test(title)) continue;
        if (!/(?:epub|pdf|webnovel|light-novel|all-volumes)/i.test(href + " " + title)) continue;
        var format = this._inferFormat(title, href);
        var id = this._slug(href) + "#directory";
        if (seen[id]) continue;
        seen[id] = true;
        results.push({
            id: id,
            title: title,
            url: href,
            format: format,
            source: "JNovels",
            extra: {
                articleUrl: href,
                preferredFormat: format,
            },
        });
    }
    return results;
};

JNovelsSource._parseListings = function(html) {
    var results = [];
    var seen = {};
    var articleRegex = /<article\b[\s\S]*?<\/article>/gi;
    var match;
    while ((match = articleRegex.exec(String(html || ""))) !== null) {
        var result = this._resultFromArticle(match[0]);
        if (!result || seen[result.id]) continue;
        seen[result.id] = true;
        results.push(result);
    }
    if (!results.length) {
        return this._parseDirectoryLinks(html);
    }
    return results;
};

JNovelsSource._fetchHtml = async function(url, referer) {
    var response = await cinder.fetch(url, {
        headers: this._headers(referer),
        timeout: 25000,
    });
    if (!response || response.status < 200 || response.status >= 300 || response.data == null) {
        throw new Error("JNovels request failed" + (response && response.status ? " (HTTP " + response.status + ")" : "") + ": " + url);
    }
    return String(response.data || "");
};

JNovelsSource.search = async function(query, page) {
    if (!query || !String(query).trim()) return [];
    var url = this._searchUrl(String(query).trim(), page || 0);
    try {
        var html = await this._fetchHtml(url, this.BASE_URL + "/");
        return this._parseListings(html).slice(0, 50);
    } catch (err) {
        cinder.warn("[JNovels] search failed: " + (err && err.message ? err.message : String(err)));
        return [];
    }
};

JNovelsSource.getDiscoverSections = async function() {
    return this.SECTIONS.map(function(section) {
        return { id: section.id, title: section.title, icon: "JN" };
    });
};

JNovelsSource.getDiscoverItems = async function(sectionId, page) {
    var section = sectionId || this.SECTIONS[0].id;
    try {
        var html = await this._fetchHtml(this._sectionUrl(section, page || 0), this.BASE_URL + "/");
        return this._parseListings(html).slice(0, 50);
    } catch (err) {
        cinder.warn("[JNovels] discover failed: " + (err && err.message ? err.message : String(err)));
        return [];
    }
};


JNovelsSource._shortlinkNeedsManualFlow = async function(url, referer) {
    try {
        var response = await cinder.fetch(url, {
            headers: this._headers(referer || this.BASE_URL + "/"),
            timeout: 12000,
        });
        var status = response && response.status ? Number(response.status) : 0;
        var html = String((response && response.data) || "").toLowerCase();
        var location = "";
        try {
            location = String(response.headers && (response.headers.location || response.headers.Location || response.headers.LOCATION) || "").toLowerCase();
        } catch (_) {}
        return status === 307 ||
            location.indexOf("safe.php") !== -1 ||
            location.indexOf("kecapku.com") !== -1 ||
            location.indexOf("sazwe.com") !== -1 ||
            html.indexOf("recaptcha") !== -1 ||
            html.indexOf("g-recaptcha") !== -1 ||
            html.indexOf("fuckadblock") !== -1 ||
            html.indexOf("disable adblock") !== -1 ||
            html.indexOf("safe.php") !== -1;
    } catch (_) {
        return false;
    }
};

JNovelsSource.resolve = async function(item) {
    if (!item) throw new Error("JNovels item is missing.");
    var articleUrl = item.url || (item.extra && item.extra.articleUrl) || "";
    var format = this._inferFormat(item.title || "", articleUrl || (item.extra && item.extra.downloadUrl));
    var downloadUrl = (item.extra && item.extra.downloadUrl) || "";

    if (!downloadUrl && articleUrl) {
        var html = await this._fetchHtml(articleUrl, this.BASE_URL + "/");
        downloadUrl = this._pickDownloadLink(html, format);
    }

    if (!downloadUrl) {
        throw new Error("No JNovels download link was found on this result.");
    }

    if (this._isDirectFile(downloadUrl)) {
        return {
            url: downloadUrl,
            fileName: this._fileName(item, this._inferFormat(item.title || "", downloadUrl)),
            headers: this._headers(articleUrl || this.BASE_URL + "/"),
        };
    }

    if (!this._isShortlink(downloadUrl)) {
        throw new Error("JNovels returned an unsupported download host: " + downloadUrl);
    }

    if (await this._shortlinkNeedsManualFlow(downloadUrl, articleUrl || this.BASE_URL + "/")) {
        throw new Error("JNovels uses an interactive captcha/ad shortlink for this file. Cinder cannot complete that invisible download flow yet, so this result cannot be downloaded automatically.");
    }

    return {
        url: downloadUrl,
        fileName: this._fileName(item, format),
        headers: {
            "User-Agent": this._headers()["User-Agent"],
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": articleUrl || this.BASE_URL + "/",
            "X-Cinder-Expect-Interstitial": "1",
        },
        downloadRequest: {
            method: "GET",
            useBrowser: true,
            browserClickDownload: true,
            browserCaptureBlob: true,
            browserMaxWaitMs: 120000,
        },
    };
};

__cinderExport = JNovelsSource;
