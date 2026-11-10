# Mobilism 0.1.0-cinder — initial extension

This implementation runs forum search, release parsing and supported direct-link resolution on the device. It does not call ShelfBridge, Ink & Echo, a Cinder VPS, or a scraping service. Optional debrid downloads use the user's existing Cinder provider connection.

## Setup

1. Install Mobilism from this repository.
2. In the extension settings, open **Sign In to Mobilism** and sign in to your own forum account. Complete any website verification there. Close the browser after the website shows you are signed in.
3. Leave **Release Type → Books** selected on older Cinder builds. Audiobooks/Both are for builds with audiobook support; an extension cannot add playback support to an older app.
4. Search in Cinder or use **Search Downloads**. Latest Releases can also be used as an optional discovery shelf.
5. **Direct, then debrid** is the default. For downloads through a connected provider without a direct-link attempt, select **Debrid**. Host availability depends on the connected provider. **Preferred Download Host** selects that host when the release offers it.

Search needs a forum account. Public latest-release browsing can work without one. No forum password or copied cookie needs to be entered into extension fields; Cinder owns the website session.

## Download boundaries

- Search reads one result page, up to 40 releases, in forum order. It does not open every topic to fetch covers; covers and synopses are read when details are requested. Current Cinder builds can honor the extension's result-count/order defaults; older builds retain their existing display limits.
- Direct file URLs are checked with HEAD. HTML interstitials are not returned as ebook/audio payloads. Real archive extensions and response filenames are retained.
- VikingFile's normal website produces `#download-link[href]` after its verification callback. The extension reads that link using Cinder's browser; it does not forge verification tokens or call an undocumented bypass.
- CloudFam is not a universal direct-download URL. Its current pages can use a multi-step ad/timer flow or a paid access prompt. Only an already-exposed download link is accepted. **The full CloudFam free/ad-flow resolver is not implemented.** Those releases require a supporting debrid service or use of the website. The extension does not click payment controls.
- Other recognized hosts are handed to debrid. Recognized means the link can be offered to Cinder, not that every provider supports the host.
- The first link on the selected host is used. Opaque links are not assumed to be interchangeable mirrors: a post may contain different formats, volumes or files. Change the preferred host if appropriate. Split archives are excluded when identifiable; opaque links may still point to unsupported multi-part archives. There is no multi-part assembler in this extension.
- No full book/audio file is read into JavaScript/base64 during resolution. The app's existing transfer implementation performs downloads.

## Compatibility and isolation

The minimum is Cinder **1.2.2**. The API surface was checked against build **159** (`1ec6df4`): website settings, browser sessions, `parseHTML`, `fetch` with HEAD, `resolve`, and `debridLink`. Optional browser/session helpers are guarded. The primary category remains `books`; per-result audiobook routing is additive. There are no native-module or app-code changes.

Only 24 parsed responses are cached in memory, for 30 seconds (search) or two minutes (details). Identical in-flight requests share work; browser requests are serialized. HTTP/search throttles stop retries. Forum session IDs are removed from topic identities, and cookies are requested separately for each origin. No passwords, cookies, signed file links or downloaded files are persisted by this extension.

## Evidence and remaining validation

On 2026-11-01, current public Mobilism release pages yielded 35 supported book/audio rows and two checked topic pages yielded title, author, synopsis, cover, size and host links. This was parsing of retrieved website markup, **not** an authenticated search or completed device download.

Automated tests use Cinder's actual HTML parser and mocked network responses. From this repository with a sibling `cinder` checkout and its dependencies installed:

```powershell
node --test tests/mobilism.test.cjs
$env:MOBILISM_PARSER_REV = '1ec6df4'
node --test tests/mobilism.test.cjs
Remove-Item Env:\MOBILISM_PARSER_REV
```

Alternatively set `CINDER_APP` to that checkout. Historical-parser tests verify parser/API expectations; they do not substitute for running the installed build.

Still required on iOS and Android: sign in using a real forum account, search an unambiguous title, open details, download through the chosen host/provider, verify the resulting file opens, and check login persistence after relaunch. Also test a challenge, an expired session and an unsupported host. **Do not call this release fully device-validated yet.**

## What the supplied preset reveals

The [preset](https://github.com/drewk312/shelfbridge-presets/blob/main/mobilism.json) describes a logged-in Playwright VPS and a `/dl/mobilism/{id}` CloudFam resolver. The [setup guide](https://github.com/drewk312/shelfbridge-presets/blob/main/DIY_SETUP.md) expects separately supplied `vps_scraper.js` and helper files; those are not in the public repository. Its [coverage report](https://github.com/drewk312/shelfbridge-presets/blob/main/COVERAGE.md) marks Mobilism results/downloads as unverified. The public preset therefore is not evidence of a working downloadable resolver we can copy. No code from that private backend was used.

Website contracts inspected: [Mobilism releases](https://forum.mobilism.me/viewforum.php?f=19), the original release-post HTML, and VikingFile's website download control/client callback. Fixtures in tests are synthetic, with no account credentials or real session tokens.
