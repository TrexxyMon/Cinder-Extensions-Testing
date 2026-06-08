var BatCave = {};

BatCave.id = "batcave";
BatCave.name = "BatCave";
BatCave.version = "0.1.1-cinder";
BatCave.icon = "BC";
BatCave.description = "Read western comics from BatCave.";
BatCave.contentType = "comics";
BatCave.contentTypes = ["comic"];
BatCave.contentSubtypes = ["westernComic"];
BatCave.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: false,
  manga: true,
};

BatCave.BASE_URL = "https://batcave.biz";

BatCave._headers = function(extra) {
  var headers = {
    "Referer": this.BASE_URL + "/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (extra) {
    Object.keys(extra).forEach(function(key) {
      headers[key] = extra[key];
    });
  }
  return headers;
};

BatCave._browserHeaders = function(extra) {
  return this._headers(Object.assign({
    "X-Cinder-Suppress-Interactive": "1",
    "X-Cinder-Min-Wait-Ms": "2500",
    "X-Cinder-Max-Wait-Ms": "20000",
  }, extra || {}));
};

BatCave._imageHeaders = function(imageUrl) {
  var headers = {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  };
  if (String(imageUrl || "").indexOf("batcave.biz") !== -1) {
    headers.Referer = this.BASE_URL + "/";
  }
  return headers;
};

BatCave._decode = function(value) {
  if (!value) return "";
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

BatCave._stripTags = function(value) {
  return this._decode(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
};

BatCave._attr = function(html, attr) {
  var re = new RegExp(attr + "\\s*=\\s*([\"'])(.*?)\\1", "i");
  var match = String(html || "").match(re);
  return match ? this._decode(match[2]) : "";
};

BatCave._absUrl = function(value) {
  if (!value) return "";
  var url = this._decode(String(value).trim());
  if (url.indexOf("//") === 0) return "https:" + url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.charAt(0) === "/") return this.BASE_URL + url;
  return this.BASE_URL + "/" + url.replace(/^\/+/, "");
};

BatCave._pathFromUrl = function(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  try {
    var parsed = new URL(raw.indexOf("http") === 0 ? raw : this.BASE_URL + raw);
    return parsed.pathname + parsed.search;
  } catch (e) {
    return raw.replace(this.BASE_URL, "");
  }
};

BatCave._slugFromId = function(value) {
  var path = this._pathFromUrl(value).split("?")[0];
  var parts = path.split("/").filter(Boolean);
  if (parts[0] === "comix" && parts[1]) return parts[1];
  if (parts[0] === "comic" && parts[1]) return parts[1];
  return parts.length ? parts[parts.length - 1] : String(value || "");
};

BatCave._fetchHtml = async function(url, options) {
  options = options || {};
  var headers = this._browserHeaders(options.browserHeaders);
  var res;
  if (cinder.log) cinder.log("BatCave fetch:", url, "browser=", !!cinder.fetchBrowser);
  if (cinder.fetchBrowser) {
    res = await cinder.fetchBrowser(url, { headers: headers });
  } else {
    res = await cinder.fetch(url, { headers: this._headers(options.headers) });
  }
  if ((!res || res.status !== 200 || !res.data) && cinder.fetch) {
    if (cinder.warn) cinder.warn("BatCave browser fetch failed, retrying regular fetch:", res && res.status);
    res = await cinder.fetch(url, { headers: this._headers(options.headers) });
  }
  if (cinder.log) {
    cinder.log(
      "BatCave response:",
      res && res.status,
      "len=" + String((res && res.data) || "").length,
      "head=" + String((res && res.data) || "").slice(0, 120).replace(/\s+/g, " "),
    );
  }
  if (!res || res.status !== 200 || !res.data) {
    throw new Error("BatCave request failed for " + url);
  }
  var html = String(res.data || "");
  if (html.indexOf("/_c") !== -1 || /DLE\s*Guard|site protection|Just a moment|Cloudflare/i.test(html)) {
    throw new Error("BatCave site protection was not cleared by the browser bridge.");
  }
  return html;
};

BatCave._extractData = function(html) {
  var raw = String(html || "");
  var markerIndex = raw.indexOf("window.__DATA__");
  if (markerIndex < 0) return null;
  var scriptEnd = raw.indexOf("</script>", markerIndex);
  var script = scriptEnd >= 0 ? raw.slice(markerIndex, scriptEnd) : raw.slice(markerIndex);
  var equalsIndex = script.indexOf("=");
  if (equalsIndex < 0) return null;
  var jsonText = script.slice(equalsIndex + 1).trim();
  if (jsonText.endsWith(";")) jsonText = jsonText.slice(0, -1).trim();
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    throw new Error("BatCave returned invalid embedded data.");
  }
};

