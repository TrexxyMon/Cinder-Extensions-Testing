// Mobilism for Cinder. All forum scraping runs on the user's device.
// No ShelfBridge/VPS dependency; website sign-in uses Cinder's browser session.
// Host interstitials are never returned as if they were ebook/audio files.
var MobilismSource = {
  id: "mobilism",
  name: "Mobilism",
  version: "0.1.0-cinder",
  icon: "book-outline",
  description: "Search Mobilism book releases on-device using your forum account. Download available direct links or use a connected debrid provider.",
  language: "English",
  contentType: "books",
  contentTypes: ["ebook", "audiobook"],
  excludeFromDefaultMetadataProviders: true,
  browser: { startUrl: "https://forum.mobilism.me/ucp.php?mode=login", userAgent: "desktop", requiresAuth: true },
  capabilities: { search: true, searchDownloads: true, discover: true, resolve: true, download: false, manga: false },
  downloadResults: { order: "source", limit: 40 },
  BASE: "https://forum.mobilism.me/",
  _cache: [],
  _pending: {},
  _browserTail: null,
  _browserCount: 0,
  _cooldownUntil: 0
};

MobilismSource.getSettings = function () {
  return [
    { id: "website_login", label: "Sign In to Mobilism", type: "webview", url: this.browser.startUrl,
      subtitle: "Search requires your forum account. Sign in here, then return to Cinder." },
    { id: "media", label: "Release Type", type: "select", defaultValue: "ebook", options: [
      { label: "Books", value: "ebook" }, { label: "Audiobooks", value: "audiobook" }, { label: "Both", value: "all" }
    ], subtitle: "Keep Books selected on older Cinder versions without audiobook support." },
    { id: "download_method", label: "Download Method", type: "select", defaultValue: "auto", options: [
      { label: "Direct, then debrid", value: "auto" }, { label: "Debrid", value: "debrid" }, { label: "Direct only", value: "direct" }
    ], subtitle: "Debrid uses your connected Cinder account. File-host support and verification requirements vary." },
    { id: "download_host", label: "Preferred Download Host", type: "select", defaultValue: "auto", options: [
      { label: "Automatic", value: "auto" }, { label: "CloudFam", value: "cloudfam.io" },
      { label: "VikingFile", value: "vikingfile.com" }, { label: "UploadRAR", value: "uploadrar.com" },
      { label: "Up-4ever", value: "up-4ever.net" }, { label: "DevUploads", value: "devuploads.com" }
    ], subtitle: "Uses the first available host if your preference is not on that release." }
  ];
};

MobilismSource._setting = async function (id, fallback, allowed) {
  var value = cinder.store && typeof cinder.store.get === "function" ? await cinder.store.get(id) : null;
  return allowed.indexOf(value) >= 0 ? value : fallback;
};

MobilismSource.completeSettingAction = async function () {
  // No persistent HTML/cookies in extension storage; website auth belongs to Cinder.
  this._cache = [];
  this._cooldownUntil = 0;
};

MobilismSource._text = function (value) {
  return String(value || "").replace(/\s+/g, " ").trim();
};

MobilismSource._url = function (value, base) {
  var raw = String(value || "").trim().replace(/&amp;/g, "&");
  if (!raw || /[\u0000-\u0020\\]/.test(raw)) return "";
  var url;
  try {
    if (typeof cinder.resolveUrl === "function") url = cinder.resolveUrl(raw, base || this.BASE);
    else if (/^https?:\/\//i.test(raw)) url = raw;
    else if (raw.indexOf("//") === 0) url = "https:" + raw;
    else if (raw.charAt(0) === "/") url = (base || this.BASE).match(/^https?:\/\/[^/]+/i)[0] + raw;
    else if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) url = (base || this.BASE).replace(/[^/]*$/, "") + raw;
  } catch (_) { return ""; }
  var match = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^#]*)?(?:#.*)?$/i.exec(url || "");
  if (!match) return "";
  var host = match[1].toLowerCase();
  // No credential URLs, insecure hosts, loopback/private network addresses or IP literals.
  if (host.indexOf(".") < 0 || /^[\d.]+$/.test(host) || /\.(?:localhost|local|internal|test)$/.test(host)) return "";
  return "https://" + host + (match[2] || "/");
};

MobilismSource._host = function (url) {
  var match = /^https:\/\/([^/]+)/i.exec(url || "");
  return match ? match[1].toLowerCase().replace(/^www\./, "") : "";
};

