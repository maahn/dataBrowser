# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DataBrowser is a static web app (remote-sensing quicklook viewer) that shows 1–6 quicklook PNGs side by side for a chosen site and date. There is no build step, package manager, linter, or test suite. It is served as-is by a PHP-capable web server (PHP is required for the five `.php` files).

To run locally (first `cp config.example.json config.json` if `config.json` is missing): `php -S localhost:8000` in the repo root, then open `http://localhost:8000/dataBrowser2.html`. Opening via `file://` will not work (`fetch('config.json')` and the PHP endpoints need HTTP). `jQuery`/`jQuery UI` are loaded from `code.jquery.com`, so a network connection is needed.

## Architecture

- **`dataBrowser{1,2,3,4,6}.html`** — one page per panel count (the number in the filename *is* the panel count). They are near-duplicates: each sets `var noPanels = N`, includes the panel `<img>`/`<select>` elements for that layout, and carries layout-specific inline CSS. `index.html` just redirects to `dataBrowser2.html`. A change to shared markup (controls, permalink dialog, script includes) must be repeated in every layout file. (There is no `dataBrowser5.html`; the panel selector offers 1/2/3/4/6.)
- **`dataBrowser.js`** — all behavior, shared by every layout. Plain global-state jQuery code (`config`, `dataStrings`, `minDates`, etc.), no modules.
- **`config.json`** — the single source of truth for sites. It is gitignored (site-specific); `config.example.json` is the tracked template (LIM only) and `README.md` documents the format. When adding config keys, update the example and README too. Top-level `title`, `organization` and `imprintUrl` set the page title and the GitHub/Imprint links in the control bar (`setupInfoLinks()`); the HTML `<title>` is only a fallback. Each entry under `sites` has `longName`, `minDate`/`maxDate`, `hasDisabled`, `dataStrings`, and optionally `cloudnetSiteName`. Adding a site or instrument is normally a `config.json`-only change.
- **`dataBrowser.css`** — shared styles.
- **`getIp.php`** — emits `var yourIp='…'`; JS uses it to set `uniNetwork` (university IP prefixes) and decide whether to show the "only accessible from university network" notice for `hasDisabled` sites.
- **`getCloudnetData.php` / `getCloudnetProducts.php`** — server-side proxies to the Cloudnet API (`cloudnet.fmi.fi`) for CORS reasons; the products proxy caches to `sys_get_temp_dir()` for 24 h. `getCloudnetData.php` takes either `date` or `dateFrom`/`dateTo` (+ optional `variable`).
- **`getCloudnetSiteProducts.php`** — Cloudnet has no per-site product list, so this probes every product with `files?site=…&product=…&limit=1` (parallel `curl_multi`) and caches the ids of products with data per site for 24 h. `pruneCloudnetOptions()` in `dataBrowser.js` uses it to drop Cloudnet dropdown options the site has never had (asynchronously, keeping selected ones; on failure all options stay).
- **`getDirectoryListing.php`** — returns an Apache directory listing as a JSON array of names. Only https hosts that appear in `config.json` `dataStrings` are allowed (not an open proxy); remote 404 → 404, other failures → 502.

### Data flow

1. `dataBrowser.js` fetches `config.json` on load, populates the global maps, then `initializePage()` wires up the datepicker, selects, and handlers.
2. `loadCloudnetProductVariables()` fetches the Cloudnet product list once, then `handleUrlParameters()` restores state from the query string (`site`, `date`, and panel names `UpperLeft`, `UpperRight`, `LowerRight`, `LowerLeft`, `UpperCenter`, `LowerCenter`; `noPanels` can also be overridden by URL).
3. `populateSelect()` fills every panel `<select>` with the site's `dataStrings` keys plus (if the site has `cloudnetSiteName`) one `cloudnet_<variableId>` option per Cloudnet product variable.
4. `setImages()` → `setOneImage()` per visible panel (panel index 0 always, others only if `noPanels > index`). Panel DOM ids follow the pattern `#<Panel>Data` (img), `#<Panel>Error`, `#<Panel>Link`, `#select<Panel>`.

### Two image sources

- **Config sources:** a `dataStrings` value is a jQuery UI `$.datepicker.formatDate` format string, with literal text in single quotes (e.g. `'https://…/'yy'/'mm'/'dd'/'yymmdd'_foo.png`). The date is formatted straight into the image URL. A value of `"disabled"` renders a disabled option.
- **Cloudnet sources:** option values prefixed `cloudnet_` are looked up asynchronously via `getCloudnetData.php` (per site+date, cached in memory; today's data expires after `CACHE_TTL_MS`) and resolved to `https://cloudnet.fmi.fi/api/download/image/<s3key>`.

### Address bar and missing-image hints

- `setImages()` ends with `updateAddressBar()`, which mirrors site, absolute date and panel selections into the URL via `history.replaceState` (no history entries). `createUrl()` / `panelValue()` build it; an empty select is written as `default`.
- When a site change leaves a panel's product unavailable, `selectPanelValue()` resets the dropdown to "Select:" (panel empty); products with the same key are kept.
- When an image fails to load (`error.databrowser` handler) it is replaced by `default.gif` (no broken-image icon) and `showAdjacent()` adds "Previous/Next available image" links:
  - config sources: `findAdjacentImageDate()` compares the URL the format yields for a reference date with the listing one level above the first date-dependent path segment (`getDirectoryListing.php`), then verifies lower directory levels in parallel chunks (empty day folders exist). Earlier-search is capped at `EARLIER_SEARCH_DAYS`; later-search goes up to today.
  - Cloudnet: `findAdjacentCloudnetDate()` queries the API for the product variable in a date window (next: tomorrow..today, previous: 1 year back) and takes the nearest `s3key` yyyymmdd prefix.
  - Async results are dropped via `isStillCurrent()` if the user changed panel/site/date meanwhile.

### Dates

`minDate`/`maxDate` in `config.json` may be absolute `"yyyy-mm-dd"` strings or integer day offsets (`0` = today). The URL `date` param likewise accepts offsets (`-1` = yesterday); the permalink dialog generates `-1`/`0`/absolute links. See the `resolve*` helpers in `dataBrowser.js`; relative dates are resolved to real `Date` objects because jQuery UI treats `setDate(0)` as falsy.

## Gotchas

- Panel-order arrays (`["UpperLeft","UpperRight","LowerRight","LowerLeft","UpperCenter","LowerCenter"]`) are duplicated in several functions; keep them in sync when touching panel logic.
- `config.json` is hand-edited and not validated; e.g. an invalid date such as `2026-09-31` is already present for Falkenberg.
- `.aider*` files are local tooling artifacts (gitignored); ignore them.
