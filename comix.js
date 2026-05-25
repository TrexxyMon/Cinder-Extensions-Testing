var Comix = {};

Comix.id = "comix";
Comix.name = "Comix";
Comix.version = "1.0.2-cinder";
Comix.icon = "CX";
Comix.description = "Read manga, manhwa, and manhua from Comix.";
Comix.contentType = "manga";

Comix.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

Comix.BASE_URL = "https://comix.to";
Comix.API_URL = "https://comix.to/api/v1";

Comix._headers = function(extra) {
  var headers = {
    "Referer": this.BASE_URL + "/",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (extra) {
    Object.keys(extra).forEach(function(k) {
      headers[k] = extra[k];
    });
  }
  return headers;
};

Comix._decode = function(str) {
  if (!str) return "";
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
};

Comix._absUrl = function(url) {
  if (!url) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url;
};

Comix._hidFromId = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    var parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "title" && parts[1]) return parts[1].split("-")[0];
    if (parts[0]) return parts[0].split("-")[0];
  } catch (e) {}
  return raw.replace(/^\/?title\//, "").replace(/^\/+/, "").split(/[/?#-]/)[0];
};

Comix._titleUrl = function(hid) {
  return this.BASE_URL + "/title/" + encodeURIComponent(hid);
};

Comix._chapterUrl = function(chapterPath) {
  var path = String(chapterPath || "").replace(/^\/+/, "");
  return this.BASE_URL + "/" + path;
};

Comix._apiGet = async function(path, params) {
  var query = [];
  params = params || {};
  Object.keys(params).forEach(function(key) {
    var value = params[key];
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach(function(v) {
        query.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
      });
    } else {
      query.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    }
  });
  var url = this.API_URL + path + (query.length ? "?" + query.join("&") : "");
  var res = await cinder.fetch(url, { headers: this._headers() });
  var raw = res && res.data;
  if (typeof raw === "string") return JSON.parse(raw);
  return raw;
};

Comix._fetchHiddenBrowser = async function(url, waitForSelector, maxWaitMs) {
  var headers = {
    "X-Cinder-Suppress-Interactive": "1",
    "X-Cinder-Min-Wait-Ms": "3000",
    "X-Cinder-Max-Wait-Ms": String(maxWaitMs || 45000),
  };
  if (waitForSelector) headers["X-Cinder-Wait-For-Selector"] = waitForSelector;
  return await cinder.fetchBrowser(url, {
    headers: this._headers(headers),
  });
};

Comix._poster = function(manga) {
  var poster = manga && manga.poster ? manga.poster : {};
  return poster.large || poster.medium || poster.small || "";
};

Comix._toSearchResult = function(manga) {
  var hid = manga.hid || String(manga.id || "");
  return {
    id: hid,
    title: manga.title || hid,
    author: (manga.authors || manga.author || []).map(function(a) { return a.title; }).filter(Boolean).join(", "),
    cover: this._poster(manga),
    url: this._titleUrl(hid),
    source: this.name,
    format: manga.type || "manga",
    extra: {
      latestChapter: manga.latestChapter,
      status: manga.status,
      type: manga.type,
    },
  };
};

Comix._status = function(status) {
  switch (String(status || "").toLowerCase()) {
    case "releasing": return "ongoing";
    case "finished": return "completed";
    case "on_hiatus": return "hiatus";
    case "discontinued": return "cancelled";
    default: return undefined;
  }
};

Comix._terms = function(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function(item) { return item && item.title; }).filter(Boolean);
};

Comix._parseInitialData = function(html) {
  var match = String(html || "").match(/<script[^>]+id=["']initial-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  return JSON.parse(match[1]);
};

Comix._text = function(el) {
  if (!el) return "";
  try {
    return this._decode(el.text());
  } catch (e) {
    return "";
  }
};

Comix._attr = function(el, name) {
  if (!el) return "";
  try {
    return el.attr(name) || "";
  } catch (e) {
    return "";
  }
};

Comix.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];

  if (/^https?:\/\//i.test(q) || /^\/?title\//i.test(q)) {
    var details = await this.getMangaDetails(this._hidFromId(q));
    return [{
      id: details.id,
      title: details.title,
      author: details.author || details.artist || "",
      cover: details.cover,
      url: this._titleUrl(details.id),
      source: this.name,
      format: "manga",
    }];
  }

  var json = await this._apiGet("/manga", {
    keyword: q,
    "order[relevance]": "desc",
    content_rating: await cinder.store.get("content_rating") || "suggestive",
    limit: 28,
    page: Math.max(1, page || 1),
  });
  var items = json && json.result && json.result.items ? json.result.items : [];
  return items.map(this._toSearchResult.bind(this));
};

Comix.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
  ];
};

Comix.getDiscoverItems = async function(sectionId, page) {
  var orderKey = sectionId === "latest" ? "order[chapter_updated_at]" : "order[score]";
  var params = {
    content_rating: await cinder.store.get("content_rating") || "suggestive",
    limit: 28,
    page: Math.max(1, page || 1),
  };
  params[orderKey] = "desc";
  var json = await this._apiGet("/manga", params);
  var items = json && json.result && json.result.items ? json.result.items : [];
  return items.map(this._toSearchResult.bind(this));
};

