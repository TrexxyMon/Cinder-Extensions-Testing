var ReadComicsOnline = {};

ReadComicsOnline.id = "readcomicsonline";
ReadComicsOnline.name = "ReadComicsOnline";
ReadComicsOnline.version = "0.2.1-cinder";
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
ReadComicsOnline.CDN_URL = "https://cdn.readcomicsonline.ru";
ReadComicsOnline.ROOT_SITEMAP_URL = ReadComicsOnline.BASE_URL + "/sitemap.xml";
ReadComicsOnline.COMICS_SITEMAP_URL = ReadComicsOnline.BASE_URL + "/sitemap-comics.xml";
ReadComicsOnline.COMPACT_INDEX_URL = "https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions-Testing/main/readcomicsonline-index.json?v=0.2.1";
ReadComicsOnline.PAGE_SIZE = 24;
ReadComicsOnline._compactIndexPromise = null;
ReadComicsOnline._compactLookup = null;
ReadComicsOnline._compactLatestRows = null;
ReadComicsOnline._comicSitemapPromise = null;
ReadComicsOnline._comicIndexPromise = null;
ReadComicsOnline._comicLookup = null;
ReadComicsOnline._chapterSitemapsPromise = null;

ReadComicsOnline._headers = function(extra) {
  var headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
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
  // The native WebView must present its own internally consistent identity.
  delete headers["User-Agent"];
  headers["X-Cinder-Suppress-Interactive"] = "1";
  headers["X-Cinder-Browser-User-Agent"] = "desktop";
  headers["X-Cinder-Visible-Layout"] = "1";
  headers["X-Cinder-Min-Wait-Ms"] = String(options.minWaitMs || 1200);
  headers["X-Cinder-Max-Wait-Ms"] = String(options.maxWaitMs || 45000);
  if (options.waitForSelector) {
    headers["X-Cinder-Wait-For-Selector"] = options.waitForSelector;
  }
  return headers;
};

ReadComicsOnline._decode = function(value) {
  if (!value) return "";
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
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
  return this._decode(slug.replace(/[-_]+/g, " ")).replace(/\b\w/g, function(ch) {
    return ch.toUpperCase();
  });
};

ReadComicsOnline._imageHeaders = function(referer) {
  return {
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": referer || this.BASE_URL + "/",
  };
};

ReadComicsOnline._isProtectionPage = function(value) {
  var text = String(value || "");
  return /Just a moment|Performing security verification|cf-chl-|challenge-platform|challenge-error-text|Attention Required|Enable JavaScript and cookies to continue|Checking your browser|security verification|verify you are human|turnstile|Cloudflare Ray ID/i.test(text);
};

ReadComicsOnline._matchesRequiredPattern = function(text, pattern) {
  if (!pattern) return true;
  pattern.lastIndex = 0;
  return pattern.test(String(text || ""));
};

ReadComicsOnline._isUsableResponse = function(response, options) {
  if (!response || response.status < 200 || response.status >= 300 || !response.data) return false;
  var text = String(response.data || "");
  if (!text) return false;
  var requiredPattern = options && options.requiredPattern;
  // A successfully cleared Cloudflare page can retain challenge-platform
  // references. Source-specific content is stronger evidence than that stale
  // markup, so accept it before checking generic protection signatures.
  if (requiredPattern && this._matchesRequiredPattern(text, requiredPattern)) return true;
  if (this._isProtectionPage(text)) return false;
  return !requiredPattern;
};

ReadComicsOnline._fetchPublicText = async function(url, requiredPattern) {
  if (!cinder || typeof cinder.fetch !== "function") {
    throw new Error("ReadComicsOnline requires Cinder network support.");
  }
  var response = null;
  try {
    response = await cinder.fetch(url, {
      headers: this._headers(),
      timeout: 25000,
    });
  } catch (error) {
    response = null;
  }
  var text = response && response.data ? String(response.data) : "";
  if (!response || response.status < 200 || response.status >= 300 || !text || this._isProtectionPage(text) || !this._matchesRequiredPattern(text, requiredPattern)) {
    var status = response && response.status ? " (HTTP " + response.status + ")" : "";
    throw new Error("ReadComicsOnline public index request failed" + status + ": " + url);
  }
  return text;
};

ReadComicsOnline._fetchBrowser = async function(url, options) {
  if (!cinder || typeof cinder.fetchBrowser !== "function") return null;
  try {
    return await cinder.fetchBrowser(url, {
      headers: this._browserHeaders(options),
      timeout: 55000,
      browserUserAgent: "desktop",
    });
  } catch (error) {
    if (cinder.warn) cinder.warn("ReadComicsOnline background browser failed for " + url);
    return null;
  }
};

