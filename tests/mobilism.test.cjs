const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const app = process.env.CINDER_APP || [path.resolve(root, '../cinder'), path.resolve(root, '../..')]
  .find(dir => existsSync(path.join(dir, 'src/extensions/HTMLParser.ts')));
if (!app) throw Error('Set CINDER_APP to a Cinder checkout with npm dependencies installed.');
const appRequire = createRequire(path.join(app, 'package.json'));
const ts = appRequire('typescript');
let parserCode;
if (process.env.MOBILISM_PARSER_REV) {
  assert.match(process.env.MOBILISM_PARSER_REV, /^[a-f0-9]{7,40}$/);
  parserCode = execFileSync('git', ['show', process.env.MOBILISM_PARSER_REV + ':src/extensions/HTMLParser.ts'], { cwd: app, encoding: 'utf8' });
} else parserCode = readFileSync(path.join(app, 'src/extensions/HTMLParser.ts'), 'utf8');
const parser = { exports: {} };
vm.runInNewContext(ts.transpileModule(parserCode, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { exports: parser.exports, require: appRequire });
const parseHTML = parser.exports.parseHTML;
const script = readFileSync(path.join(root, 'mobilism.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const html = data => ({ status: 200, data, headers: { 'content-type': 'text/html' } });
const listing = `<table>
  <tr><td><a class="topictitle" href="viewtopic.php?f=19&amp;t=101&amp;sid=PRIVATE">A Story by An Author (.ePUB)+</a><br>by <a>Uploader</a></td></tr>
  <tr><td><a class="topictitle" href="viewtopic.php?t=101&amp;start=20#p999">A Story by An Author (.ePUB)+</a></td></tr>
  <tr><td><a class="topictitle" href="viewtopic.php?t=102">Another Story by Audio Author (.M4B)</a></td></tr>
  <tr><td><a class="topictitle" href="viewtopic.php?t=103">PDF Handbook by Writer (.PDF)</a></td></tr>
  <tr><td><a class="topictitle" href="viewtopic.php?t=104">An App by Someone (.APK)</a></td></tr>
  <tr><td><a class="topictitle" href="viewtopic.php?t=105">Ebook Requests</a></td></tr>
</table>`;
function post(links = '<a href="https://uploadrar.com/fixture">Host</a>', title = 'A Story by An Author (.ePUB)+') {
  return `<h2>Navigation</h2><h3><a href="viewtopic.php?t=101">${title}</a></h3>
  <div class="postbody"><div class="content"><b>A Story by An Author</b><br>
  <u>Requirements:</u> .ePUB reader, 1.2MB | Retail<br>
  <u>Overview:</u> A fixture description.<br>Second paragraph.<br><b>Genre:</b> Fiction &gt; Adventure<br>
  <img class="qr" src="https://forum.mobilism.me/qrp.png"><img src="https://images.mobilism.org/?dm=FIXTURE"><br>
  <u>Download Instructions:</u><br>${links}<br>Trouble downloading? Read <a href="https://evil.example.org/other.epub">help</a>
  </div></div><div class="postbody"><div class="content"><a href="https://uploadrar.com/comment">Reply</a></div></div>`;
}
function load(options = {}) {
  const requests = [], browserCalls = [], cookieScopes = [], settings = { ...options.settings };
  const api = { parseHTML,
    resolveUrl: (value, base) => new URL(value, base).href,
    store: { get: async key => settings[key] ?? null },
    fetch: async (url, opts) => { requests.push({ url, opts }); return options.fetch ? options.fetch(url, opts) : html(url.includes('viewtopic') ? post() : listing); },
    getBrowserSessionHeaders: async url => { cookieScopes.push(url); return { Cookie: url.includes('forum.mobilism.me/') ? 'forum_session=fixture' : 'host_session=fixture' }; }
  };
  if (options.browser) api.fetchBrowser = async (url, opts) => { browserCalls.push({ url, opts }); return options.browser(url, opts); };
  if (options.legacy) { delete api.resolveUrl; delete api.getBrowserSessionHeaders; }
  const context = vm.createContext({ cinder: api });
  vm.runInContext(script, context);
  return { source: context.__cinderExport, requests, browserCalls, cookieScopes, settings };
}

test('manifest and script agree; existing API surface, no remote scraper/native binary dependency', () => {
  const { source } = load();
  if (existsSync(path.join(root, 'repo.json'))) {
    const entries = JSON.parse(readFileSync(path.join(root, 'repo.json'), 'utf8')).extensions.filter(x => x.id === source.id);
    assert.equal(entries.length, 1);
    for (const field of ['id', 'name', 'version', 'description', 'contentType', 'language']) assert.equal(entries[0][field], source[field]);
    assert.equal(entries[0].minCinderVersion, '1.2.2');
    assert.deepEqual(entries[0].contentTypes, plain(source.contentTypes));
  }
  assert.equal(source.capabilities.resolve, true);
  assert.equal(source.capabilities.download, false);
  assert.equal(source.browser.requiresAuth, true);
  assert.doesNotMatch(script, /inkecho\.duckdns|playwright|fetchBrowserBinary|require\(|eval\(|new Function/);
  assert.equal(source.getSettings().find(s => s.id === 'media').defaultValue, 'ebook');
});

test('search uses forum account, ebook subforums, stable topic IDs, title authors, no detail fan-out', async () => {
  const { source, requests } = load();
  const results = await source.search('A & B', 1);
  assert.deepEqual(plain(results.map(x => x.id)), ['101', '103']);
  assert.equal(results[0].author, 'An Author');
  assert.equal(results[0].title, 'A Story');
  assert.equal(results[0].url, 'https://forum.mobilism.me/viewtopic.php?t=101');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /keywords=A%20%26%20B.*fid%5B%5D=106.*start=0$/);
  assert.equal(requests[0].opts.headers.Cookie, 'forum_session=fixture');
  await source.search('A & B', 2);
  assert.match(requests[1].url, /start=40$/);
});

test('optional media filters and type routing; older builds default to ebooks', async () => {
  const { source, settings } = load({ legacy: true });
  assert.deepEqual(plain((await source.search('x', 0)).map(x => x.contentType)), ['books', 'books']);
  settings.media = 'audiobook';
  const audio = await source.search('x');
  assert.equal(audio.length, 1);
  assert.equal(audio[0].format, 'm4b');
  assert.equal(audio[0].contentType, 'audiobooks');
  settings.media = 'all';
  assert.equal((await source.search('x')).length, 3);
  settings.media = 'bad';
  assert.equal((await source.search('x')).length, 2);
});

test('public browse paginates separately and preserves source order', async () => {
  const { source, requests } = load();
  assert.equal((await source.getDiscoverItems('latest', 3)).length, 2);
  assert.equal(requests[0].url, 'https://forum.mobilism.me/viewforum.php?f=19&start=80');
  assert.deepEqual(plain(await source.getDiscoverItems('unknown', 1)), []);
});

test('unavailable/expired login produces a useful error instead of empty success', async () => {
  const denied = html('<div>Sorry but you are not permitted to use the search system. Please login.</div>');
  for (const browser of [undefined, async () => denied]) {
    const { source, browserCalls } = load({ fetch: async () => denied, browser });
    await assert.rejects(source.search('x'), /requires sign-in/);
    assert.equal(browserCalls.length, browser ? 1 : 0);
    if (browser) assert.equal(browserCalls[0].opts.headers['X-Cinder-Suppress-Interactive'], '1');
  }
});

test('browser-only session recovers search once; successful results are cached and concurrent work deduplicated', async () => {
  const { source, requests, browserCalls } = load({ fetch: async () => html('Sorry but you are not permitted to use the search system.'), browser: async () => html(listing) });
  const result = await Promise.all([source.search('same'), source.search('same')]);
  assert.equal(result[0].length, 2);
  assert.equal(requests.length, 1); assert.equal(browserCalls.length, 1);
  await source.search('same'); assert.equal(requests.length, 1);
  await source.completeSettingAction(); await source.search('same'); assert.equal(requests.length, 2);
});

test('search rate limits are not retried through the browser or returned as no matches', async () => {
  const { source, requests, browserCalls } = load({ fetch: async () => ({ status: 429, data: '', headers: {} }), browser: async () => html(listing) });
  await assert.rejects(source.search('x'), /limiting searches/);
  await assert.rejects(source.search('y'), /limiting searches/);
  assert.equal(requests.length, 1); assert.equal(browserCalls.length, 0);
});

test('real no-results response differs from broken markup, server errors and deleted posts', async () => {
  assert.deepEqual(plain(await load({ fetch: async () => html('No suitable matches were found.') }).source.search('x')), []);
  await assert.rejects(load({ fetch: async () => html('<h1>Unexpected page</h1>') }).source.search('x'), /readable forum page/);
  await assert.rejects(load({ fetch: async () => ({ status: 503, data: listing }) }).source.search('x'), /readable forum page/);
  await assert.rejects(load({ fetch: async () => html('The requested topic does not exist.') }).source.getBookDetails('101'), /unavailable/);
});

test('metadata stays with the original post and download section excludes comments/ads/QR/help/split parts', async () => {
  const links = `<a href="https://uploadrar.com/fixture">File</a><a href="https://uploadrar.com/fixture">QR duplicate</a>
    <a href="https://www.vikingfile.com/f/fixture">Mirror</a><a href="https://files.example.org/Book.part1.rar">Part 1</a>
    <a href="https://files.example.org/archive.zip.002">Part 2</a><a href="javascript:alert(1)">bad</a><a href="https://evil.example.org/ad">Ad</a>`;
  const { source } = load({ fetch: async () => html(post(links)) });
  const details = await source.getBookDetails('https://forum.mobilism.org/viewtopic.php?f=19&t=101&sid=guest&start=50#p123');
  assert.equal(details.id, '101'); assert.equal(details.title, 'A Story');
  assert.equal(details.author, 'An Author');
  assert.match(details.description, /fixture description/);
  assert.doesNotMatch(details.description, /Download|Requirements|Genre/);
  assert.equal(details.size, '1.2MB');
  assert.equal(details.cover, 'https://images.mobilism.org/?dm=FIXTURE');
  assert.deepEqual(plain(details.genres), ['Fiction', 'Adventure']);
  assert.deepEqual(plain(details.extra.links), ['https://uploadrar.com/fixture', 'https://www.vikingfile.com/f/fixture']);
});

test('unsafe URLs and non-forum detail IDs never make a network request', async () => {
  const { source, requests } = load({ legacy: true });
  for (const value of ['javascript:x', 'file:///private/book.epub', 'https://127.0.0.1/x', 'https://localhost/x', 'https://user:pass@host.example.org/x', 'https://foo.local/book.epub', 'https://forum.mobilism.me.evil.org/viewtopic.php?t=1']) {
    await assert.rejects(source.getBookDetails(value), /Invalid/);
  }
  assert.equal(requests.length, 0);
  assert.equal(source._topicUrl('viewtopic.php?t=123&sid=private'), 'https://forum.mobilism.me/viewtopic.php?t=123');
});

test('debrid returns a host page only in debridLink, no guessed EPUB filename or ambiguous alternate file', async () => {
  const { source, requests } = load({ settings: { download_method: 'debrid' }, fetch: async () => html(post('<a href="https://uploadrar.com/a">EPUB</a><a href="https://cloudfam.io/b">MOBI</a>')) });
  const resolved = await source.resolve({ id: '101', extra: { links: ['https://evil.example.org/evil.epub'] } });
  assert.deepEqual(plain(resolved), { debridLink: 'https://uploadrar.com/a' });
  assert.equal(requests.length, 1);
});

test('preferred host is honored when present, falls back only when absent', async () => {
  const { source, settings } = load({ settings: { download_method: 'debrid', download_host: 'cloudfam.io' }, fetch: async () => html(post('<a href="https://uploadrar.com/a">File</a><a href="https://cloudfam.io/b">Mirror</a>')) });
  assert.equal((await source.resolve({ id: '101' })).debridLink, 'https://cloudfam.io/b');
  settings.download_host = 'devuploads.com';
  assert.equal((await source.resolve({ id: '101' })).debridLink, 'https://uploadrar.com/a');
});

test('direct HEAD validates file content, preserves archive extension and avoids fetching binary into JS', async () => {
  const { source, requests } = load({ legacy: true, settings: { download_method: 'direct' }, fetch: async (url, options) =>
    options.method === 'HEAD' ? { status: 200, data: '', headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Real Filename.zip"', 'Content-Length': '5000' } } : html(post('<a href="https://files.example.org/book.zip">Book</a>')) });
  const result = await source.resolve({ id: '101' });
  assert.equal(result.fileName, 'Real Filename.zip'); assert.equal(result.fileSize, 5000);
  assert.equal(result.url, 'https://files.example.org/book.zip');
  assert.equal(requests.length, 2); assert.equal(requests[1].opts.method, 'HEAD');
});

test('HTML masquerading as a direct file is rejected', async () => {
  const { source } = load({ settings: { download_method: 'direct' }, fetch: async (url, options) => options.method === 'HEAD'
    ? { status: 200, data: '', headers: { 'content-type': 'text/html' } } : html(post('<a href="https://files.example.org/book.epub">Download</a>')) });
  await assert.rejects(source.resolve({ id: '101' }), /did not provide a direct file/);
});

test('VikingFile uses its actual generated download control; destination receives only its own cookies', async () => {
  const { source, requests, browserCalls, cookieScopes } = load({ settings: { download_method: 'direct' },
    fetch: async (url, opts) => url.includes('viewtopic') ? html(post('<a href="https://vikingfile.com/f/fixture">Viking</a>', 'An Audio by Someone (.M4B)')) :
      opts.method === 'HEAD' && url.includes('cdn.example.org') ? { status: 200, data: '', headers: { 'content-type': 'audio/mp4', 'content-disposition': "attachment; filename*=UTF-8''A%20Book.m4b" } } : html('<a id="download-link">Generating</a>'),
    browser: async () => html('<a href="https://ads.example.org/premium">Download now</a><a id="download-link" href="https://cdn.example.org/book.m4b?token=ephemeral">Download</a>') });
  const result = await source.resolve({ id: '101' });
  assert.equal(result.fileName, 'A Book.m4b');
  assert.equal(result.headers.Cookie, 'host_session=fixture');
  assert.match(result.url, /^https:\/\/cdn.example.org\/book.m4b/);
  assert.equal(browserCalls[0].opts.headers['X-Cinder-Wait-For-Selector'], '#download-link[href]');
  assert.ok(cookieScopes.includes(result.url));
  assert.ok(requests.filter(x => !x.url.includes('forum.mobilism.me')).every(x => x.opts.headers.Cookie !== 'forum_session=fixture'));
});

test('CloudFam ad/paid flows never become fake downloads or automatic purchases', async () => {
  const { source, requests, browserCalls } = load({ settings: { download_method: 'auto' },
    fetch: async url => url.includes('viewtopic') ? html(post('<a href="https://cloudfam.io/fixture">File</a>')) : html('<a href="/adflow/landing.php?token=secret">Continue to free download</a><button>Buy direct download</button>'),
    browser: async () => { throw Error('Must not click paid/ambiguous controls'); } });
  assert.deepEqual(plain(await source.resolve({ id: '101' })), { debridLink: 'https://cloudfam.io/fixture' });
  assert.equal(requests.length, 3); assert.equal(browserCalls.length, 0);
});

test('already-authorized host redirects are returned without reading the binary into JavaScript', async () => {
  const { source, requests } = load({ settings: { download_method: 'direct' }, fetch: async (url, opts) => {
    if (url.includes('viewtopic')) return html(post('<a href="https://cloudfam.io/fixture">File</a>'));
    assert.equal(opts.method, 'HEAD');
    return { status: 200, url: 'https://cdn.example.org/signed.m4b?token=temporary', data: '', headers: { 'content-type': 'audio/mp4' } };
  } });
  const result = await source.resolve({ id: '101' });
  assert.equal(result.fileName, 'signed.m4b');
  assert.equal(requests.length, 2);
  assert.equal(result.headers.Cookie, 'host_session=fixture');
});

test('cache values are isolated from result mutations by callers', async () => {
  const { source } = load();
  const [first, second] = await Promise.all([source.search('same'), source.search('same')]);
  first[0].title = 'Changed';
  assert.equal(second[0].title, 'A Story');
  assert.equal((await source.search('same'))[0].title, 'A Story');
  (await source.getBookDetails('101')).extra.links.length = 0;
  assert.equal((await source.getBookDetails('101')).extra.links.length, 1);
});

test('browser queue is serial and bounded, and errors release the next request', async () => {
  let active = 0, peak = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const { source } = load({ browser: async () => { active++; peak = Math.max(peak, active); await gate; active--; throw Error('fixture'); } });
  const pending = [1, 2, 3].map(i => source._browser('https://forum.mobilism.me/search.php?x=' + i, 'a', false).catch(() => {}));
  await assert.rejects(source._browser('https://forum.mobilism.me/search.php?x=4', 'a', false), /busy/);
  release(); await Promise.all(pending);
  assert.equal(peak, 1); assert.equal(source._browserCount, 0);
});

test('failed fetches clear in-flight work and cache stays bounded', async () => {
  let fail = true;
  const { source } = load({ fetch: async () => { if (fail) throw Error('offline'); return html(listing); } });
  await assert.rejects(source.search('x'));
  fail = false; assert.equal((await source.search('x')).length, 2);
  for (let i = 0; i < 50; i++) source._remember('fixture-' + i, [], 1000);
  assert.equal(source._cache.length, 24);
  assert.equal(Object.keys(source._pending).length, 0);
});

module.exports = { load };
