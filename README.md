# oneBetter

Better Here is a browser extension for Linux. When you visit the site of a Windows or macOS app, it suggests a Linux alternative. It never redirects.

## Build

```sh
deno task build   # dist/chromium and dist/firefox
deno task test
deno task check   # validate data, add --flathub --dns to verify online
```

Load `dist/chromium` via `chrome://extensions` (Developer mode, Load unpacked) or `dist/firefox/manifest.json` via `about:debugging`.

## Data

- `data/apps/*.json`: apps, the URLs they match and their alternatives.
- `data/alternatives/*.json`: Linux apps, keyed by id.

A match rule is `host` or `host/path`. Hosts include subdomains. Paths match by prefix at a segment boundary, with an optional locale segment such as `/en-us`.

```json
{
  "id": "teamviewer",
  "name": "TeamViewer",
  "match": ["teamviewer.com"],
  "linux": true,
  "alts": ["rustdesk"]
}
```

`linux` is true when the app has a Linux build, which changes the wording from "doesn't work on Linux" to "works better on oneOS".

Optional `why` replaces the card's description, e.g. "7-Zip for Linux is command line only."
