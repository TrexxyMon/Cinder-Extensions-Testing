# AudioBookBay

Private testing extension for audiobook-capable Cinder builds. Search, details, browsing and torrent resolution run on the device. There is no scraping server or additional API key.

- Search returns the site's release order and pagination, with its title, author, cover, audio format, size and language when available.
- Details add the site's synopsis and narrator when available. Metadata is the release's own data and may be inaccurate; actual debrid files determine the downloaded audio tracks.
- Latest Audiobooks, Fiction, Fantasy, Mystery and Science Fiction are optional Discover shelves. Nothing is added automatically.
- Downloads require a connected debrid provider that supports torrents. The extension returns a magnet from the release's validated info hash and trackers. Cinder owns the provider selection, file selection, download/import and playback.
- It never follows advertisements labeled Direct Download, downloads sample audio as the book, supplies HTML as a file, or invents a single-track filename for a multifile torrent.
- Website checks can be completed using Verify Website in extension settings. Public pages currently work without signing in. If access changes, sign in or verify in that browser when the website asks; no credentials are stored in this extension.
- A Website setting allows an explicitly selected future AudioBookBay HTTPS mirror. Only `audiobookbay.lu` was verified during implementation; the extension does not automatically probe unverified mirrors.

## Compatibility and performance

The extension uses existing `cinder.fetch`, `parseHTML`, namespaced settings and `debridLink` contracts. Browser/session/URL helpers are optional and guarded. It does not require new extension APIs. Old app versions without an audiobook player cannot play audiobook files, even if their extension parser can run this script. The repository entry requires 1.2.4; private testers must use the new audiobook-capable build.

One page fetch produces all search results, with no per-result detail requests. Concurrent identical requests share work. Parsed result/detail caches are limited to 24 entries and expire in 30/60 seconds; no persistent HTML, credentials or large binary data is retained. Direct HTTP is attempted first. A single bounded hidden-browser fallback handles readable browser sessions; it does not solve interactive challenges. Search and browse request budgets stay below the current runtime's 15/10-second deadlines under normal bridge behavior.

Release identity is its stable site path, not the chosen mirror. Resolution refuses invalid or conflicting torrent hashes. A detail page lacking a torrent may still display its metadata, but cannot start a misleading download.

## Validation (2026-11-01)

First-party pages inspected:

- [Homepage/search form](https://audiobookbay.lu/)
- [Search and pagination](https://audiobookbay.lu/?s=pride+prejudice)
- [Public detail-table structure](https://audiobookbay.lu/abss/artificial-intimacy-who-we-become-when-we-talk-to-machines-sherry-turkle/)

Direct unauthenticated HTTP returned 200 for the home, search and detail pages. Both direct HTML and browser-rendered HTML were parsed with Cinder's actual HTML parser; search returned nine entries and the detail page supplied a valid torrent identity. No torrent or audio payload was downloaded.

The regression suite covers metadata, pagination, source ordering/deduplication, valid/invalid/conflicting hashes, base32 magnets, missing torrents, sample/ad exclusion, empty results, website challenges, rate limits, removed releases, bounded caching, request deduplication, mirrors, unsafe URLs, oversized pages and the legacy optional-helper API shape. The same suite runs against the historical build-159 parser (`1ec6df4`).

Run from this repository with `CINDER_APP` pointing at the app checkout:

```powershell
$env:CINDER_APP = 'C:\path\to\cinder'
node --test tests/audiobookbay.test.cjs
```

Captured live pages are local research artifacts, not repository fixtures. The two optional captured-page tests skip if those artifacts are absent. All synthetic regression cases still run.

Still required: Expo search/details/verification UI, installed iOS and Android debrid download/import/playback, multifile/collection selection, and provider-specific streaming checks using authorized content. Static parser tests do not establish those device outcomes.
