var ReadComicsOnline = {};

ReadComicsOnline.id = "readcomicsonline";
ReadComicsOnline.name = "ReadComicsOnline";
ReadComicsOnline.version = "0.1.1-cinder";
ReadComicsOnline.icon = "RCO";
ReadComicsOnline.description = "Read western comics from ReadComicsOnline.ru. No debrid required.";
ReadComicsOnline.contentType = "comics";
ReadComicsOnline.contentTypes = ["comic"];
ReadComicsOnline.contentSubtypes = ["westernComic"];
ReadComicsOnline.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};
ReadComicsOnline.browser = {
  startUrl: "https://readcomicsonline.ru/",
  userAgent: "desktop",
  requiresAuth: false,
};

ReadComicsOnline.BASE_URL = "https://readcomicsonline.ru";
ReadComicsOnline.PAGE_SIZE = 24;

ReadComicsOnline._headers = function(extra) {
  var headers = {
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (extra) {
    Object.keys(extra).forEach(function(key) {
      headers[key] = extra[key];
    });
  }
  return headers;
};

ReadComicsOnline._browserHeaders = function(options) {
  options = options || {};
  var headers = this._headers(options.headers);
  headers["X-Cinder-Suppress-Interactive"] = "1";
  headers["X-Cinder-Browser-User-Agent"] = "desktop";
  headers["X-Cinder-Wake-Page"] = "1";
  headers["X-Cinder-Visible-Layout"] = "1";
  headers["X-Cinder-Min-Wait-Ms"] = String(options.minWaitMs || 2500);
  headers["X-Cinder-Max-Wait-Ms"] = String(options.maxWaitMs || 30000);
  if (options.waitForSelector) {
    headers["X-Cinder-Wait-For-Selector"] = options.waitForSelector;
  }
  return headers;
};

ReadComicsOnline._decode = function(value) {
  if (!value) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, function(_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/&#([0-9]+);/g, function(_, decimal) {
      return String.fromCharCode(parseInt(decimal, 10));
    })
    .replace(/\s+/g, " ")
    .trim();
};

ReadComicsOnline._stripTags = function(value) {
  return this._decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
};

ReadComicsOnline._absUrl = function(value) {
  var raw = this._decode(value).replace(/\\\//g, "/").trim();
  if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return "";
  if (raw.indexOf("//") === 0) return "https:" + raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.charAt(0) === "/") return this.BASE_URL + raw;
  return this.BASE_URL + "/" + raw.replace(/^\/+/, "");
};

ReadComicsOnline._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(/^https?:\/\//i.test(raw) ? raw : this.BASE_URL + (raw.charAt(0) === "/" ? raw : "/" + raw));
    return parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  } catch (error) {
    return raw.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0].replace(/\/{2,}/g, "/").replace(/\/$/, "");
  }
};

ReadComicsOnline._slugFromId = function(value) {
  var path = this._pathFromUrl(value);
  var parts = path.split("/").filter(Boolean);
  if (parts[0] && parts[0].toLowerCase() === "comic" && parts[1]) return parts[1];
  return parts.length ? parts[parts.length - 1] : String(value || "").trim();
};

ReadComicsOnline._seriesPath = function(value) {
  var slug = this._slugFromId(value);
  return slug ? "/comic/" + slug : "";
};

ReadComicsOnline._titleFromSlug = function(value) {
  var slug = this._slugFromId(value);
  return this._decode(slug.replace(/-/g, " ")).replace(/\b\w/g, function(ch) {
    return ch.toUpperCase();
  });
};

ReadComicsOnline._guessCover = function(seriesPath) {
  var slug = this._slugFromId(seriesPath);
  return slug ? this.BASE_URL + "/uploads/manga/" + slug + "/cover/cover_250x350.jpg" : "";
};