Comix.getMangaDetails = async function(id) {
  var hid = this._hidFromId(id);
  var json = await this._apiGet("/manga/" + encodeURIComponent(hid));
  var manga = json && json.result ? json.result : {};
  var authors = this._terms(manga.authors || manga.author);
  var artists = this._terms(manga.artists || manga.artist);
  var genres = []
    .concat(manga.type ? [manga.type] : [])
    .concat(this._terms(manga.genres || manga.genre))
    .concat(this._terms(manga.demographics || manga.demographic))
    .filter(Boolean);

  return {
    id: manga.hid || hid,
    title: manga.title || hid,
    author: authors.join(", ") || undefined,
    artist: artists.join(", ") || undefined,
    cover: this._poster(manga),
    description: this._decode(manga.synopsisHtml || manga.synopsis || ""),
    status: this._status(manga.status),
    genres: genres,
  };
};

Comix._chapterFromLink = function(hid, href, text, index) {
  if (!href) return null;
  href = this._absUrl(href);
  var parsed;
  try {
    parsed = new URL(href);
  } catch (e) {
    return null;
  }
  var path = parsed.pathname.replace(/^\/+/, "");
  if (path.indexOf("title/" + hid + "/") !== 0) return null;
  if (path.indexOf("chapter") === -1) return null;
  var chapterId = path.split("/").pop() || "";
  var numMatch = chapterId.match(/chapter-([0-9.]+)/i) || text.match(/chapter\s+([0-9.]+)/i);
  var chapterNumber = numMatch ? parseFloat(numMatch[1]) : 0;
  return {
    id: path,
    title: this._decode(text || ("Chapter " + (chapterNumber || index + 1))),
    chapterNumber: chapterNumber || index + 1,
  };
};

Comix.getChapters = async function(mangaId) {
  var hid = this._hidFromId(mangaId);
  var html = "";
  try {
    var waitSelector = "a[href*='/title/" + hid + "/'][href*='chapter']";
    var browser = await this._fetchHiddenBrowser(this._titleUrl(hid), waitSelector, 55000);
    html = browser && browser.data ? browser.data : "";
  } catch (e) {
    cinder.warn("[Comix] Hidden chapter load failed: " + e);
  }
  if (!html) {
    throw new Error("Comix requires hidden browser rendering to load chapters, and the hidden render failed.");
  }

  var doc = cinder.parseHTML(html);
  var anchors = doc.querySelectorAll("a[href*='/title/" + hid + "/']");
  var chapters = [];
  var seen = {};
  for (var i = 0; i < anchors.length; i++) {
    var chapter = this._chapterFromLink(hid, this._attr(anchors[i], "href"), this._text(anchors[i]), i);
    if (!chapter || seen[chapter.id]) continue;
    seen[chapter.id] = true;
    chapters.push(chapter);
  }

  chapters.sort(function(a, b) {
    return (b.chapterNumber || 0) - (a.chapterNumber || 0);
  });

  if (chapters.length === 0) {
    throw new Error("Comix returned no chapters from the hidden render.");
  }
  return chapters;
};

Comix.getPages = async function(chapterId) {
  var path = String(chapterId || "").replace(/^\/+/, "");
  if (!path) throw new Error("Invalid Comix chapter ID.");
  var url = this._chapterUrl(path);
  var html = "";
  try {
    var browser = await this._fetchHiddenBrowser(url, "img[src*='static.comix.to']", 55000);
    html = browser && browser.data ? browser.data : "";
  } catch (e) {
    cinder.warn("[Comix] Hidden page load failed: " + e);
  }
  if (!html) throw new Error("Comix requires hidden browser rendering to load pages, and the hidden render failed.");

  var doc = cinder.parseHTML(html);
  var imgs = doc.querySelectorAll("img");
  var pages = [];
  var seen = {};
  for (var i = 0; i < imgs.length; i++) {
    var src = this._attr(imgs[i], "src") || this._attr(imgs[i], "data-src");
    src = this._absUrl(src);
    if (!src || seen[src]) continue;
    if (src.indexOf("static.comix.to") === -1 && !/\.(jpg|jpeg|png|webp)(\?|$)/i.test(src)) continue;
    seen[src] = true;
    pages.push({
      url: src,
      headers: this._headers({ "Referer": url }),
    });
  }

  if (pages.length === 0) {
    throw new Error("Comix returned no pages for this chapter.");
  }
  return pages;
};

Comix.getSettings = function() {
  return [
    {
      id: "content_rating",
      label: "Maximum content rating",
      type: "select",
      defaultValue: "suggestive",
      options: [
        { label: "Safe only", value: "safe" },
        { label: "Up to Suggestive", value: "suggestive" },
        { label: "Up to Erotica", value: "erotica" },
        { label: "Show all", value: "" },
      ],
    },
  ];
};

__cinderExport = Comix;
