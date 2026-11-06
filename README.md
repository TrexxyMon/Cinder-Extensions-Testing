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
- **The Pirate Bay Audiobooks**: Audiobook-only search, release sizes and seeders, with magnet downloads through your connected debrid provider. See [setup and validation](docs/thepiratebay-audiobooks.md).
- **AudioBookBay**: On-device audiobook search, release details and torrent magnets through your connected debrid provider. Requires an audiobook-capable Cinder build. See [setup and validation](docs/audiobookbay.md).
- **Knaben Audiobooks**: Audiobook-only search and optional discovery shelves using the official API, published seed counts, and magnet handoff to your connected debrid provider. See [setup and validation](docs/knaben-audiobooks.md).
- **Z-Library (Direct)**: Scrapes Z-Library mirrors with IP rotation and Cloudflare bypass.
- **JNovels**: Searches JNovels light novel EPUB/PDF posts with on-device link resolution.
- **NovelUpdates**: Searches and discovers translated web novels, loads rich series metadata, and builds available translator chapters into EPUB. Use the extension website button for sessions that require login.
- **ReadComicsOnline**: Searches, browses, and reads western comics from ReadComicsOnline.ru with direct requests and browser fallback.

## Moved to the public repository

**Mayberry** is now maintained in [Cinder Extensions](https://github.com/TrexxyMon/Cinder-Extensions) and is no longer listed in this testing catalog. Add the [public repository manifest](https://raw.githubusercontent.com/TrexxyMon/Cinder-Extensions/main/repo.json), refresh repositories, and update Mayberry to `0.1.2-cinder`. The `mayberry` extension ID and book IDs are unchanged; do not uninstall it to migrate.

The existing `mayberry.js` file is retained unchanged at `0.1.1-cinder` only to keep the old script URL working for cached manifests and older installations. New releases belong in the public repository.

## Disclaimer
These extensions are for testing purposes only. Please respect copyright laws and the terms of service of the respective providers.