BatCave._parseCards = function(html) {
  var items = [];
  var seen = {};
  if (cinder.parseHTML) {
    var doc = cinder.parseHTML(html);
    var rows = doc.querySelectorAll("#dle-content > .readed, .readed");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var link = row.querySelector(".readed__title > a") || row.querySelector("a[href]");
      if (!link) continue;
      var href = link.attr("href") || "";
      var url = this._absUrl(href);
      var id = this._pathFromUrl(url);
      if (!id || seen[id]) continue;
      seen[id] = true;
      var img = row.querySelector("img");
      var cover = img ? this._absUrl(img.attr("data-src") || img.attr("src") || "") : "";
      items.push({
        id: id,
        title: this._decode(link.text ? link.text() : "") || this._slugFromId(id).replace(/-/g, " "),
        author: "Various",
        cover: cover,
        coverHeaders: cover ? this._imageHeaders(cover) : undefined,
        url: url,
        format: "comics",
        contentType: "comics",
      });
    }
    if (items.length > 0) return items;
  }

  var re = /<div[^>]+class=["'][^"']*\breaded\b[^"']*["'][\s\S]*?<\/div>\s*<\/div>/gi;
  var block;
  while ((block = re.exec(html)) !== null) {
    var itemHtml = block[0];
    var titleLink = itemHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!titleLink) continue;
    var url = this._absUrl(titleLink[1]);
    var id = this._pathFromUrl(url);
    if (!id || seen[id]) continue;
    seen[id] = true;
    var title = this._stripTags(titleLink[2]);
    var imgTag = itemHtml.match(/<img[\s\S]*?>/i);
    var cover = "";
    if (imgTag) {
      cover = this._attr(imgTag[0], "data-src") || this._attr(imgTag[0], "src");
      cover = this._absUrl(cover);
    }
    items.push({
      id: id,
      title: title || this._slugFromId(id).replace(/-/g, " "),
      author: "Various",
      cover: cover,
      coverHeaders: cover ? this._imageHeaders(cover) : undefined,
      url: url,
      format: "comics",
      contentType: "comics",
    });
  }
  return items;
};

BatCave.search = async function(query, page) {
  page = page || 0;
  var safeQuery = String(query || "").trim() || "batman";
  var url = this.BASE_URL + "/search/" + encodeURIComponent(safeQuery);
  if (page > 0) url += "/page/" + (page + 1) + "/";
  var html = await this._fetchHtml(url);
  var items = this._parseCards(html);
  if (cinder.log) cinder.log("BatCave search results:", items.length, "query=", safeQuery);
  return items;
};

BatCave.getDiscoverSections = async function() {
  return [
    { id: "popular", title: "Popular Comics", icon: "flame" },
    { id: "latest", title: "Latest Updates", icon: "time" },
  ];
};

BatCave.getDiscoverItems = async function(sectionId, page) {
  page = page || 0;
  var url = sectionId === "latest" ? this.BASE_URL + "/comix/" : this.BASE_URL + "/comix/";
  if (page > 0) url += "page/" + (page + 1) + "/";
  var html = await this._fetchHtml(url);
  return this._parseCards(html);
};