MobilismSource._topicUrl = function (value) {
  if (/^\d{1,12}$/.test(String(value || ""))) return this.BASE + "viewtopic.php?t=" + value;
  var url = this._url(value);
  var match = /\/viewtopic\.php\?[^#]*\bt=(\d{1,12})(?:&|$)/i.exec(url);
  if (!match || !/^forum\.mobilism\.(me|org)$/.test(this._host(url))) return "";
  // Discard sid, last-post/page offsets and reply anchors. IDs stay stable across sessions.
  return this.BASE + "viewtopic.php?t=" + match[1];
};

MobilismSource._get = function (key) {
  var now = Date.now();
  this._cache = this._cache.filter(function (entry) { return entry.until > now; });
  for (var i = 0; i < this._cache.length; i++) if (this._cache[i].key === key) return this._cache[i].value;
  return null;
};

MobilismSource._remember = function (key, value, ttl) {
  this._cache = this._cache.filter(function (entry) { return entry.key !== key; });
  this._cache.push({ key: key, value: value, until: Date.now() + ttl });
  if (this._cache.length > 24) this._cache.shift();
  return value;
};

MobilismSource._single = function (key, work) {
  if (this._pending[key]) return this._pending[key];
  var self = this;
  var promise = Promise.resolve().then(work);
  this._pending[key] = promise;
  return promise.then(function (value) { delete self._pending[key]; return value; }, function (error) { delete self._pending[key]; throw error; });
};

MobilismSource._headers = async function (url) {
  var headers = { Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" };
  if (typeof cinder.getBrowserSessionHeaders === "function") {
    var session = await cinder.getBrowserSessionHeaders(url);
    // Ask for this exact origin. Never forward the forum's cookie to a file host.
    if (session && session.Cookie) headers.Cookie = session.Cookie;
  }
  return headers;
};

MobilismSource._browser = function (url, selector, interactive) {
  var self = this;
  if (typeof cinder.fetchBrowser !== "function") return Promise.resolve(null);
  if (this._browserCount >= 3) return Promise.reject(new Error("Mobilism's website browser is busy. Please retry in a moment."));
  this._browserCount++;
  // One browser job at a time, even when a shelf refresh and search overlap.
  var previous = this._browserTail || Promise.resolve();
  var next = previous.catch(function () {}).then(async function () {
    var headers = await self._headers(url);
    headers["X-Cinder-Wait-For-Selector"] = selector;
    headers["X-Cinder-Min-Wait-Ms"] = "500";
    headers["X-Cinder-Max-Wait-Ms"] = interactive ? "35000" : "18000";
    headers["X-Cinder-Visible-Layout"] = "1";
    if (!interactive) headers["X-Cinder-Suppress-Interactive"] = "1";
    return cinder.fetchBrowser(url, { browserUserAgent: "desktop", headers: headers, timeout: interactive ? 40000 : 20000 });
  });
  // Catch failures and release the response HTML instead of retaining it in the tail.
  this._browserTail = next.then(function () { self._browserCount--; }, function () { self._browserCount--; });
  return next;
};

MobilismSource._forumError = function (html) {
  var text = cinder.parseHTML(String(html || "")).text();
  if (/not permitted to use the search|must be (?:registered|logged in)|need to (?:login|log in)|login to (?:view|search)/i.test(text))
    return "Mobilism search requires sign-in. Open extension settings > Sign In to Mobilism, log in, then retry.";
  if (/cannot (?:make another|use the) search so soon|please (?:wait|try again) .*?search|search flood|too many requests/i.test(text)) {
    this._cooldownUntil = Date.now() + 30000;
    return "Mobilism is limiting searches. Wait 30 seconds, then try again.";
  }
  if (/requested topic does not exist|topic .*? (?:removed|deleted)|not authorised to read this forum/i.test(text))
    return "This Mobilism release is unavailable or requires permission from the forum.";
  return "";
};

MobilismSource._forum = async function (url, selector) {
  if (/\/search\.php\?/.test(url) && Date.now() < this._cooldownUntil) throw new Error("Mobilism is limiting searches. Wait 30 seconds, then try again.");
  var response = null;
  try { response = await cinder.fetch(url, { headers: await this._headers(url), timeout: 15000 }); } catch (_) {}
  if (response && response.status === 429) {
    this._cooldownUntil = Date.now() + 30000;
    throw new Error("Mobilism is limiting searches. Wait 30 seconds, then try again.");
  }
  var html = response && typeof response.data === "string" ? response.data : "";
  if (html.length > 2000000) throw new Error("Mobilism returned an unusually large page. Please retry a narrower search.");
  var error = this._forumError(html);
  // Retry login-denied responses in the same on-device WebView that holds the login.
  // Rate limits/deleted topics are not reasons to run a browser again.
  if (error && !/requires sign-in/.test(error)) throw new Error(error);
  var doc = cinder.parseHTML(html);
  var empty = /no suitable matches were found|no (?:topics|results|posts) found/i.test(doc.text());
  if (!response || response.status >= 400 || error || (!doc.querySelector(selector) && !empty)) {
    try { response = await this._browser(url, selector, false); } catch (_) { response = null; }
    html = response && typeof response.data === "string" ? response.data : "";
    if (html.length > 2000000) throw new Error("Mobilism returned an unusually large page. Please retry a narrower search.");
    var browserError = this._forumError(html);
    if (browserError || (!html && error)) throw new Error(browserError || error);
    doc = cinder.parseHTML(html);
    empty = /no suitable matches were found|no (?:topics|results|posts) found/i.test(doc.text());
  }
  if (!response || response.status >= 400 || !html || (!doc.querySelector(selector) && !empty))
    throw new Error("Mobilism did not return a readable forum page. Open Sign In to Mobilism, complete any website check, then retry.");
  if (html.length > 2000000) throw new Error("Mobilism returned an unusually large page. Please retry a narrower search.");
  return html;
};

MobilismSource._release = function (raw) {
  var label = this._text(raw);
  var formats = [], match, re = /\b(epub|pdf|mobi|azw3?|cbz|cbr|m4b|m4a|mp3|flac)\b/gi;
  // Formats must be in a suffix, not a word in the book's actual title.
  var suffix = /[\[(]([^\])]*(?:epub|pdf|mobi|azw3?|cbz|cbr|m4b|m4a|mp3|flac)[^\])]*?)[\])]\s*\+?\s*$/i.exec(label);
  if (!suffix) return null;
  while ((match = re.exec(suffix[1]))) if (formats.indexOf(match[1].toLowerCase()) < 0) formats.push(match[1].toLowerCase());
  var clean = label.slice(0, suffix.index).trim();
  var by = clean.lastIndexOf(" by ");
  if (!formats.length || by < 1) return null;
  var audio = formats.some(function (format) { return /^(m4b|m4a|mp3|flac)$/.test(format); });
  return { title: clean.slice(0, by).trim(), author: clean.slice(by + 4).trim(), format: formats[0],
    contentType: audio ? "audiobooks" : "books", contentTypes: [audio ? "audiobook" : "ebook"],
    extra: { releaseTitle: label, formats: formats } };
};