ReadComicsOnline._fetchReaderHtml = async function(url) {
  var options = {
    requiredPattern: /id=["']reader-all["']/i,
    waitForSelector: "#reader-all img",
    minWaitMs: 1200,
    maxWaitMs: 45000,
  };
  var response = null;
  if (cinder && typeof cinder.fetch === "function") {
    try {
      response = await cinder.fetch(url, {
        headers: this._headers(),
        timeout: 12000,
      });
    } catch (error) {
      response = null;
    }
  }
  if (!this._isUsableResponse(response, options)) {
    response = await this._fetchBrowser(url, options);
  }
  if (!this._isUsableResponse(response, options)) {
    if (response && this._isProtectionPage(response.data)) {
      throw new Error("ReadComicsOnline security verification did not complete in the background.");
    }
    var status = response && response.status ? " (HTTP " + response.status + ")" : "";
    throw new Error("ReadComicsOnline reader request failed" + status + ": " + url);
  }
  return String(response.data || "");
};

ReadComicsOnline._parseComicSitemap = function(xml) {
  var source = String(xml || "");
  var results = [];
  var lookup = Object.create(null);
  var blockPattern = /<url>([\s\S]*?)<\/url>/gi;
  var match;
  while ((match = blockPattern.exec(source)) !== null) {
    var item = this._parseComicBlock(match[1], results.length);
    if (!item) continue;
    var slug = item.slug;
    if (!slug || lookup[slug]) continue;
    results.push(item);
    lookup[slug] = item;
  }
  if (results.length === 0) {
    throw new Error("ReadComicsOnline comic index did not contain any titles.");
  }
  this._comicLookup = lookup;
  return results;
};

ReadComicsOnline._parseComicBlock = function(block, sourceIndex) {
  var source = String(block || "");
  var locationMatch = source.match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
  if (!locationMatch) return null;
  var location = this._decode(locationMatch[1]);
  var pathMatch = location.match(/\/comic\/([^/?#<]+)/i);
  if (!pathMatch || !pathMatch[1]) return null;
  var slug = this._decode(pathMatch[1]).replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  var coverMatch = source.match(/<image:loc>\s*([^<]+?)\s*<\/image:loc>/i);
  var titleMatch = source.match(/<image:caption>\s*([\s\S]*?)\s*<\/image:caption>/i);
  var modifiedMatch = source.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i);
  var modifiedAt = modifiedMatch ? Date.parse(modifiedMatch[1]) : 0;
  return {
    id: "/comic/" + slug,
    slug: slug,
    title: this._decode(titleMatch && titleMatch[1]) || this._titleFromSlug(slug),
    cover: this._decode(coverMatch && coverMatch[1]) || "",
    modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : 0,
    sourceIndex: Number(sourceIndex) || 0,
  };
};

ReadComicsOnline._loadComicSitemap = function() {
  if (this._comicSitemapPromise) return this._comicSitemapPromise;
  var self = this;
  this._comicSitemapPromise = self
    ._fetchPublicText(self.COMICS_SITEMAP_URL, /<urlset|<image:caption>/i)
    .catch(function(error) {
      self._comicSitemapPromise = null;
      throw error;
    });
  return this._comicSitemapPromise;
};

ReadComicsOnline._compactRowToItem = function(row, sourceIndex) {
  if (!Array.isArray(row) || !row[0]) return null;
  var slug = String(row[0]);
  var modifiedText = String(row[2] || "");
  var modifiedAt = modifiedText ? Date.parse(modifiedText) : 0;
  return {
    id: "/comic/" + slug,
    slug: slug,
    title: String(row[1] || "") || this._titleFromSlug(slug),
    cover: this.CDN_URL + "/uploads/manga/" + slug + "/cover/cover_250x350.jpg",
    modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : 0,
    sourceIndex: Number(sourceIndex) || 0,
  };
};

ReadComicsOnline._loadCompactIndex = function() {
  if (this._compactIndexPromise) return this._compactIndexPromise;
  var self = this;
  this._compactIndexPromise = (async function() {
    if (!cinder || typeof cinder.fetch !== "function") {
      throw new Error("ReadComicsOnline requires Cinder network support.");
    }
    var response = await cinder.fetch(self.COMPACT_INDEX_URL, {
      headers: { "Accept": "application/json,text/plain,*/*" },
      timeout: 12000,
    });
    if (!response || response.status < 200 || response.status >= 300 || !response.data) {
      throw new Error("ReadComicsOnline compact index is unavailable.");
    }
    var payload = JSON.parse(String(response.data));
    var rows = payload && Array.isArray(payload.items) ? payload.items : [];
    if (rows.length === 0) {
      throw new Error("ReadComicsOnline compact index is empty.");
    }
    var lookup = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      if (Array.isArray(rows[i]) && rows[i][0]) lookup[String(rows[i][0])] = rows[i];
    }
    self._compactLookup = lookup;
    return rows;
  })().catch(function(error) {
    self._compactIndexPromise = null;
    self._compactLookup = null;
    throw error;
  });
  return this._compactIndexPromise;
};

ReadComicsOnline._loadComicIndex = function() {
  if (this._comicIndexPromise) return this._comicIndexPromise;
  var self = this;
  this._comicIndexPromise = (async function() {
    var xml = await self._loadComicSitemap();
    return self._parseComicSitemap(xml);
  })().catch(function(error) {
    self._comicIndexPromise = null;
    self._comicLookup = null;
    throw error;
  });
  return this._comicIndexPromise;
};

ReadComicsOnline._toResult = function(item) {
  var cover = item.cover || "";
  return {
    id: item.id,
    title: item.title,
    author: "Unknown",
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(this.BASE_URL + item.id) : undefined,
    url: this.BASE_URL + item.id,
    format: "comics",
    contentType: "comics",
    contentTypes: ["comic"],
  };
};

ReadComicsOnline._normalizeSearch = function(value) {
  var text = String(value || "").toLowerCase();
  try {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (error) {}
  return text
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

ReadComicsOnline._searchScore = function(item, normalizedQuery) {
  var title = this._normalizeSearch(item.title);
  var slug = this._normalizeSearch(item.slug);
  if (!normalizedQuery) return -1;
  if (title === normalizedQuery) return 1000;
  if (title.indexOf(normalizedQuery + " ") === 0) return 850;
  if (title.indexOf(normalizedQuery) !== -1) return 700;
  var words = normalizedQuery.split(" ").filter(Boolean);
  var allTitleWords = words.every(function(word) { return title.indexOf(word) !== -1; });
  if (allTitleWords) return 500;
  var allSlugWords = words.every(function(word) { return slug.indexOf(word) !== -1; });
  return allSlugWords ? 350 : -1;
};

ReadComicsOnline.search = async function(query, page) {
  var normalizedQuery = this._normalizeSearch(query);
  if (!normalizedQuery) return [];
  var self = this;
  var matches = [];
  var queryWords = normalizedQuery.split(" ").filter(Boolean);
  var compactRows = null;
  try {
    compactRows = await this._loadCompactIndex();
  } catch (error) {
    compactRows = null;
  }
  if (compactRows) {
    for (var i = 0; i < compactRows.length; i++) {
      var row = compactRows[i];
      if (!Array.isArray(row) || !row[0]) continue;
      var quickText = (String(row[1] || "") + " " + String(row[0]))
        .toLowerCase()
        .replace(/[-_]+/g, " ");
      if (!queryWords.every(function(word) { return quickText.indexOf(word) !== -1; })) continue;
      var compactItem = this._compactRowToItem(row, i);
      if (!compactItem) continue;
      var compactScore = self._searchScore(compactItem, normalizedQuery);
      if (compactScore >= 0) matches.push({ item: compactItem, score: compactScore });
    }
  } else {
    var source = await this._loadComicSitemap();
    var tokens = normalizedQuery.split(" ").filter(Boolean);
    var needle = tokens.reduce(function(longest, token) {
      return token.length > longest.length ? token : longest;
    }, "");
    if (!needle) return [];
    var occurrencePattern = new RegExp(this._escapeRegExp(needle), "gi");
    var seenBlocks = Object.create(null);
    var occurrence;
    while ((occurrence = occurrencePattern.exec(source)) !== null) {
      var blockStart = source.lastIndexOf("<url>", occurrence.index);
      var blockEnd = source.indexOf("</url>", occurrence.index);
      if (blockStart < 0 || blockEnd < 0 || seenBlocks[blockStart]) continue;
      seenBlocks[blockStart] = true;
      var item = self._parseComicBlock(source.slice(blockStart + 5, blockEnd), blockStart);
      if (!item) continue;
      var score = self._searchScore(item, normalizedQuery);
      if (score >= 0) matches.push({ item: item, score: score });
    }
  }
  matches.sort(function(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    if (a.item.modifiedAt !== b.item.modifiedAt) return b.item.modifiedAt - a.item.modifiedAt;
    return a.item.title.localeCompare(b.item.title, undefined, { numeric: true, sensitivity: "base" });
  });
  var offset = Math.max(0, Number(page) || 0) * this.PAGE_SIZE;
  return matches.slice(offset, offset + this.PAGE_SIZE).map(function(entry) {
    return self._toResult(entry.item);
  });
};

ReadComicsOnline.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular", icon: "flame" },
    { id: "latest", title: "Latest", icon: "clock" },
  ];
};

ReadComicsOnline.getDiscoverItems = async function(sectionId, page) {
  var self = this;
  var offset = Math.max(0, Number(page) || 0) * this.PAGE_SIZE;
  try {
    var rows = await this._loadCompactIndex();
    var orderedRows = rows;
    if (sectionId === "latest") {
      if (!this._compactLatestRows) {
        this._compactLatestRows = rows.slice().sort(function(a, b) {
          var dateCompare = String(b && b[2] || "").localeCompare(String(a && a[2] || ""));
          if (dateCompare !== 0) return dateCompare;
          return String(a && a[1] || "").localeCompare(String(b && b[1] || ""), undefined, { numeric: true, sensitivity: "base" });
        });
      }
      orderedRows = this._compactLatestRows;
    }
    return orderedRows.slice(offset, offset + this.PAGE_SIZE).map(function(row, index) {
      return self._toResult(self._compactRowToItem(row, offset + index));
    });
  } catch (error) {
    // Older or temporarily unavailable repositories can still use the live sitemap.
  }
  var items = (await this._loadComicIndex()).slice();
  items.sort(sectionId === "latest" ? function(a, b) {
    if (a.modifiedAt !== b.modifiedAt) return b.modifiedAt - a.modifiedAt;
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
  } : function(a, b) { return a.sourceIndex - b.sourceIndex; });
  return items.slice(offset, offset + this.PAGE_SIZE).map(function(item) {
    return self._toResult(item);
  });
};

ReadComicsOnline._findComic = async function(id) {
  var slug = this._slugFromId(id);
  if (!slug) return null;
  try {
    await this._loadCompactIndex();
    var compactRow = this._compactLookup && this._compactLookup[slug];
    if (compactRow) return this._compactRowToItem(compactRow, 0);
  } catch (error) {}
  if (this._comicLookup && this._comicLookup[slug]) return this._comicLookup[slug];
  var source = await this._loadComicSitemap();
  var lowerSource = source.toLowerCase();
  var needle = "/comic/" + slug.toLowerCase();
  var position = lowerSource.indexOf(needle);
  while (position >= 0) {
    var blockStart = source.lastIndexOf("<url>", position);
    var blockEnd = source.indexOf("</url>", position);
    if (blockStart >= 0 && blockEnd >= 0) {
      var item = this._parseComicBlock(source.slice(blockStart + 5, blockEnd), blockStart);
      if (item && item.slug === slug) return item;
    }
    position = lowerSource.indexOf(needle, position + needle.length);
  }
  return null;
};

ReadComicsOnline.getMangaDetails = async function(id) {
  var path = this._seriesPath(id);
  if (!path) throw new Error("Invalid ReadComicsOnline comic id.");
  var item = await this._findComic(path);
  var cover = item && item.cover ? item.cover : "";
  return {
    id: path,
    title: item ? item.title : this._titleFromSlug(path),
    author: "Unknown",
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(this.BASE_URL + path) : undefined,
    format: "comics",
    contentType: "comics",
  };
};

ReadComicsOnline._loadChapterSitemaps = function() {
  if (this._chapterSitemapsPromise) return this._chapterSitemapsPromise;
  var self = this;
  this._chapterSitemapsPromise = (async function() {
    var root = await self._fetchPublicText(self.ROOT_SITEMAP_URL, /sitemap-chapters-/i);
    var urls = [];
    var seen = {};
    var locationPattern = /<loc>\s*([^<]*sitemap-chapters-[^<]*\.xml)\s*<\/loc>/gi;
    var match;
    while ((match = locationPattern.exec(root)) !== null) {
      var url = self._absUrl(match[1]);
      if (url && !seen[url]) {
        seen[url] = true;
        urls.push(url);
      }
    }
    if (urls.length === 0) {
      urls = [
        self.BASE_URL + "/sitemap-chapters-1.xml",
        self.BASE_URL + "/sitemap-chapters-2.xml",
      ];
    }
    return Promise.all(urls.map(function(url) {
      return self._fetchPublicText(url, /<urlset|\/comic\//i);
    }));
  })().catch(function(error) {
    self._chapterSitemapsPromise = null;
    throw error;
  });
  return this._chapterSitemapsPromise;
};

ReadComicsOnline._escapeRegExp = function(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

ReadComicsOnline._chapterTitle = function(token) {
  var value = String(token || "");
  try { value = decodeURIComponent(value); } catch (error) {}
  value = this._decode(value).replace(/^\/+|\/+$/g, "");
  if (/^\d+(?:\.\d+)?$/i.test(value)) return "Issue #" + value;
  var annual = value.match(/^annual[-_ ]*(.*)$/i);
  if (annual) return "Annual" + (annual[1] ? " " + annual[1].replace(/[-_]+/g, " ") : "");
  if (/^(?:gn|graphic[-_ ]*novel)$/i.test(value)) return "Graphic Novel";
  if (/^tpb(?:[-_ ]|$)/i.test(value)) {
    return value.replace(/^tpb/i, "TPB").replace(/[-_]+/g, " ");
  }
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, function(ch) {
    return ch.toUpperCase();
  }) || "Issue";
};

ReadComicsOnline._naturalCompare = function(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

ReadComicsOnline.getChapters = async function(mangaId) {
  var path = this._seriesPath(mangaId);
  if (!path) return [];
  var slug = this._slugFromId(path);
  var prefix = this.BASE_URL + "/comic/" + slug + "/";
  var pattern = new RegExp("<loc>\\s*" + this._escapeRegExp(prefix) + "([^<]+)</loc>\\s*<lastmod>\\s*([^<]+)</lastmod>", "gi");
  var sitemaps = await this._loadChapterSitemaps();
  var chapters = [];
  var seen = {};
  for (var i = 0; i < sitemaps.length; i++) {
    var source = String(sitemaps[i] || "");
    var match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source)) !== null) {
      var token = this._decode(match[1]).replace(/^\/+|\/+$/g, "");
      if (!token) continue;
      var chapterPath = path + "/" + token;
      if (seen[chapterPath]) continue;
      seen[chapterPath] = true;
      var modifiedText = this._decode(match[2]);
      var modifiedAt = Date.parse(modifiedText);
      chapters.push({
        id: chapterPath,
        token: token,
        title: this._chapterTitle(token),
        modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : 0,
        dateUploaded: Number.isFinite(modifiedAt) ? new Date(modifiedAt).toISOString().split("T")[0] : undefined,
      });
    }
  }
  if (chapters.length === 0) {
    throw new Error("ReadComicsOnline returned no indexed issues for this comic.");
  }
  var self = this;
  chapters.sort(function(a, b) {
    if (a.modifiedAt && b.modifiedAt && a.modifiedAt !== b.modifiedAt) return a.modifiedAt - b.modifiedAt;
    if (a.modifiedAt && !b.modifiedAt) return -1;
    if (!a.modifiedAt && b.modifiedAt) return 1;
    return self._naturalCompare(a.token, b.token);
  });
  return chapters.map(function(chapter, index) {
    return {
      id: chapter.id,
      title: chapter.title,
      chapterNumber: index + 1,
      dateUploaded: chapter.dateUploaded,
    };
  });
};

ReadComicsOnline._imageFromNode = function(node) {
  if (!node) return "";
  var srcset = node.attr("data-srcset") || node.attr("srcset") || "";
  var srcsetFirst = srcset ? srcset.split(",")[0].trim().split(/\s+/)[0] : "";
  return this._absUrl(
    node.attr("data-cfsrc") ||
    node.attr("data-lazy-src") ||
    node.attr("data-src") ||
    node.attr("data-original") ||
    node.attr("src") ||
    srcsetFirst
  );
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
  var html = await this._fetchReaderHtml(url);
  var pages = this._parsePages(html, url);
  if (pages.length === 0) {
    throw new Error("ReadComicsOnline returned no readable pages for this issue.");
  }
  return pages;
};

ReadComicsOnline.testConnection = async function() {
  try {
    var compactRows = await this._loadCompactIndex();
    return compactRows.length > 0;
  } catch (error) {
    var index = await this._loadComicIndex();
    return index.length > 0;
  }
};

ReadComicsOnline.getSettings = function() {
  return [];
};

__cinderExport = ReadComicsOnline;