ReadComicsOnline._imageHeaders = function(referer) {
  return {
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": referer || this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

ReadComicsOnline._isProtectionPage = function(value) {
  var text = String(value || "");
  return /Just a moment|cf-chl-|challenge-platform|challenge-error-text|Attention Required|Enable JavaScript and cookies to continue|Checking your browser|security verification|verify you are human|turnstile|Cloudflare Ray ID/i.test(text);
};

ReadComicsOnline._isUsableResponse = function(response, options) {
  if (!response || response.status < 200 || response.status >= 300 || !response.data) return false;
  var text = String(response.data || "");
  if (!text || this._isProtectionPage(text)) return false;
  if (options && options.requiredPattern) {
    options.requiredPattern.lastIndex = 0;
    if (!options.requiredPattern.test(text)) return false;
  }
  return true;
};

ReadComicsOnline._fetchBrowser = async function(url, options) {
  if (!cinder || typeof cinder.fetchBrowser !== "function") return null;
  try {
    return await cinder.fetchBrowser(url, {
      headers: this._browserHeaders(options),
      timeout: options.timeout || 30000,
      browserUserAgent: "desktop",
    });
  } catch (error) {
    if (cinder.warn) cinder.warn("ReadComicsOnline browser fallback failed for " + url);
    return null;
  }
};

ReadComicsOnline._fetchText = async function(url, options) {
  options = options || {};
  var response = null;
  if (!options.browserOnly && cinder && typeof cinder.fetch === "function") {
    try {
      response = await cinder.fetch(url, {
        headers: this._headers(options.headers),
        timeout: options.timeout || 25000,
      });
    } catch (error) {
      response = null;
    }
  }
  if (!this._isUsableResponse(response, options)) {
    response = await this._fetchBrowser(url, options);
  }
  if (!this._isUsableResponse(response, options)) {
    var status = response && response.status ? " (HTTP " + response.status + ")" : "";
    throw new Error("ReadComicsOnline request failed" + status + ": " + url);
  }
  return String(response.data || "");
};

ReadComicsOnline._parseJson = function(value) {
  var text = String(value || "").replace(/^\uFEFF/, "").trim();
  if (/^</.test(text) && cinder && typeof cinder.parseHTML === "function") {
    var doc = cinder.parseHTML(text);
    var pre = doc.querySelector("pre");
    if (pre) text = pre.text();
  }
  var preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) text = this._decode(preMatch[1]);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("ReadComicsOnline returned invalid search data.");
  }
};

ReadComicsOnline._imageFromNode = function(node) {
  if (!node) return "";
  var srcset = node.attr("data-srcset") || node.attr("srcset") || "";
  var srcsetFirst = srcset ? srcset.split(",")[0].trim().split(/\s+/)[0] : "";
  return this._absUrl(
    node.attr("data-background-image") ||
    node.attr("data-cfsrc") ||
    node.attr("data-lazy-src") ||
    node.attr("data-src") ||
    node.attr("data-original") ||
    node.attr("src") ||
    srcsetFirst
  );
};

ReadComicsOnline._searchItems = function(payload, page) {
  var suggestions = payload && Array.isArray(payload.suggestions) ? payload.suggestions : [];
  var offset = Math.max(0, Number(page) || 0) * this.PAGE_SIZE;
  var source = suggestions.slice(offset, offset + this.PAGE_SIZE);
  var results = [];
  var seen = {};
  for (var i = 0; i < source.length; i++) {
    var suggestion = source[i] || {};
    var path = this._seriesPath(suggestion.data || suggestion.url || suggestion.value);
    if (!path || seen[path]) continue;
    seen[path] = true;
    var cover = this._guessCover(path);
    results.push({
      id: path,
      title: this._stripTags(suggestion.value) || this._titleFromSlug(path),
      author: "Unknown",
      cover: cover || undefined,
      coverHeaders: cover ? this._imageHeaders(this.BASE_URL + path) : undefined,
      url: this.BASE_URL + path,
      format: "comics",
      contentType: "comics",
      contentTypes: ["comic"],
    });
  }
  return results;
};

ReadComicsOnline._parseCards = function(html) {
  var results = [];
  var seen = {};
  if (!cinder || typeof cinder.parseHTML !== "function") return results;
  var doc = cinder.parseHTML(html);
  var cards = doc.querySelectorAll("div.comic-list-layout .grid > .group");
  if (cards.length === 0) cards = doc.querySelectorAll(".comic-list-layout .group");
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var anchor = card.querySelector("a.block.text-sm.font-semibold") || card.querySelector("a[href*='/comic/']");
    if (!anchor) continue;
    var path = this._pathFromUrl(anchor.attr("href") || "");
    var parts = path.split("/").filter(Boolean);
    if (parts.length !== 2 || String(parts[0]).toLowerCase() !== "comic" || seen[path]) continue;
    seen[path] = true;
    var image = card.querySelector("img");
    var cover = this._imageFromNode(image) || this._guessCover(path);
    var title = this._decode(anchor.text()) || this._decode(image && image.attr("alt")) || this._titleFromSlug(path);
    results.push({
      id: path,
      title: title,
      author: "Unknown",
      cover: cover || undefined,
      coverHeaders: cover ? this._imageHeaders(this.BASE_URL + path) : undefined,
      url: this.BASE_URL + path,
      format: "comics",
      contentType: "comics",
      contentTypes: ["comic"],
    });
  }
  return results;
};

