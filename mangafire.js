var MangaFire = {};

MangaFire.id = "mangafire";
MangaFire.name = "MangaFire";
MangaFire.version = "0.1.1-cinder";
MangaFire.icon = "MF";
MangaFire.description = "Read manga, manhwa, and manhua from MangaFire. No debrid required.";
MangaFire.contentType = "manga";
MangaFire.contentTypes = ["manga"];
MangaFire.contentSubtypes = ["manga", "manhwa", "manhua"];
MangaFire.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

MangaFire.BASE_URL = "https://mangafire.to";
MangaFire.STATIC_URL = "https://static.mfcdn.nl";

MangaFire._headers = function(extra) {
  var headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  };
  if (extra) {
    Object.keys(extra).forEach(function(key) {
      headers[key] = extra[key];
    });
  }
  return headers;
};

MangaFire._imageHeaders = function(referer) {
  return {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": referer || this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  };
};

MangaFire._decode = function(value) {
  if (!value) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

MangaFire._stripTags = function(value) {
  return this._decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
};

MangaFire._attr = function(html, attr) {
  var re = new RegExp(attr + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  var match = String(html || "").match(re);
  return match ? this._decode(match[2]) : "";
};

MangaFire._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim());
  if (!url || /^data:/i.test(url) || /^blob:/i.test(url)) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

MangaFire._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname.replace(/\/+$/, "");
  } catch (e) {
    return raw.replace(this.BASE_URL, "").split(/[?#]/)[0].replace(/\/+$/, "");
  }
};

MangaFire._isBlockedHtml = function(res) {
  return !res ||
    res.status === 0 ||
    res.status === 403 ||
    res.status === 429 ||
    (res.data && /cf-challenge|turnstile|checking your browser|just a moment|Request is invalid/i.test(String(res.data)));
};

MangaFire._fetchText = async function(url, referer, browserOptions) {
  var res = await cinder.fetch(url, {
    headers: this._headers({ "Referer": referer || this.BASE_URL + "/" }),
    timeout: 30000,
  });
  if (this._isBlockedHtml(res) && cinder && typeof cinder.fetchBrowser === "function") {
    browserOptions = browserOptions || {};
    var browserHeaders = {
      "Referer": referer || this.BASE_URL + "/",
      "X-Cinder-Suppress-Interactive": "1",
      "X-Cinder-Wake-Page": "1",
      "X-Cinder-Min-Wait-Ms": String(browserOptions.minWaitMs || 1500),
      "X-Cinder-Max-Wait-Ms": String(browserOptions.maxWaitMs || 12000),
    };
    if (browserOptions.waitForSelector) {
      browserHeaders["X-Cinder-Wait-For-Selector"] = browserOptions.waitForSelector;
    }
    res = await cinder.fetchBrowser(url, {
      headers: browserHeaders,
      timeout: 30000,
    });
  }
  if (!res || res.status < 200 || res.status >= 300 || !res.data) {
    throw new Error("MangaFire request failed for " + url + " (HTTP " + (res ? res.status : 0) + ")");
  }
  return String(res.data || "");
};

MangaFire._fetchRenderedHtml = async function(url, referer) {
  if (!cinder || typeof cinder.fetchBrowser !== "function") {
    throw new Error("MangaFire pages are JavaScript-rendered and require Cinder's browser fetch support.");
  }
  var res = await cinder.fetchBrowser(url, {
    headers: {
      "Referer": referer || this.BASE_URL + "/",
      "X-Cinder-Suppress-Interactive": "1",
      "X-Cinder-Wait-For-Selector": "#page-wrapper img, img[src*='mfcdn'], img[data-src*='mfcdn']",
      "X-Cinder-Wake-Page": "1",
      "X-Cinder-Visible-Layout": "1",
      "X-Cinder-Min-Wait-Ms": "2500",
      "X-Cinder-Max-Wait-Ms": "18000",
    },
    timeout: 30000,
  });
  if (!res || res.status < 200 || res.status >= 300 || !res.data) {
    throw new Error("MangaFire rendered page request failed for " + url + " (HTTP " + (res ? res.status : 0) + ")");
  }
  return String(res.data || "");
};

MangaFire._imageFromTag = function(tag) {
  var dataSrc = this._attr(tag, "data-src");
  var dataOriginal = this._attr(tag, "data-original");
  var dataLazy = this._attr(tag, "data-lazy-src") || this._attr(tag, "data-lazy");
  var srcset = this._attr(tag, "srcset");
  var src = this._attr(tag, "src");
  var srcsetFirst = "";
  if (srcset) srcsetFirst = srcset.split(",")[0].trim().split(/\s+/)[0];
  return this._absUrl(dataSrc) || this._absUrl(dataOriginal) || this._absUrl(dataLazy) || this._absUrl(srcsetFirst) || this._absUrl(src);
};

MangaFire._titleFromPath = function(path) {
  var parts = this._pathFromUrl(path).split("/").filter(Boolean);
  var slug = parts.length ? parts[parts.length - 1] : String(path || "");
  slug = slug.replace(/\.[a-z0-9]+$/i, "");
  return slug.replace(/-/g, " ").replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
};

MangaFire._subtypeFromText = function(value) {
  var normalized = String(value || "").toLowerCase().replace(/[_\s-]+/g, "");
  if (normalized === "manhwa") return "manhwa";
  if (normalized === "manhua") return "manhua";
  if (normalized === "oneshot") return "oneShot";
  if (normalized === "doujinshi") return "doujinshi";
  if (normalized === "novel") return "lightNovel";
  return "manga";
};

MangaFire._statusFromText = function(value) {
  var text = String(value || "").toLowerCase();
  if (/complete|finished|ended/.test(text)) return "completed";
  if (/hiatus|paused/.test(text)) return "hiatus";
  if (/cancel/.test(text)) return "cancelled";
  if (/releas|ongoing|publishing/.test(text)) return "ongoing";
  return undefined;
};

MangaFire._numberFromText = function(value) {
  var match = String(value || "").match(/chapter[-\s:]*([0-9]+(?:\.[0-9]+)?)/i) ||
    String(value || "").match(/\bchap(?:ter)?\.?\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    String(value || "").match(/\b([0-9]+(?:\.[0-9]+)?)\b/);
  return match ? parseFloat(match[1]) : 0;
};

MangaFire._parseCards = function(html) {
  var results = [];
  var seen = {};
  var cardRe = /<div[^>]+class=["'][^"']*\bunit\b[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*\bunit\b|<nav[^>]+class=["'][^"']*\bnavigation\b|<\/section>|$)/gi;
  var match;
  while ((match = cardRe.exec(html)) !== null) {
    var block = match[0];
    var linkMatch =
      block.match(/<a[^>]+href=["']([^"']*\/manga\/[^"']+)["'][^>]*class=["'][^"']*\bposter\b[^"']*["'][\s\S]*?>/i) ||
      block.match(/<a[^>]+class=["'][^"']*\bposter\b[^"']*["'][^>]+href=["']([^"']*\/manga\/[^"']+)["'][\s\S]*?>/i) ||
      block.match(/<a[^>]+href=["']([^"']*\/manga\/[^"']+)["'][\s\S]*?>/i);
    if (!linkMatch) continue;
    var url = this._absUrl(linkMatch[1]);
    var path = this._pathFromUrl(url);
    if (!path || seen[path]) continue;
    seen[path] = true;

    var imgTag = (block.match(/<img[\s\S]*?>/i) || [])[0] || "";
    var cover = this._imageFromTag(imgTag);
    var title =
      this._decode(this._attr(imgTag, "alt")) ||
      this._stripTags((block.match(/<a[^>]+href=["'][^"']*\/manga\/[^"']+["'][^>]*>([^<]{2,})<\/a>/i) || [])[1]) ||
      this._titleFromPath(path);
    var typeText = this._stripTags((block.match(/<span[^>]+class=["'][^"']*\btype\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
    var subtype = this._subtypeFromText(typeText);
    results.push({
      id: path,
      title: title,
      cover: cover || undefined,
      coverHeaders: cover ? this._imageHeaders(url) : undefined,
      url: url,
      format: "manga",
      contentType: "manga",
      contentTypes: ["manga"],
      contentSubtypes: [subtype],
      extra: {
        sourceType: typeText || "Manga",
      },
    });
  }

  var unitAnchorRe = /<a[^>]+class=["'][^"']*\bunit\b[^"']*["'][^>]+href=["']([^"']*\/manga\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var unitMatch;
  while ((unitMatch = unitAnchorRe.exec(html)) !== null) {
    var anchorUrl = this._absUrl(unitMatch[1]);
    var anchorPath = this._pathFromUrl(anchorUrl);
    if (!anchorPath || seen[anchorPath]) continue;
    var anchorBlock = unitMatch[2] || "";
    var anchorImg = (anchorBlock.match(/<img[\s\S]*?>/i) || [])[0] || "";
    var anchorCover = this._imageFromTag(anchorImg);
    var anchorTitle =
      this._stripTags((anchorBlock.match(/<h6[^>]*>([\s\S]*?)<\/h6>/i) || [])[1]) ||
      this._decode(this._attr(anchorImg, "alt")) ||
      this._titleFromPath(anchorPath);
    var spanStatus = this._stripTags((anchorBlock.match(/<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1]);
    seen[anchorPath] = true;
    results.push({
      id: anchorPath,
      title: anchorTitle,
      cover: anchorCover || undefined,
      coverHeaders: anchorCover ? this._imageHeaders(anchorUrl) : undefined,
      url: anchorUrl,
      format: "manga",
      contentType: "manga",
      contentTypes: ["manga"],
      contentSubtypes: ["manga"],
      extra: {
        status: spanStatus || undefined,
      },
    });
  }
  return results;
};

MangaFire._extractSynopsis = function(html) {
  var modal = (html.match(/<div[^>]+id=["']synopsis["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i) || [])[0] || "";
  var text = this._stripTags(modal);
  text = text.replace(/^synopsis\s*/i, "").trim();
  if (text && text !== "...") return text;
  var inline = (html.match(/<div[^>]+class=["'][^"']*\bsynopsis\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
  text = this._stripTags(inline);
  return text === "..." ? "" : text;
};

MangaFire._extractMetaValue = function(html, label) {
  var rowRe = new RegExp("<div[^>]*>\\s*<span[^>]*>\\s*" + label + "\\s*:?\\s*<\\/span>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>\\s*<\\/div>", "i");
  var rowMatch = html.match(rowRe);
  if (rowMatch) return this._stripTags(rowMatch[1]);
  var re = new RegExp("<span[^>]*>\\s*" + label + "\\s*:?\\s*<\\/span>\\s*<[^>]+>([\\s\\S]*?)<\\/", "i");
  var match = html.match(re);
  if (match) return this._stripTags(match[1]);
  re = new RegExp(label + "\\s*:?\\s*<\\/span>([\\s\\S]{0,600}?)(?:<span|<\\/div>)", "i");
  match = html.match(re);
  return match ? this._stripTags(match[1]) : "";
};

MangaFire.search = async function(query, page) {
  var pageNumber = (page || 0) + 1;
  var trimmed = String(query || "").trim();
  var url = this.BASE_URL + "/filter?keyword=" + encodeURIComponent(trimmed) + "&language%5B%5D=en&page=" + pageNumber;
  var html = await this._fetchText(url, this.BASE_URL + "/", {
    waitForSelector: ".original.card-lg .unit, .unit.item, a.unit[href*='/manga/']",
    minWaitMs: 2200,
    maxWaitMs: 12000,
  });
  var results = this._parseCards(html);
  if (results.length > 0 || !trimmed) return results;

  // Last-resort fallback: MangaFire's quick-search endpoint sometimes works
  // without a vrf token but can return default suggestions, so only keep
  // obvious title matches.
  try {
    var ajax = await cinder.fetch(this.BASE_URL + "/ajax/manga/search?query=" + encodeURIComponent(trimmed), {
      headers: this._headers({
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": this.BASE_URL + "/",
      }),
      timeout: 8000,
    });
    if (ajax && ajax.status >= 200 && ajax.status < 300 && ajax.data) {
      var parsed = JSON.parse(String(ajax.data));
      var ajaxHtml = parsed && parsed.result && parsed.result.html ? String(parsed.result.html) : "";
      var needle = trimmed.toLowerCase();
      return this._parseCards(ajaxHtml).filter(function(item) {
        return String(item.title || "").toLowerCase().indexOf(needle) !== -1;
      });
    }
  } catch (e) {}
  return [];
};

MangaFire.getDiscoverSections = async function() {
  return [
    { id: "newest", title: "Newest", icon: "new" },
    { id: "updated", title: "Updated", icon: "time" },
    { id: "added", title: "Recently Added", icon: "plus" },
    { id: "manga", title: "Manga", icon: "book" },
    { id: "manhwa", title: "Manhwa", icon: "book-open" },
    { id: "manhua", title: "Manhua", icon: "book-open" },
  ];
};

MangaFire.getDiscoverItems = async function(sectionId, page) {
  var pageNumber = (page || 0) + 1;
  var path = "/newest";
  if (sectionId === "updated") path = "/updated";
  else if (sectionId === "added") path = "/added";
  else if (sectionId === "manga") path = "/type/manga";
  else if (sectionId === "manhwa") path = "/type/manhwa";
  else if (sectionId === "manhua") path = "/type/manhua";
  var html = await this._fetchText(this.BASE_URL + path + "?page=" + pageNumber);
  return this._parseCards(html);
};

MangaFire.getMangaDetails = async function(id) {
  var path = this._pathFromUrl(id);
  var url = this._absUrl(path);
  var html = await this._fetchText(url);

  var title =
    this._stripTags((html.match(/<h1[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) ||
    this._stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) ||
    this._titleFromPath(path);
  var coverTag = (html.match(/<div[^>]+class=["'][^"']*\bposter\b[^"']*["'][\s\S]*?<img[\s\S]*?>/i) || [])[0] ||
    (html.match(/<img[^>]+itemprop=["']image["'][\s\S]*?>/i) || [])[0] ||
    (html.match(/<img[\s\S]*?>/i) || [])[0] ||
    "";
  var cover = this._imageFromTag(coverTag);
  var authorBlock = (html.match(/<div[^>]*>\s*<span[^>]*>\s*Author\s*:?\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i) || [])[1] || "";
  var author = this._stripTags((authorBlock.match(/<a[\s\S]*?>([\s\S]*?)<\/a>/i) || [])[1]) || this._stripTags(authorBlock);
  var genres = [];
  var genreBlock = (html.match(/<div[^>]*>\s*<span[^>]*>\s*Genres?\s*:?\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i) || [])[1] || "";
  var genreRe = /<a[\s\S]*?>([\s\S]*?)<\/a>/gi;
  var genreMatch;
  while ((genreMatch = genreRe.exec(genreBlock)) !== null) {
    var genre = this._stripTags(genreMatch[1]);
    if (genre) genres.push(genre);
  }
  var statusText =
    this._stripTags((html.match(/<div[^>]+class=["'][^"']*\binfo\b[^"']*["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]) ||
    this._extractMetaValue(html, "Status");

  return {
    id: path,
    title: title,
    author: author || undefined,
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(url) : undefined,
    description: this._extractSynopsis(html) || undefined,
    status: this._statusFromText(statusText),
    genres: genres,
    format: "manga",
    contentType: "manga",
  };
};

MangaFire.getChapters = async function(mangaId) {
  var path = this._pathFromUrl(mangaId);
  var url = this._absUrl(path);
  var html = await this._fetchText(url);
  var chapters = [];
  var seen = {};
  var chapterScope = (html.match(/<div[^>]+class=["'][^"']*\btab-content\b[^"']*["'][^>]*data-name=["']chapter["'][\s\S]*?(?=<div[^>]+class=["'][^"']*\btab-content\b|<\/main>|<\/body>|$)/i) || [])[0] || html;
  var rowRe = /<li[^>]+class=["'][^"']*\bitem\b[^"']*["'][^>]*data-number=["']?([^"'>\s]+)["']?[^>]*>\s*<a[^>]+href=["']([^"']*\/read\/[^"']+)["'][^>]*title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
  var rowMatch;
  var sourceIndex = 0;
  while ((rowMatch = rowRe.exec(chapterScope)) !== null) {
    var dataNumber = rowMatch[1] || "";
    var href = this._absUrl(rowMatch[2]);
    var chapterPath = this._pathFromUrl(href);
    if (!chapterPath || seen[chapterPath]) continue;
    seen[chapterPath] = true;

    var titleAttr = this._decode(rowMatch[3]);
    var linkInner = rowMatch[4] || "";
    var spans = [];
    var spanRe = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    var spanMatch;
    while ((spanMatch = spanRe.exec(linkInner)) !== null) {
      var spanText = this._stripTags(spanMatch[1]);
      if (spanText) spans.push(spanText);
    }
    var firstSpan = spans.length ? spans[0].replace(/\s+$/, "") : "";
    var dateText = spans.length > 1 ? spans[spans.length - 1] : "";
    var number = parseFloat(dataNumber) || this._numberFromText(chapterPath) || this._numberFromText(titleAttr) || sourceIndex + 1;
    var title = firstSpan || titleAttr || ("Chapter " + number);
    chapters.push({
      id: chapterPath,
      title: this._decode(title),
      chapterNumber: number,
      dateUploaded: dateText || undefined,
      _sourceIndex: sourceIndex++,
    });
  }

  if (chapters.length === 0) {
    var linkRe = /<a[^>]+href=["']([^"']*\/read\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var linkMatch;
    while ((linkMatch = linkRe.exec(chapterScope)) !== null) {
      var fallbackPath = this._pathFromUrl(this._absUrl(linkMatch[1]));
      if (!fallbackPath || seen[fallbackPath]) continue;
      seen[fallbackPath] = true;
      var fallbackNumber = this._numberFromText(fallbackPath) || sourceIndex + 1;
      chapters.push({
        id: fallbackPath,
        title: this._stripTags(linkMatch[2]) || ("Chapter " + fallbackNumber),
        chapterNumber: fallbackNumber,
        _sourceIndex: sourceIndex++,
      });
    }
  }

  if (chapters.length === 0) throw new Error("MangaFire returned no chapters.");
  return chapters.sort(function(a, b) {
    var aNum = Number.isFinite(a.chapterNumber) && a.chapterNumber > 0 ? a.chapterNumber : Number.POSITIVE_INFINITY;
    var bNum = Number.isFinite(b.chapterNumber) && b.chapterNumber > 0 ? b.chapterNumber : Number.POSITIVE_INFINITY;
    if (aNum !== bNum) return aNum - bNum;
    return a._sourceIndex - b._sourceIndex;
  }).map(function(chapter) {
    delete chapter._sourceIndex;
    return chapter;
  });
};

MangaFire._extractPagesFromHtml = function(html, referer) {
  var pages = [];
  var seen = {};
  var wrapper = (html.match(/<div[^>]+id=["']page-wrapper["'][\s\S]*?(?=<div[^>]+id=["']controls["']|<\/body>|$)/i) || [])[0] || html;
  var imgRe = /<img[\s\S]*?>/gi;
  var match;
  while ((match = imgRe.exec(wrapper)) !== null) {
    var tag = match[0];
    var src = this._imageFromTag(tag);
    if (!src || seen[src]) continue;
    if (src.indexOf("mfcdn.nl") === -1 && src.indexOf("mangafire") === -1) continue;
    var alt = this._decode(this._attr(tag, "alt"));
    if (/avatar|logo|poster|cover|captcha|banner|icon/i.test(alt + " " + tag)) continue;
    seen[src] = true;
    pages.push({
      url: src,
      headers: this._imageHeaders(referer),
    });
  }
  return pages;
};

MangaFire.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var chapterUrl = this._absUrl(path);
  var html = "";
  try {
    html = await this._fetchText(chapterUrl, this.BASE_URL + "/");
  } catch (e) {
    html = "";
  }
  var pages = html ? this._extractPagesFromHtml(html, chapterUrl) : [];

  if (pages.length === 0) {
    var rendered = await this._fetchRenderedHtml(chapterUrl, this.BASE_URL + "/");
    pages = this._extractPagesFromHtml(rendered, chapterUrl);
  }

  if (pages.length === 0) throw new Error("MangaFire returned no pages for this chapter.");
  return pages;
};

MangaFire.getSettings = function() {
  return [];
};

__cinderExport = MangaFire;