MobilismSource._listing = function (html, media) {
  var doc = cinder.parseHTML(html), links = doc.querySelectorAll("a.topictitle"), seen = {}, results = [];
  for (var i = 0; i < links.length && results.length < 40; i++) {
    var url = this._topicUrl(links[i].attr("href"));
    if (!url || seen[url]) continue;
    var item = this._release(links[i].text());
    if (!item || (media !== "all" && item.contentTypes[0] !== media)) continue;
    seen[url] = true;
    item.id = /[?&]t=(\d+)/.exec(url)[1]; item.url = url; item.source = this.name;
    results.push(item);
  }
  return results;
};

MobilismSource.search = async function (query, page) {
  var self = this, text = this._text(query).slice(0, 200);
  var number = Number(page);
  var offset = (isFinite(number) && number > 1 ? Math.min(1000, Math.floor(number) - 1) : 0) * 40;
  var media = await this._setting("media", "ebook", ["ebook", "audiobook", "all"]);
  var url = text ? this.BASE + "search.php?keywords=" + encodeURIComponent(text) +
    "&terms=all&sf=titleonly&sr=topics&fid%5B%5D=106&sc=1&sk=t&sd=d&start=" + offset :
    this.BASE + "viewforum.php?f=19&start=" + offset;
  var key = "search:" + media + ":" + url, cached = this._get(key);
  if (cached) return JSON.parse(JSON.stringify(cached));
  var result = await this._single(key, async function () {
    var html = await self._forum(url, "a.topictitle");
    return self._remember(key, self._listing(html, media), 30000);
  });
  return JSON.parse(JSON.stringify(result));
};

MobilismSource.getDiscoverSections = async function () {
  return [{ id: "latest", title: "Latest Releases", type: "latest" }];
};
MobilismSource.getDiscoverItems = async function (section, page) {
  return section === "latest" ? this.search("", page) : [];
};

