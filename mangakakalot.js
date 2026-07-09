var MangaKakalot = {};

MangaKakalot.id = "mangakakalot";
MangaKakalot.name = "MangaKakalot";
MangaKakalot.version = "0.1.0-cinder";
MangaKakalot.icon = "MK";
MangaKakalot.description = "Read manga, manhwa, and manhua from MangaKakalot. No debrid required.";
MangaKakalot.contentType = "manga";
MangaKakalot.contentTypes = ["manga"];
MangaKakalot.contentSubtypes = ["manga", "manhwa", "manhua"];
MangaKakalot.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

MangaKakalot.BASE_URL = "https://www.mangakakalove.com";

MangaKakalot._headers = function(extra) {
  var headers = {
    "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

MangaKakalot._imageHeaders = function(referer) {
  return {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": referer || this.BASE_URL + "/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
};

MangaKakalot._decode = function(value) {
  if (!value) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

MangaKakalot._stripTags = function(value) {
  return this._decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
};

MangaKakalot._attr = function(html, name) {
  if (!html) return "";
  var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp(escaped + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  var match = String(html).match(re);
  return match ? this._decode(match[2]) : "";
};

MangaKakalot._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim()).replace(/\\\//g, "/");
  if (!url || /^data:/i.test(url) || /^blob:/i.test(url)) return "";
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

MangaKakalot._slugify = function(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

MangaKakalot._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname.replace(/\/+$/, "");
  } catch (e) {
    return raw.replace(this.BASE_URL, "").split(/[?#]/)[0].replace(/\/+$/, "");
  }
};

MangaKakalot._slugFromId = function(value) {
  var path = this._pathFromUrl(value);
  var parts = path.split("/").filter(Boolean);
  if (parts[0] === "manga" && parts[1]) return parts[1];
  return parts.length ? parts[parts.length - 1] : String(value || "");
};

MangaKakalot._fetchText = async function(url, options) {
  options = options || {};
  var res;
  try {
    res = await cinder.fetch(url, {
      headers: this._headers(options.headers),
      timeout: options.timeout || 30000,
    });
  } catch (e) {
    res = null;
  }
  var text = res && res.status >= 200 && res.status < 300 ? String(res.data || "") : "";
  if ((!text || /cf-challenge|turnstile|just a moment|checking your browser/i.test(text)) && cinder.fetchBrowser) {
    res = await cinder.fetchBrowser(url, {
      headers: this._headers({
        "X-Cinder-Suppress-Interactive": "1",
        "X-Cinder-Wake-Page": "1",
        "X-Cinder-Min-Wait-Ms": String(options.minWaitMs || 1200),
        "X-Cinder-Max-Wait-Ms": String(options.maxWaitMs || 12000),
      }),
      timeout: options.timeout || 30000,
    });
    text = res && res.status >= 200 && res.status < 300 ? String(res.data || "") : "";
  }
  if (!text) throw new Error("MangaKakalot request failed for " + url);
  return text;
};

MangaKakalot._fetchJson = async function(url, options) {
  var text = await this._fetchText(url, Object.assign({
    headers: {
      "Accept": "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
    },
  }, options || {}));
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("MangaKakalot returned invalid JSON.");
  }
};

MangaKakalot._resultFromSearchItem = function(item) {
  if (!item) return null;
  var url = this._absUrl(item.url);
  var slug = item.slug || this._slugFromId(url || item.name);
  if (!slug) return null;
  var cover = this._absUrl(item.thumb || "");
  return {
    id: slug,
    title: this._decode(item.name || slug.replace(/-/g, " ")),
    author: this._decode(item.author || "") || undefined,
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(url || this.BASE_URL + "/manga/" + slug) : undefined,
    url: url || this.BASE_URL + "/manga/" + slug,
    source: this.name,
    format: "manga",
    contentType: "manga",
    contentTypes: ["manga"],
    contentSubtypes: ["manga"],
    extra: {
      latestChapter: item.chapterLatest || undefined,
    },
  };
};

MangaKakalot.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];
  if (/^https?:\/\//i.test(q) || q.indexOf("/manga/") === 0) {
    var slug = this._slugFromId(q);
    if (!slug) return [];
    var details = await this.getMangaDetails(slug);
    return [{
      id: slug,
      title: details.title,
      author: details.author,
      cover: details.cover,
      coverHeaders: details.coverHeaders,
      url: this.BASE_URL + "/manga/" + slug,
      source: this.name,
      format: "manga",
      contentType: "manga",
      contentTypes: ["manga"],
      contentSubtypes: ["manga"],
    }];
  }
  var searchword = this._slugify(q).replace(/-/g, "_");
  var json = await this._fetchJson(this.BASE_URL + "/home/search/json?searchword=" + encodeURIComponent(searchword), {
    timeout: 20000,
  });
  var items = Array.isArray(json) ? json : [];
  var out = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var result = this._resultFromSearchItem(items[i]);
    if (!result || seen[result.id]) continue;
    seen[result.id] = true;
    out.push(result);
  }
  return out;
};

MangaKakalot.getMangaDetails = async function(id) {
  var slug = this._slugFromId(id);
  var url = this.BASE_URL + "/manga/" + slug;
  var html = await this._fetchText(url, { minWaitMs: 1200, maxWaitMs: 12000 });
  var title =
    this._stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]) ||
    this._decode((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || [])[1]) ||
    slug.replace(/-/g, " ");
  title = title.replace(/\s+Manga\s*$/i, "").trim();
  var description =
    this._decode((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1]) ||
    undefined;
  var cover =
    this._absUrl((html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1]) ||
    this._absUrl((html.match(/<img[^>]+(?:class=["'][^"']*story-cover[^"']*["'][^>]+)?src=["']([^"']+)["'][^>]*>/i) || [])[1]);
  var author = this._labelValue(html, "Author");
  var status = this._statusFromText(this._labelValue(html, "Status"));
  return {
    id: slug,
    title: title,
    author: author || undefined,
    cover: cover || undefined,
    coverHeaders: cover ? this._imageHeaders(url) : undefined,
    description: description,
    status: status,
    genres: this._parseGenres(html),
    format: "manga",
    contentType: "manga",
  };
};

MangaKakalot._labelValue = function(html, label) {
  var re = new RegExp(label + "\\s*:?\\s*<\\/[^>]+>\\s*<[^>]+>([\\s\\S]{0,400}?)<\\/", "i");
  var match = html.match(re);
  return match ? this._stripTags(match[1]) : "";
};

MangaKakalot._statusFromText = function(value) {
  var text = String(value || "").toLowerCase();
  if (/complete|finished/.test(text)) return "completed";
  if (/hiatus/.test(text)) return "hiatus";
  if (/cancel/.test(text)) return "cancelled";
  if (/ongoing|releas|publishing/.test(text)) return "ongoing";
  return undefined;
};

MangaKakalot._parseGenres = function(html) {
  var genres = [];
  var re = /\/genre\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = re.exec(html)) !== null) {
    var name = this._stripTags(match[1]);
    if (name && genres.indexOf(name) === -1) genres.push(name);
  }
  return genres;
};

MangaKakalot.getChapters = async function(mangaId) {
  var slug = this._slugFromId(mangaId);
  var json = await this._fetchJson(this.BASE_URL + "/api/manga/" + encodeURIComponent(slug) + "/chapters?limit=-1", {
    timeout: 30000,
  });
  var items = json && json.success && json.data && Array.isArray(json.data.chapters) ? json.data.chapters : [];
  var chapters = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var chapterSlug = item.chapter_slug || item.slug || "";
    if (!chapterSlug) continue;
    var chapterNumber = parseFloat(item.chapter_num || item.chapter || item.chapter_name || "0");
    if (!Number.isFinite(chapterNumber)) chapterNumber = i + 1;
    var id = "/manga/" + slug + "/" + chapterSlug;
    if (seen[id]) continue;
    seen[id] = true;
    chapters.push({
      id: id,
      title: this._decode(item.chapter_name || ("Chapter " + chapterNumber)),
      chapterNumber: chapterNumber,
      dateUploaded: item.updated_at || undefined,
    });
  }
  if (chapters.length === 0) throw new Error("MangaKakalot returned no chapters.");
  return chapters.sort(function(a, b) {
    return a.chapterNumber - b.chapterNumber;
  });
};

MangaKakalot.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var url = this._absUrl(path);
  var html = await this._fetchText(url, { minWaitMs: 1200, maxWaitMs: 12000 });
  var pages = [];
  var seen = {};
  var reader = (html.match(/<div[^>]+class=["'][^"']*container-chapter-reader[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div/i) || [])[1] || html;
  var imgRe = /<img\b[^>]*>/gi;
  var match;
  while ((match = imgRe.exec(reader)) !== null) {
    var tag = match[0];
    var src = this._absUrl(this._attr(tag, "src") || this._attr(tag, "data-src"));
    var alt = this._attr(tag, "alt");
    var isPage = /2xstorage\.com/i.test(src) || /\bpage\s+\d+\b/i.test(alt);
    if (!isPage || !src || /logo|banner|loading|loader|avatar|favicon|svg/i.test(src) || seen[src]) continue;
    seen[src] = true;
    pages.push({
      url: src,
      headers: this._imageHeaders(url),
    });
  }
  if (pages.length === 0) throw new Error("MangaKakalot returned no pages for this chapter.");
  return pages;
};

MangaKakalot.getDiscoverSections = async function() {
  return [
    { id: "latest", title: "Latest Updates", icon: "time" },
    { id: "popular", title: "Top Read", icon: "flame" },
    { id: "new", title: "Newest", icon: "new" },
    { id: "completed", title: "Completed", icon: "check" },
  ];
};

MangaKakalot.getDiscoverItems = async function(sectionId, page) {
  var pageNumber = (page || 0) + 1;
  var path = "/manga-list/latest-manga";
  if (sectionId === "popular") path = "/manga-list/hot-manga";
  else if (sectionId === "new") path = "/manga-list/new-manga";
  else if (sectionId === "completed") path = "/manga-list/completed-manga";
  var url = this.BASE_URL + path + (pageNumber > 1 ? "/" + pageNumber : "");
  try {
    var html = await this._fetchText(url, { minWaitMs: 1200, maxWaitMs: 12000 });
    return this._parseListHtml(html);
  } catch (e) {
    return [];
  }
};

MangaKakalot._parseListHtml = function(html) {
  var out = [];
  var seen = {};
  var re = /<a[^>]+href=["']([^"']*\/manga\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = re.exec(html)) !== null) {
    var url = this._absUrl(match[1]);
    var slug = this._slugFromId(url);
    if (!slug || seen[slug]) continue;
    var block = match[2] || "";
    var img = (block.match(/<img[\s\S]*?>/i) || [])[0] || "";
    var title = this._attr(img, "alt") || this._stripTags(block);
    if (!title || title.length < 2) continue;
    var cover = this._absUrl(this._attr(img, "src") || this._attr(img, "data-src"));
    seen[slug] = true;
    out.push({
      id: slug,
      title: title,
      cover: cover || undefined,
      coverHeaders: cover ? this._imageHeaders(url) : undefined,
      url: url,
      source: this.name,
      format: "manga",
      contentType: "manga",
      contentTypes: ["manga"],
      contentSubtypes: ["manga"],
    });
  }
  return out;
};

MangaKakalot.getSettings = function() {
  return [];
};

__cinderExport = MangaKakalot;
if (typeof module !== "undefined") module.exports = MangaKakalot;