ReadComicsOnline.search = async function(query, page) {
  var value = String(query || "").trim();
  if (!value) return [];
  var url = this.BASE_URL + "/search?query=" + encodeURIComponent(value);
  var text = await this._fetchText(url, {
    requiredPattern: /suggestions|<pre/i,
    waitForSelector: "pre",
    minWaitMs: 2500,
    maxWaitMs: 12000,
  });
  return this._searchItems(this._parseJson(text), page || 0);
};

ReadComicsOnline.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular", icon: "flame" },
    { id: "latest", title: "Latest", icon: "clock" },
  ];
};

ReadComicsOnline.getDiscoverItems = async function(sectionId, page) {
  var sort = sectionId === "latest" ? "latest" : "views";
  var sitePage = Math.max(1, (Number(page) || 0) + 1);
  var url = this.BASE_URL + "/comic-list?sort=" + sort + "&page=" + sitePage;
  var html = await this._fetchText(url, {
    requiredPattern: /comic-list-layout|href=["'][^"']*\/comic\//i,
    waitForSelector: "div.comic-list-layout .grid > .group",
    minWaitMs: 700,
    maxWaitMs: 18000,
  });
  var results = this._parseCards(html);
  if (results.length === 0) throw new Error("ReadComicsOnline returned no browse results.");
  return results;
};

ReadComicsOnline._metadataFromRows = function(doc) {
  var metadata = { author: "", genres: [], status: undefined };
  var rows = doc.querySelectorAll("dl div");
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var text = this._decode(row.text());
    var links = row.querySelectorAll("a");
    var linkValues = [];
    for (var j = 0; j < links.length; j++) {
      var linkText = this._decode(links[j].text());
      if (linkText) linkValues.push(linkText);
    }
    if (/\bAuthor\s*:/i.test(text)) {
      metadata.author = linkValues.join(", ") || text.replace(/^.*?Author\s*:\s*/i, "").trim();
    } else if (/\bGenres?\s*:/i.test(text) || /\bCategories\s*:/i.test(text)) {
      metadata.genres = linkValues.length ? linkValues : text.replace(/^.*?(?:Genres?|Categories)\s*:\s*/i, "").split(",").map(function(value) {
        return value.trim();
      }).filter(Boolean);
    } else if (/\bStatus\s*:/i.test(text)) {
      var statusText = text.replace(/^.*?Status\s*:\s*/i, "").toLowerCase();
      if (/complete|finished/.test(statusText)) metadata.status = "completed";
      else if (/ongoing|active/.test(statusText)) metadata.status = "ongoing";
      else if (/hiatus|paused/.test(statusText)) metadata.status = "hiatus";
      else if (/drop|cancel/.test(statusText)) metadata.status = "cancelled";
    }
  }
  if (!metadata.author) {
    var authorRows = doc.querySelectorAll("div");
    var bestAuthor = "";
    var bestLength = Number.POSITIVE_INFINITY;
    for (var authorIndex = 0; authorIndex < authorRows.length; authorIndex++) {
      var authorRow = authorRows[authorIndex];
      var authorText = this._decode(authorRow.text());
      if (!/^Author\s*:/i.test(authorText)) continue;
      var authorLinks = authorRow.querySelectorAll("a");
      var authorValues = [];
      for (var authorLinkIndex = 0; authorLinkIndex < authorLinks.length; authorLinkIndex++) {
        var authorValue = this._decode(authorLinks[authorLinkIndex].text());
        if (authorValue) authorValues.push(authorValue);
      }
      var candidate = authorValues.join(", ") || authorText.replace(/^Author\s*:\s*/i, "").trim();
      if (candidate && authorText.length < bestLength) {
        bestAuthor = candidate;
        bestLength = authorText.length;
      }
    }
    metadata.author = bestAuthor;
  }
  if (!metadata.status) {
    var badges = doc.querySelectorAll("div.flex.flex-wrap.gap-2 span.rounded-full");
    for (var k = 0; k < badges.length; k++) {
      var badge = this._decode(badges[k].text()).toLowerCase();
      if (/complete|finished/.test(badge)) metadata.status = "completed";
      else if (/ongoing|active/.test(badge)) metadata.status = "ongoing";
      else if (/hiatus|paused/.test(badge)) metadata.status = "hiatus";
      else if (/drop|cancel/.test(badge)) metadata.status = "cancelled";
      if (metadata.status) break;
    }
  }
  return metadata;
};