MobilismSource._downloadHost = function (url) {
  var host = this._host(url);
  if (host === "vikingfile.com" || host === "vik1ngfile.site") return "vikingfile.com";
  var hosts = ["cloudfam.io", "uploadrar.com", "up-4ever.net", "up-4ever.com", "devuploads.com",
    "rapidgator.net", "nitroflare.com", "katfile.com", "fikper.com", "filefactory.com", "mediafire.com"];
  return hosts.indexOf(host) >= 0 ? host : "";
};

MobilismSource._fileFormat = function (value) {
  var m = /\.((?:epub|pdf|mobi|azw3?|cbz|cbr|m4b|m4a|mp3|flac|zip|rar|7z))(?:$|[?#])/i.exec(value || "");
  return m ? m[1].toLowerCase() : "";
};

MobilismSource._post = function (html, url) {
  var doc = cinder.parseHTML(html), post = doc.querySelector(".postbody .content") || doc.querySelector("div.content");
  if (!post) throw new Error("Mobilism's release post could not be read.");
  var heading = doc.querySelector("h3 a[href*='viewtopic.php'], h2 a[href*='viewtopic.php']") || doc.querySelector("title");
  var label = heading ? heading.text().replace(/\s*[-\u2013|]\s*Mobilism.*$/i, "") : "";
  var release = this._release(label);
  if (!release) throw new Error("This Mobilism topic is not a supported book or audiobook release.");
  release.id = /[?&]t=(\d+)/.exec(url)[1]; release.url = url; release.source = this.name;
  var body = post.html(), text = cinder.parseHTML(body.replace(/<br\s*\/?\s*>/gi, "\n")).text();
  var overview = /Overview\s*:\s*([\s\S]*?)(?=\bGenre\s*:|\bDownload\s*(?:Instructions|Links)?\s*:|$)/i.exec(text);
  if (overview) release.description = overview[1].trim().slice(0, 12000);
  var size = /Requirements\s*:\s*[^\n]*?\b(\d+(?:[.,]\d+)?\s*(?:KB|MB|GB))\b/i.exec(text);
  if (size) release.size = size[1];
  var genre = /Genre\s*:\s*([^\n]+)/i.exec(text);
  if (genre) release.genres = genre[1].split(/\s*(?:>|\|)\s*/).filter(Boolean);
  var images = post.querySelectorAll("img");
  for (var i = 0; i < images.length; i++) {
    var image = this._url(images[i].attr("data-src") || images[i].attr("src"), url);
    if (image && !/qrp?\.|smil(?:ey|ies)|avatar|icon|banner|badge|button/i.test(image + " " + (images[i].attr("class") || ""))) {
      release.cover = image; break;
    }
  }
  // Only the original post's explicit download section. Never replies, QR images,
  // forum help links, subscription links, signatures or arbitrary ad destinations.
  var marker = /Download\s*(?:Instructions|Links)?\s*:/i.exec(body);
  var downloadBody = marker ? body.slice(marker.index + marker[0].length) : "";
  downloadBody = downloadBody.split(/Trouble downloading|Last edited by|class=["']signature/i)[0];
  var anchors = cinder.parseHTML(downloadBody).querySelectorAll("a[href]"), links = [];
  for (var n = 0; n < anchors.length && links.length < 12; n++) {
    var link = this._url(anchors[n].attr("href"), url);
    if (!link || links.indexOf(link) >= 0 || /\.part\d+\.(?:rar|zip)|\.(?:zip|7z)\.\d{3}(?:$|[?#])|\.[r-z]\d{2}(?:$|[?#])/i.test(link)) continue;
    if (this._downloadHost(link) || (this._fileFormat(link) && !/mobilism\.(org|me)$/.test(this._host(link)))) links.push(link);
  }
  release.extra.links = links;
  return release;
};

MobilismSource.getBookDetails = async function (id) {
  var self = this, url = this._topicUrl(id);
  if (!url) throw new Error("Invalid Mobilism release identifier.");
  var key = "post:" + url, cached = this._get(key);
  if (cached) return JSON.parse(JSON.stringify(cached));
  var result = await this._single(key, async function () {
    var html = await self._forum(url, "div.content");
    return self._remember(key, self._post(html, url), 120000);
  });
  return JSON.parse(JSON.stringify(result));
};

MobilismSource._header = function (headers, name) {
  var keys = Object.keys(headers || {});
  for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === name) return String(headers[keys[i]]);
  return "";
};

MobilismSource._direct = async function (url, referrer, generated, checked) {
  url = this._url(url, referrer);
  if (!url) return null;
  var headers = await this._headers(url);
  headers.Accept = "*/*";
  if (referrer) headers.Referer = referrer;
  var response = checked;
  if (!response) {
    try { response = await cinder.fetch(url, { method: "HEAD", headers: headers, timeout: 10000 }); } catch (_) { return null; }
  }
  if (!response || response.status < 200 || response.status >= 400) return null;
  var type = this._header(response.headers, "content-type");
  var disposition = this._header(response.headers, "content-disposition");
  if (/text\/|html|json|xml/i.test(type)) return null;
  var finalUrl = this._url(response.url || url);
  if (!finalUrl) return null;
  // HEAD can follow a redirect. Re-scope auth to its final destination.
  var finalHeaders = await this._headers(finalUrl);
  finalHeaders.Accept = "*/*";
  if (referrer) finalHeaders.Referer = referrer;
  var nameMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="([^"]+)"/i.exec(disposition) || /filename=([^;]+)/i.exec(disposition);
  var name = nameMatch ? nameMatch[1].trim() : finalUrl.split("?")[0].split("/").pop();
  try { name = decodeURIComponent(name); } catch (_) {}
  name = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  if (!this._fileFormat(name)) return null;
  if (!type && !disposition && !generated) return null;
  var size = Number(this._header(response.headers, "content-length"));
  var result = { url: finalUrl, fileName: name, headers: finalHeaders };
  if (isFinite(size) && size > 0) result.fileSize = size;
  return result;
};

MobilismSource._hostDirect = async function (url) {
  // VikingFile's own client reveals #download-link[href] after Turnstile.
  // CloudFam's paid/ad-flow controls are deliberately NOT guessed or clicked.
  var host = this._downloadHost(url), response, html;
  if (host !== "vikingfile.com" && host !== "cloudfam.io") return null;
  // An authenticated host URL may already redirect to a large file. Inspect headers
  // first so cinder.fetch(GET) never deliberately reads that binary as a string.
  try { response = await cinder.fetch(url, { method: "HEAD", headers: await this._headers(url), timeout: 8000 }); } catch (_) { return null; }
  if (!response || response.status < 200 || response.status >= 400) return null;
  if (!/text\/html|application\/xhtml/i.test(this._header(response.headers, "content-type")))
    return this._direct(url, null, true, response);
  try { response = await cinder.fetch(url, { headers: await this._headers(url), timeout: 10000 }); } catch (_) {}
  html = response && typeof response.data === "string" ? response.data : "";
  var selector = host === "vikingfile.com" ? "#download-link[href]" : "a[download][href]";
  var link = cinder.parseHTML(html).querySelector(selector);
  if (!link && host === "vikingfile.com") {
    try { response = await this._browser(url, selector, true); } catch (_) { response = null; }
    html = response && typeof response.data === "string" ? response.data : "";
    link = cinder.parseHTML(html).querySelector(selector);
  }
  var target = link && this._url(link.attr("href"), url);
  if (!target || target === url || /\/fast-download\/|\/adflow\/|\/premium/i.test(target)) return null;
  return this._direct(target, url, true);
};

MobilismSource.resolve = async function (item) {
  var url = this._topicUrl(item && (item.url || item.id));
  if (!url) throw new Error("Invalid Mobilism release. Search again and select the forum result.");
  // Re-read trusted post data, not caller-supplied extra/download URLs.
  var details = await this.getBookDetails(url), links = details.extra.links.slice();
  if (!links.length) throw new Error("This Mobilism post has no supported single-file download links. Split archives and removed links are not supported.");
  var method = await this._setting("download_method", "auto", ["auto", "debrid", "direct"]);
  var preferred = await this._setting("download_host", "auto", ["auto", "cloudfam.io", "vikingfile.com", "uploadrar.com", "up-4ever.net", "devuploads.com"]);
  var self = this;
  if (preferred !== "auto") links.sort(function (a, b) { return (self._downloadHost(a) === preferred ? 0 : 1) - (self._downloadHost(b) === preferred ? 0 : 1); });
  var chosen = links[0];
  if (method !== "debrid") {
    // Bounded work: only this selected file, no release-wide network fan-out.
    var direct = this._fileFormat(chosen) ? await this._direct(chosen, url, false) : await this._hostDirect(chosen);
    if (direct) return direct;
  }
  if (method !== "direct" && this._downloadHost(chosen)) {
    // Do not assert that opaque links are identical mirrors, or rename ZIP/RAR to EPUB.
    // The connected provider determines the real file name/type. Older builds use debridLink.
    return { debridLink: chosen };
  }
  throw new Error("This file host did not provide a direct file. Try Debrid in extension settings, select another available host, or use the release website. Some hosts require an interactive download flow.");
};

__cinderExport = MobilismSource;
