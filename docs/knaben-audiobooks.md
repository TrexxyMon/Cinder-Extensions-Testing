# Knaben Audiobooks

On-device access to Knaben's official v2 API. No API key, scraping server, or website login is needed. A connected Cinder debrid service is required to prepare/download the selected release. Playback needs an audiobook-capable Cinder build (repository minimum 1.2.4).

- Both search and the optional Latest/Popular Audiobooks shelves request category `1003000` (Audio / Audiobook). Results are also checked locally against this category, excluding ebooks and music from a malformed/mixed response.
- Results retain the release title, source, date, description and size when provided. Knaben does not reliably provide authors or cover art; this extension does not invent either. Existing selected-book metadata remains Cinder's responsibility.
- `availability` and legacy `seeders` expose a valid `liveSeeders` count, falling back to `seeders`. `availabilityLabel` is `Seeders`. Zero remains zero; unknown counts are omitted. The count is a snapshot, not a guarantee of provider completion.
- Search requests use the API's seed-count ordering. Cinder's Search Results settings can override source order/limits. Duplicate hashes from different trackers are collapsed without summing their counts.
- Resolution returns only a validated magnet and known total size to Cinder. It never downloads binaries, follows arbitrary result URLs, invents a single-file name, or starts playback. Collections/file selection and remote waiting belong to Cinder.
- A saved result is looked up by exact hash when its short cache expires. Conflicting hashes are rejected, and a different release with the same title cannot silently replace it.

## Performance and compatibility

Uses existing `cinder.fetch` and standard extension search/resolve/discovery contracts; no new native APIs. The generic count label is used by newer Cinder builds; older audiobook builds still receive `seeders`.

One API request produces a page of up to 40 results. No per-result health or metadata requests. Identical concurrent requests share work; the cache is bounded to 12 pages and 60 seconds. Request starts are spaced by at least 2.1 seconds, queued delay is bounded, and HTTP 429 respects Retry-After. Each network request has a five-second timeout. API unsafe/adult/dead-result opt-ins are not enabled.

## Evidence and validation (2026-11-03)

- [Official API v2](https://knaben.org/api/v2/): GET search/browse, category filters, hash lookup, sorting and pagination.
- [Official category selector](https://knaben.org/rss/): Audiobook value `001003000`.
- [Official service status](https://knaben.org/status/): temporary one-request-per-two-seconds limit.
- Live unauthenticated search returned audiobook records, valid hashes, sizes and published counts. Read-only tests exercised the extension's search, optional browse and resolution. No provider account was used and no audio payload was downloaded.

Run `node --test tests/knaben-audiobooks.test.cjs`. Fixtures cover category filtering, zero/missing counts, hash conflicts, expired results, deduplication, shared requests, rate limits, response validation, cache bounds and debrid-only resolution. Installed iOS/Android debrid preparation, download/import and playback remain device-validation tasks.