ReadComicsOnline.getMangaDetails = async function(id) {
  var path = this._seriesPath(id);
  if (!path) throw new Error("Invalid ReadComicsOnline comic id.");
  var url = this.BASE_URL + path;
  var html = await this._fetchText(url, {
    requiredPattern: /text-2xl|overflow-hidden[^"']*border-ink-600/i,
    waitForSelector: "h1.text-2xl",
    minWaitMs: 700,
    maxWaitMs: 18000,
  });
  if (!cinder || typeof cinder.parseHTML !== "function") {
    throw new Error("ReadComicsOnline requires Cinder HTML parser support.");
  }
  var doc = cinder.parseHTML(html);
  var titleNode = doc.querySelector("h1.text-2xl") || doc.querySelector("h1");
  var image = doc.querySelector("img.w-full.rounded-xl") || doc.querySelector("main img");
  var descriptionNode = doc.querySelector("p.mt-5.text-sm") || doc.querySelector(".summary p");
  var metadata = this._metadataFromRows(doc);
  var cover = this._imageFromNode(image) || this._guessCover(path);
  return {
    id: path,
    title: this._decode(titleNode && titleNode.text()) || this._titleFromSlug(path),
    author: metadata.author || "Unknown",
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(url) : undefined,
    description: this._decode(descriptionNode && descriptionNode.text()) || undefined,
    genres: metadata.genres,
    status: metadata.status,
    format: "comics",
    contentType: "comics",
  };
};

ReadComicsOnline._parseDate = function(value) {
  var text = this._decode(value).replace(/\b([A-Za-z]{3})\./, "$1");
  if (!text) return undefined;
  var parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().split("T")[0] : undefined;
};

ReadComicsOnline._cleanChapterTitle = function(seriesTitle, value, path) {
  var title = this._decode(value);
  if (seriesTitle && title.toLowerCase().indexOf(seriesTitle.toLowerCase()) === 0) {
    title = title.slice(seriesTitle.length).trim();
  }
  title = title.replace(/^[:\s-]+/, "").replace(/^#\s*/, "").trim();
  if (!title) {
    var token = this._pathFromUrl(path).split("/").filter(Boolean).pop() || "";
    try { token = decodeURIComponent(token); } catch (error) {}
    title = token.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").trim();
  }
  if (/^\d+(?:\.\d+)?(?:\s|$)/.test(title)) return "Issue #" + title;
  return title || "Issue";
};

ReadComicsOnline._numberFromChapter = function(title, path) {
  var source = String(title || "");
  var match = source.match(/(?:Issue\s*)?#\s*(\d+(?:\.\d+)?)/i) || source.match(/^Issue\s+(\d+(?:\.\d+)?)/i);
  if (match) return Number(match[1]);
  var token = this._pathFromUrl(path).split("/").filter(Boolean).pop() || "";
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  var year = source.match(/\b(19|20)\d{2}\b/) || token.match(/(19|20)\d{2}/);
  return year ? Number(year[0]) : 0;
};

ReadComicsOnline.getChapters = async function(mangaId) {
  var path = this._seriesPath(mangaId);
  if (!path) return [];
  var url = this.BASE_URL + path;
  var html = await this._fetchText(url, {
    requiredPattern: /overflow-hidden[^"']*border-ink-600|href=["'][^"']*\/comic\/[^"']+\/[^"']+/i,
    waitForSelector: ".overflow-hidden.border-ink-600 > a",
    minWaitMs: 700,
    maxWaitMs: 18000,
  });
  if (!cinder || typeof cinder.parseHTML !== "function") {
    throw new Error("ReadComicsOnline requires Cinder HTML parser support.");
  }
  var doc = cinder.parseHTML(html);
  var titleNode = doc.querySelector("h1.text-2xl") || doc.querySelector("h1");
  var seriesTitle = this._decode(titleNode && titleNode.text()) || this._titleFromSlug(path);
  var nodes = doc.querySelectorAll(".overflow-hidden.border-ink-600 > a");
  if (nodes.length === 0) nodes = doc.querySelectorAll("a[href*='/comic/']");
  var chapters = [];
  var seen = {};
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var chapterPath = this._pathFromUrl(node.attr("href") || "");
    var parts = chapterPath.split("/").filter(Boolean);
    if (parts.length !== 3 || String(parts[0]).toLowerCase() !== "comic" || parts[1].toLowerCase() !== this._slugFromId(path).toLowerCase() || seen[chapterPath]) continue;
    seen[chapterPath] = true;
    var nameNode = node.querySelector(".text-brand-400");
    var dateNode = node.querySelector(".text-slate-500");
    var rawTitle = this._decode(nameNode ? nameNode.text() : node.text());
    var title = this._cleanChapterTitle(seriesTitle, rawTitle, chapterPath);
    chapters.push({
      id: chapterPath,
      title: title,
      chapterNumber: this._numberFromChapter(title, chapterPath),
      dateUploaded: this._parseDate(dateNode && dateNode.text()),
      _sourceIndex: i,
    });
  }
  if (chapters.length === 0) throw new Error("ReadComicsOnline returned no issues for this comic.");
  chapters.reverse();
  var usedNumbers = {};
  for (var j = 0; j < chapters.length; j++) {
    var chapter = chapters[j];
    var baseNumber = Number(chapter.chapterNumber);
    if (!Number.isFinite(baseNumber) || baseNumber <= 0) baseNumber = j + 1;
    var key = String(baseNumber);
    var duplicateOffset = usedNumbers[key] || 0;
    usedNumbers[key] = duplicateOffset + 1;
    chapter.chapterNumber = baseNumber + duplicateOffset / 1000;
    delete chapter._sourceIndex;
  }
  return chapters;
};

ReadComicsOnline._isPageImage = function(url) {
  var value = String(url || "");
  if (!/^https?:\/\//i.test(value)) return false;
  if (/logo|banner|avatar|favicon|loading|loader|placeholder|tracking|pixel|advert/i.test(value)) return false;
  if (/\.(?:svg|gif)(?:[?#]|$)/i.test(value)) return false;
  return true;
};

ReadComicsOnline._parsePages = function(html, referer) {
  var pages = [];
  var seen = {};
  if (!cinder || typeof cinder.parseHTML !== "function") return pages;
  var doc = cinder.parseHTML(html);
  var images = doc.querySelectorAll("#reader-all img");
  if (images.length === 0) images = doc.querySelectorAll("#all img.img-responsive, #all img");
  for (var i = 0; i < images.length; i++) {
    var src = this._imageFromNode(images[i]);
    if (!this._isPageImage(src) || seen[src]) continue;
    seen[src] = true;
    pages.push({ url: src, headers: this._imageHeaders(referer) });
  }
  return pages;
};

ReadComicsOnline.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var parts = path.split("/").filter(Boolean);
  if (parts.length !== 3 || String(parts[0]).toLowerCase() !== "comic") {
    throw new Error("Invalid ReadComicsOnline issue id.");
  }
  var url = this.BASE_URL + path;
  var html = await this._fetchText(url, {
    requiredPattern: /id=["']reader-all["']|id=["']all["']/i,
    waitForSelector: "#reader-all img",
    minWaitMs: 900,
    maxWaitMs: 20000,
  });
  var pages = this._parsePages(html, url);
  if (pages.length === 0 && cinder && typeof cinder.fetchBrowser === "function") {
    var rendered = await this._fetchText(url, {
      browserOnly: true,
      requiredPattern: /id=["']reader-all["']|id=["']all["']/i,
      waitForSelector: "#reader-all img",
      minWaitMs: 1200,
      maxWaitMs: 22000,
    });
    pages = this._parsePages(rendered, url);
  }
  if (pages.length === 0) throw new Error("ReadComicsOnline returned no readable pages for this issue.");
  return pages;
};

ReadComicsOnline.testConnection = async function() {
  var url = this.BASE_URL + "/search?query=batman";
  var text = await this._fetchText(url, {
    requiredPattern: /suggestions|<pre/i,
    waitForSelector: "pre",
    minWaitMs: 2500,
    maxWaitMs: 12000,
  });
  var payload = this._parseJson(text);
  if (!payload || !Array.isArray(payload.suggestions)) {
    throw new Error("ReadComicsOnline did not return a usable search response.");
  }
  return true;
};

ReadComicsOnline.getSettings = function() {
  return [];
};

__cinderExport = ReadComicsOnline;
