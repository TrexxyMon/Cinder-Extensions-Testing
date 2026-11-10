# Audiobook sources: audit and integration research

Date: 2026-11-10. This document belongs to the private extension repository.
Website-specific code and identifiers must remain outside the application.

## Scope and validation boundaries

The audited release baseline is private-repository main at `d0e4033`:
AudioBookBay 0.1.2, Knaben Audiobooks 0.1.0, and The Pirate Bay Audiobooks 0.1.1.
The older sibling checkout was not the published baseline and was left intact.

All three sources return magnet identities through Cinder's existing generic
debrid contract. They do not implement provider credentials or provider downloads
themselves. The app supports TorBox, Real-Debrid, Debrid-Link, Premiumize, and
All-Debrid for durable preparation/download. Personal-library streaming is
implemented for TorBox, Real-Debrid, Premiumize, and All-Debrid; Debrid-Link
personal-library browsing/streaming is not implemented.

Provider-response fixtures are not live provider-account verification. No full
audiobooks were downloaded, no debrid tasks were created, and no installed iOS or
Android playback tests were performed in this audit. A valid result does not
guarantee a provider can obtain an uncached release or unlock a particular host.

## Result completeness

### Confirmed fixes in this audit

- The Pirate Bay: accept the first-page convention used by individual-source
  browsing (`1`) as well as Search Downloads (`0`). Later pages remain empty
  because the upstream endpoint is not paginated.
- Knaben: request the documented `&dead` option for search, browse, and exact-hash
  revalidation. The previous default omitted zero-peer releases and could make a
  saved result disappear solely because its peer count fell to zero. A debrid
  provider may still have a cached copy. Category filters, safe/adult exclusions,
  page limits, ordering, and rate limits are unchanged.
- AudioBookBay: compare hexadecimal and base32 forms of the same identity after
  canonicalization instead of rejecting them as conflicting hashes.
- AudioBookBay/Knaben: reject malformed all-zero torrent identities.
- Cinder: accept Real-Debrid's documented empty `202 Action already done` response
  only for file selection and continue polling the same task. Do not treat an
  empty submission response as a durable receipt.
- Cinder: exclude exact sample/preview/trailer M4B names just like the other
  supported audio formats, so a sample cannot replace a complete archive.

Extension release versions: AudioBookBay 0.1.3-cinder, Knaben 0.1.1-cinder,
The Pirate Bay 0.1.2-cinder; repository index 2.1.106.
The two Cinder changes require an app update; the source changes use the existing
extension API. The extension suite was also checked against the historical Cinder
parser harness (35 tests passed, two optional captures skipped).

Live searches returned the following raw, valid source candidates; these are not
all guaranteed title matches or guaranteed downloadable releases:

| Source | librivox | Wind and Truth | Isles of the Emberdark |
| --- | ---: | ---: | ---: |
| AudioBookBay | 9 | 3 | 1 |
| Knaben after inactive inclusion | 39 unique | 0 upstream | 0 upstream |
| The Pirate Bay | 100 | 0 upstream | 0 upstream |

Knaben's same query previously returned 16 unique identities from 17 upstream
rows. One selected result from each source resolved to a valid magnet. The Pirate
Bay's inspected result set was already sorted descending by availability.

Final checks: 64 extension tests passed, two optional saved-page tests skipped;
283 app tests passed across 20 suites. Application TypeScript, scoped ESLint, and
whitespace checks passed. App tests include all five providers' submission,
inspection, track selection, and link-resolution contracts, but use fixtures.

Contracts: <https://knaben.org/api/v2/>, <https://api.real-debrid.com/>,
<https://debrid-link.com/api/v2/api_doc/infos>.

Cinder intentionally uses a maximum window of 50 raw candidates per source for
Search Downloads, then applies title/format matching and the user's result limit
and order. The default can be overridden by source preferences. AudioBookBay and
Knaben request/return bounded pages; The Pirate Bay endpoint supplies one bounded
result set. This is not an exhaustive retrieval of every match in an entire
remote catalog. Removing all limits would add latency and memory/request load.

Keep zero-availability results: a provider may already have a cached copy.
Preserve different releases/editions; deduplicate by validated release identity,
not merely by title. Resolve only the chosen result, never a similarly named one.

## New source feasibility

### GoldenAudiobooks: best first direct-audio candidate

Public search and detail HTML were accessible. A sample detail page contained
14 ordered MP3 players. A read-only HEAD request for the first track returned
HTTP 200, `audio/mpeg`, a positive Content-Length, and `Accept-Ranges: bytes`
without custom authentication headers. No audio body was downloaded.

An independently written extension can return one `audioFiles` list per edition,
deduplicate each player's nested source/link, preserve track order and stable
names, and return covers and descriptions from the detail page. Search needs
pagination and title-aware matching because the site's full-text search returns
unrelated posts containing the query words.

This fits Cinder's existing direct-file download and streaming contract in
principle. Native duration/chapter inspection, actual range seeking, and playback
still require installed-device testing. Other titles may use different players,
multiple pages, missing files, or other hosts; one successful sample is not a
whole-catalog guarantee.

Sources: <https://goldenaudiobooks.com/>,
<https://goldenaudiobooks.com/?s=Wind+and+Truth>,
<https://goldenaudiobooks.com/juliet-marillier-the-amber-owl-audiobook/>.

### AudiobooksBee: straightforward host-link downloads

