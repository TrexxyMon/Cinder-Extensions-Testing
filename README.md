# Cinder Private Extensions

A collection of JS-based extensions for the [Cinder Reader](https://github.com/TrexxyMon/Cinder).

## Repository URL
To use these extensions in Cinder, go to **Settings > Extensions > Add Repository** and paste the following URL:

```
https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions-Testing/main/repo.json
```

## GitHub Repository
[TrexxyMon/Cinder-Extensions-Testing](https://github.com/TrexxyMon/Cinder-Extensions-Testing)

## Available Extensions
- **Mobilism**: On-device forum search with your website login, release metadata, supported direct links and optional debrid. Books by default; audiobook results are opt-in. See [setup, host limitations and validation status](docs/mobilism.md).
- **Z-Library (Direct)**: Scrapes Z-Library mirrors with IP rotation and Cloudflare bypass.
- **JNovels**: Searches JNovels light novel EPUB/PDF posts with on-device link resolution.
- **NovelUpdates**: Searches and discovers translated web novels, loads rich series metadata, and builds available translator chapters into EPUB. Use the extension website button for sessions that require login.
- **ReadComicsOnline**: Searches, browses, and reads western comics from ReadComicsOnline.ru with direct requests and browser fallback.

## Moved to the public repository

**GoldenAudiobooks, AudioBookBay, Knaben Audiobooks, and The Pirate Bay Audiobooks** are now
maintained in the [public repository](https://github.com/TrexxyMon/Cinder-Extensions)
and are no longer listed in this testing catalog. Add the
[public repository manifest](https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json),
refresh both repositories, and update the installed extensions. Do not uninstall:
their extension IDs, release IDs, and settings keys are unchanged.

GoldenAudiobooks requires **no debrid**; AudioBookBay, Knaben Audiobooks, and
The Pirate Bay Audiobooks **require a connected debrid service**.

Public versions: GoldenAudiobooks `0.1.1-cinder`, AudioBookBay `0.1.5-cinder`, Knaben Audiobooks `0.1.3-cinder`,
and The Pirate Bay Audiobooks `0.1.4-cinder`. Their previous private scripts remain
unchanged so cached manifests and older installations keep working. New releases,
tests, and documentation belong in the public repository.

**Mayberry** is now maintained in [Cinder Extensions](https://github.com/TrexxyMon/Cinder-Extensions) and is no longer listed in this testing catalog. Add the [public repository manifest](https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json), refresh repositories, and update Mayberry to `0.1.2-cinder`. The `mayberry` extension ID and book IDs are unchanged; do not uninstall it to migrate.

The existing `mayberry.js` file is retained unchanged at `0.1.1-cinder` only to keep the old script URL working for cached manifests and older installations. New releases belong in the public repository.

## Disclaimer
These extensions are for testing purposes only. Please respect copyright laws and the terms of service of the respective providers.