BatCave.getMangaDetails = async function(id) {
  var path = this._pathFromUrl(id);
  var url = this._absUrl(path);
  var html = await this._fetchHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Text": "window.__DATA__",
      "X-Cinder-Min-Wait-Ms": "3000",
    },
  });

  var title = this._stripTags((html.match(/<header[^>]+class=["'][^"']*\bpage__header\b[^"']*["'][\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  if (!title) title = this._slugFromId(path).replace(/-/g, " ");
  var poster = (html.match(/<div[^>]+class=["'][^"']*\bpage__poster\b[^"']*["'][\s\S]*?<\/div>/i) || [])[0] || "";
  var imgTag = (poster.match(/<img[\s\S]*?>/i) || [])[0] || "";
  var cover = this._absUrl(this._attr(imgTag, "src") || this._attr(imgTag, "data-src"));
  var description = this._stripTags((html.match(/<div[^>]+class=["'][^"']*\bpage__text\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]);

  function metaValue(label) {
    var re = new RegExp("<li[^>]*>[\\s\\S]*?<div[^>]*>\\s*" + label + "\\s*<\\/div>([\\s\\S]*?)<\\/li>", "i");
    return BatCave._stripTags((html.match(re) || [])[1]);
  }

  var genres = [];
  var tagRe = /<div[^>]+class=["'][^"']*\bpage__tags\b[^"']*["'][\s\S]*?<\/div>/i;
  var tagBlock = (html.match(tagRe) || [])[0] || "";
  var tagMatch;
  var linkRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  while ((tagMatch = linkRe.exec(tagBlock)) !== null) {
    var genre = this._stripTags(tagMatch[1]);
    if (genre) genres.push(genre);
  }
  if (genres.indexOf("Comic") === -1) genres.push("Comic");

  return {
    id: path,
    title: title,
    author: metaValue("Writer") || "Various",
    artist: metaValue("Artist") || undefined,
    description: description,
    cover: cover,
    coverHeaders: cover ? this._imageHeaders(cover) : undefined,
    genres: genres,
    status: /completed/i.test(metaValue("Release type")) ? "completed" : (/ongoing/i.test(metaValue("Release type")) ? "ongoing" : "unknown"),
    format: "comics",
    contentType: "comics",
  };
};

BatCave.getChapters = async function(mangaId) {
  var path = this._pathFromUrl(mangaId);
  var url = this._absUrl(path);
  var html = await this._fetchHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Text": "window.__DATA__",
      "X-Cinder-Min-Wait-Ms": "3000",
      "X-Cinder-Max-Wait-Ms": "22000",
    },
  });
  var data = this._extractData(html);
  if (!data || !data.news_id || !Array.isArray(data.chapters)) {
    throw new Error("BatCave chapter data script not found.");
  }
  return data.chapters.map(function(chapter) {
    var number = Number(chapter.posi || 0);
    return {
      id: "/reader/" + data.news_id + "/" + chapter.id + (data.xhash || ""),
      title: chapter.title || ("Issue #" + number),
      chapterNumber: Number.isFinite(number) ? number : 0,
      dateUploaded: chapter.date || undefined,
    };
  }).sort(function(a, b) {
    return a.chapterNumber - b.chapterNumber;
  });
};

BatCave.getPages = async function(chapterId) {
  var path = this._pathFromUrl(chapterId);
  var url = this._absUrl(path);
  var html = await this._fetchHtml(url, {
    browserHeaders: {
      "X-Cinder-Wait-For-Text": "window.__DATA__",
      "X-Cinder-Min-Wait-Ms": "3000",
      "X-Cinder-Max-Wait-Ms": "22000",
    },
  });
  var data = this._extractData(html);
  if (!data || !Array.isArray(data.images)) {
    throw new Error("BatCave page data script not found.");
  }
  var seen = {};
  var pages = data.images.map(function(image) {
    var src = BatCave._absUrl(String(image || "").trim());
    if (!src || seen[src]) return null;
    seen[src] = true;
    return {
      url: src,
      headers: BatCave._imageHeaders(src),
    };
  }).filter(Boolean);
  if (pages.length === 0) throw new Error("BatCave returned no pages for this chapter.");
  return pages;
};

BatCave.getSettings = function() {
  return [];
};

__cinderExport = BatCave;