Public search/detail pages were accessible. The inspected Project Hail Mary
page supplied a Rapidgator (`rg.to`) ZIP link. The site also advertises a separate
VIP library; no paid/private library access was tested.

An extension can search and paginate the public catalog, read metadata, and pass
the selected host link to Cinder as `debridLink`/alternative `debridLinks`.
Provider host support, account plan, quotas, file deletion, and temporary host
outages remain provider-specific. A ZIP must download/extract before playback;
it cannot be streamed as an audiobook file. Paid access is a separate optional
account integration, not something debrid automatically supplies.

Sources: <https://audiobooksbee.com/>,
<https://audiobooksbee.com/?s=Wind+and+Truth>,
<https://audiobooksbee.com/project-hail-mary-by-andy-weir/>.

### Audiobooks4Soul: needs a session/player proof of concept

Search and detail pages were accessible. The inspected player stores encoded
track values and uses its own same-origin `decrypt.php` endpoint to obtain URLs.
A separate stateless request to that endpoint returned HTTP 403, "Access denied".
That does not establish the cause or prove it will fail in the site's real browser
session. No authentication or access check was bypassed.

The next step is an on-device browser-session proof of concept using the normal
player's documented-by-source request flow. Confirm URL renewal, track ordering,
cookie/referrer requirements, and seekable complete audio before promising
streaming. Cinder's current generic source streaming rejects per-file headers;
downloads support them. Therefore a header-dependent stream may require a
separate generic app change, even if downloads work in an extension.

Sources: <https://audiobooks4soul.com/home-1/>,
<https://audiobooks4soul.com/?s=Wind+and+Truth>,
<https://audiobooks4soul.com/the-way-of-kings-audiobook-v1/>.

### Litgu: audiobook-only catalog and host-link resolution

The public site uses DataLife Engine and has an explicit `/audiobook/` category
with pagination. The sampled audiobook entry provided MP3 metadata and a
site-owned redirect containing an encoded Turbobit host URL. The wider site also
contains ebooks, so an audiobook extension must filter by category, not simply
search every entry and label it audio. Language and narrator metadata should be
preserved instead of assuming English.

An extension can resolve public redirect wrappers, validate destinations, and
send host links to the existing debrid flow. Multipart archives must remain a
complete selected volume group; mirror alternatives are not separate tracks.
Host support and download/streaming limitations are the same as AudiobooksBee.

Future adapter boundaries: the current durable preparation path expects magnets
for torrents rather than an HTTP `.torrent` file URL. Debrid-Link folder unlocks
can return multiple objects, while current host submission expects one. These
do not affect the three magnet-returning extensions audited here, but must be
handled or explicitly excluded when adding a new host/folder source.

Sources: <https://litgu.ru/>, <https://litgu.ru/audiobook/>,
<https://litgu.ru/audiobook/achelovek_i_psihologiya/667944-mentalnye-lovushki-gluposti-kotorye-delajut-ljudi-chtoby-isportit-sebe-zhizn-audiokniga.html>.

## audiobook-dl

Official repository inspected at `25ee1fbe8e2e80bd835bf5ba11e90d5bc457c49a`.
This is a Python CLI with requests/lxml, session/authentication support, crypto,
and FFmpeg/ffprobe workflows. It primarily takes a listening-page URL or a user's
library. It is not a JavaScript search-extension runtime, and none of the four
sites above appears in its supported-site list or active source registry.

Its registry includes services such as LibriVox, OverDrive, Storytel/Mofibo,
Audiobooks.com, Blinkist, Chirp, eReolen, Everand, Nextory, Podimo, Saxo,
YourCloudLibrary, and BookBeat. Several require accounts, library access, or
owned/available titles. HLS segments, encrypted audio, header-dependent MP3s,
MP4 inputs, and FFmpeg conversion cannot be treated as interchangeable with
Cinder's existing direct MP3/M4A/M4B/FLAC/WAV contract. Audiobookshelf's HLS support
is a separate path and does not establish generic extension HLS support.

The project is GPLv3. No source code was copied in this research. Prefer small,
independently written adapters for normal public endpoints, with each service's
required authentication preserved. Do not bundle Python/FFmpeg or translate its
implementation wholesale merely to add these four unrelated sites. Cinder already
has a LibriVox integration, so duplicating that adapter adds little value.

Sources:
- <https://github.com/jo1gi/audiobook-dl/blob/master/README.md>
- <https://github.com/jo1gi/audiobook-dl/blob/master/pyproject.toml>
- <https://github.com/jo1gi/audiobook-dl/blob/master/LICENSE>
- <https://github.com/jo1gi/audiobook-dl/blob/master/supported_sites.md>
- <https://github.com/jo1gi/audiobook-dl/blob/master/audiobookdl/sources/__init__.py>
- <https://github.com/jo1gi/audiobook-dl/blob/master/audiobookdl/sources/source/networking.py>

## Suggested delivery order

1. Finish and validate the existing three source fixes and generic debrid fixes.
2. Build GoldenAudiobooks, then AudiobooksBee as separate private extensions.
3. Add Litgu with audiobook-only filtering and archive/mirror handling.
4. Prototype Audiobooks4Soul's session-dependent resolution before committing to
   its streaming support.
5. Consider individual audiobook-dl services only where users need them; assess
   authentication and delivery formats separately rather than promising blanket
   compatibility.

New adapters are research recommendations in this pass, not implemented or
published extensions. Existing app work and extension work are separate; an
extension update can repair source parsing without requiring a new Cinder build,
while generic provider changes require an app update.
