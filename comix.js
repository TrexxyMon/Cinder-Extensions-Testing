var Comix = {};

Comix.id = "comix";
Comix.name = "Comix";
Comix.version = "1.0.6-cinder";
Comix.icon = "CX";
Comix.description = "Read manga, manhwa, and manhua from Comix.";
Comix.contentType = "manga";

Comix.contentTypes = ["manga"];
Comix.contentSubtypes = ["manga", "manhwa", "manhua"];
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
  return this._parseJson(res && res.data);
};

Comix._extractJsonFromHtml = function(raw) {
  var text = String(raw || "").trim();
  if (!text) return "";
  if (text.charAt(0) !== "<") return text;
  var pre = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (pre) return this._decode(pre[1]);
  var body = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) return this._decode(body[1]);
  return text;
};

Comix._parseJson = function(raw) {
  if (raw && typeof raw === "object") return raw;
  var text = this._extractJsonFromHtml(raw);
  var first = text ? text.charAt(0) : "";
  if (!text || (first !== "{" && first !== "[")) {
    throw new Error("Comix returned a Cloudflare/HTML page instead of API JSON.");
  }
  return JSON.parse(text);
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

Comix._captureBrowserRequest = async function(pageUrl, urlIncludes, maxWaitMs) {
  if (!cinder.fetchBrowserCaptured) {
    throw new Error("This Cinder build does not support captured browser requests. Update the app and try again.");
  }
  var res = await cinder.fetchBrowserCaptured(pageUrl, {
    headers: this._headers({
      "X-Cinder-Suppress-Interactive": "1",
      "X-Cinder-Capture-Url-Includes": urlIncludes,
      "X-Cinder-Max-Wait-Ms": String(maxWaitMs || 45000),
    }),
  });
  if (!res || !res.data) throw new Error("No Comix API request was captured.");
  var captured = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  var url = captured && captured.url ? String(captured.url) : "";
  var body = captured && captured.body ? String(captured.body) : "";
  var token = "";
  try {
    var parsed = new URL(url, this.BASE_URL);
    token = parsed.searchParams.get("_") || "";
  } catch (e) {}
  return {
    url: url,
    token: token,
    json: body ? JSON.parse(body) : null,
  };
};

Comix._chapterFromApi = function(mangaSlug, chapter) {
  if (!chapter) return null;
  var number = Number(chapter.number || 0);
  var chapterUrl = chapter.url || "";
  var path = "";
  if (chapterUrl.indexOf("/title/") !== -1) {
    path = chapterUrl.slice(chapterUrl.indexOf("/title/") + 1);
  } else {
    path = "title/" + mangaSlug + "/" + chapter.id + "-chapter-" + String(number).replace(/\.0$/, "");
  }
  return {
    id: path,
    title: "Chapter " + String(number).replace(/\.0$/, "") + (chapter.name ? ": " + chapter.name : ""),
    chapterNumber: number,
    scanlator: chapter.group && chapter.group.name ? chapter.group.name : (chapter.isOfficial ? "Official" : undefined),
  };
};

Comix._hasNextPage = function(result) {
  var meta = result && (result.meta || result.pagination);
  if (!meta) return false;
  var page = Number(meta.page || 0);
  var last = Number(meta.actualLastPage || meta.lastPage || 0);
  return page > 0 && last > 0 && page < last;
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
  var capture = await this._captureBrowserRequest(
    this._titleUrl(hid),
    "/api/v1/manga/" + hid + "/chapters",
    55000,
  );
  if (!capture.token) throw new Error("Comix chapter API token was not captured.");

  var mangaSlug = hid;
  var detail = await this.getMangaDetails(hid).catch(function() { return null; });
  if (detail && detail.id) mangaSlug = detail.id;

  var all = [];
  var page = 1;
  while (true) {
    var json = await this._apiGet("/manga/" + encodeURIComponent(hid) + "/chapters", {
      page: page,
      limit: 100,
      "order[number]": "desc",
      "_": capture.token,
    });
    var result = json && json.result ? json.result : {};
    var items = result.items || [];
    all = all.concat(items);
    if (!this._hasNextPage(result)) break;
    page++;
    if (page > 25) break;
  }

  var seenNumbers = {};
  var chapters = [];
  for (var i = 0; i < all.length; i++) {
    var chapter = this._chapterFromApi(mangaSlug, all[i]);
    if (!chapter) continue;
    var key = String(chapter.chapterNumber);
    if (seenNumbers[key]) continue;
    seenNumbers[key] = true;
    chapters.push(chapter);
  }
  if (chapters.length === 0) throw new Error("Comix API returned no chapters.");
  return chapters;
};

Comix.getPages = async function(chapterId) {
  var path = String(chapterId || "").replace(/^\/+/, "");
  if (!path) throw new Error("Invalid Comix chapter ID.");
  var url = this._chapterUrl(path);
  var chapterIdOnly = path.split("/").pop().split("-")[0];
  if (!chapterIdOnly) throw new Error("Invalid Comix chapter API ID.");

  var capture = await this._captureBrowserRequest(
    url,
    "/api/v1/chapters/" + chapterIdOnly,
    55000,
  );
  var json = capture.json && capture.json.result ? capture.json : await this._apiGet("/chapters/" + encodeURIComponent(chapterIdOnly), {
    "_": capture.token,
  });
  var result = json && json.result ? json.result : {};
  var pagesData = result.pages || {};
  var base = String(pagesData.baseUrl || "").replace(/\/+$/, "");
  var items = pagesData.items || [];
  var pages = [];
  for (var i = 0; i < items.length; i++) {
    var image = items[i] && items[i].url ? String(items[i].url) : "";
    if (!image) continue;
    var full = /^https?:\/\//i.test(image) ? image : base + "/" + image.replace(/^\/+/, "");
    pages.push({ url: full, headers: this._headers({ "Referer": url }) });
  }
  if (pages.length === 0) throw new Error("Comix API returned no pages for this chapter.");
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

