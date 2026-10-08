# DataBrowser

A small web app for browsing remote-sensing quicklook plots. Pick a site and a date and view 1–6 plots side by side; the address bar always reflects the current view, so it can be bookmarked or shared. Plots come either from static URL patterns defined in `config.json` or from the [Cloudnet](https://cloudnet.fmi.fi) API.

(c) M. Maahn, 2012–2026, Leipzig University.

## Requirements

- A web server with PHP (e.g. Apache with `mod_php` or PHP-FPM). Plain static hosting is not enough: the `.php` files proxy the Cloudnet API, list remote directories and report the client IP.
- PHP with `allow_url_fopen` enabled (the proxies use `file_get_contents` on https URLs, so OpenSSL support is needed). The `curl` extension is recommended: `getCloudnetSiteProducts.php` uses it to probe products in parallel and falls back to sequential requests otherwise.
- The web server user must be able to write to PHP's temp directory (`sys_get_temp_dir()`), where the Cloudnet proxies cache their responses.
- Outbound HTTPS access from the server to `cloudnet.fmi.fi` and to the hosts used in `config.json`; clients need internet access for jQuery / jQuery UI (`code.jquery.com`).

## Installation

1. Copy the files into a directory served by Apache, e.g. `/var/www/html/dataBrowser/`.
2. `config.json` is site-specific and not tracked in git. Create it from the example and adapt it (see below):

   ```bash
   cp config.example.json config.json
   ```

3. Open `https://your-server/dataBrowser/dataBrowser2.html` (or just the directory, if `index.html` is a directory index). There is one page per panel count (`dataBrowser1/2/3/4/6.html`); `index.html` redirects to the 2-panel page.

For local testing without Apache, `php -S localhost:8000` in the project folder works as well.

## URL parameters

| Parameter | Meaning |
|---|---|
| `site` | site key from `config.json` |
| `date` | `yyyy-mm-dd`, or a day offset (`0` = today, `-1` = yesterday) |
| `UpperLeft`, `UpperRight`, `LowerRight`, `LowerLeft`, `UpperCenter`, `LowerCenter` | selected data source per panel (`default` = empty) |

## Configuring sites (`config.json`)

```json
{
  "title": "Data Browser",
  "organization": "Leipzig University",
  "imprintUrl": "https://www.uni-leipzig.de/impressum",
  "sites": {
    "LIM": {
      "longName": "Leipzig Institute for Meteorology (LIM)",
      "minDate": "2011-11-03",
      "maxDate": 0,
      "hasDisabled": false,
      "dataStrings": {
        "LIMHAT_TB": "'https://example.org/plots/'yy'/'mm'/'dd'/'yymmdd'_tb.png"
      },
      "cloudnetSiteName": "leipzig-lim"
    }
  }
}
```

- `title` / `organization` – the browser tab title is `title - organization` (`organization` optional).
- `imprintUrl` (optional) – adds an "Imprint" link next to the "GitHub" link at the left of the grey control bar.
- `longName` – label in the site dropdown.
- `minDate` / `maxDate` – selectable range; an absolute `"yyyy-mm-dd"` string or an integer day offset (`0` = today).
- `hasDisabled` – show a note that some instruments are only reachable from the university network (uses `getIp.php`).
- `dataStrings` – dropdown label → URL pattern. Patterns use the jQuery UI [`formatDate`](https://api.jqueryui.com/datepicker/#utility-formatDate) syntax: literal text in single quotes, `yy` = 4-digit year, `y` = 2-digit year, `mm` = month, `dd` = day. Example: `'https://host/'yy'/'mm'/'yymmdd'.png` → `https://host/2026/06/20260601.png`. Use `"disabled"` as the value for a greyed-out entry.
- `cloudnetSiteName` (optional) – Cloudnet site id; adds the Cloudnet products that have data for that site to the dropdowns.

## Features

- Missing plots show a message plus links to the previous and next available plot. For `dataStrings` sources this is found from the server's directory listings (the pattern's date-dependent directory), for Cloudnet via the Cloudnet API.
- Keyboard: `a` / `s` step the date by −1 / +1 day.
- Permalink dialog creates links for "yesterday", "today" or the current date.

## Files

| File | Purpose |
|---|---|
| `dataBrowser.js`, `dataBrowser.css` | all behaviour and styling |
| `dataBrowser{1,2,3,4,6}.html` | layouts for 1–6 panels |
| `config.json` / `config.example.json` | site configuration (local) / template |
| `getCloudnetData.php`, `getCloudnetProducts.php`, `getCloudnetSiteProducts.php` | Cloudnet API proxies (visualizations, product list, products per site) |
| `getDirectoryListing.php` | directory listing proxy for the "next/previous plot" links; only hosts that appear in `config.json` are allowed |
| `getIp.php` | exposes the client IP to the page |

## License

See `GPL-LICENSE.txt`.
