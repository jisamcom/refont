<p align="right"><a href="README.md">한국어</a> · <b>English</b></p>

<div align="center">
  <img src="public/icons/icon-128.png" width="76" alt="Refont">
  <h1>Refont</h1>
  <p>A browser extension that replaces a web page's body font with the font you choose.<br>
  It leaves fonts where <b>the font itself is a function</b> — icons, math, barcodes, emoji — untouched.</p>
</div>

<p align="center">
  <img src="docs/store-assets/screenshot-1-hero.png" width="640" alt="Refont preview">
</p>

---

## What it does

Most font-replacement tools swap out **every** font on the page, so icons break into
boxes (□) and formulas fall apart. Refont changes **only the body font** and
automatically detects and protects functional fonts.

## Key features

- **Automatic protection of functional fonts** — icons (Font Awesome, Material Symbols, etc.),
  math (KaTeX, MathJax, STIX), music notation (SMuFL, Bravura), barcodes, dingbats (Wingdings),
  emoji, and even anti-scraping PUA fonts. Detection combines font name, Private Use Area (PUA)
  characters, and icon-class hints.
- **Any font you want** — installed fonts (Korean fonts shown by their Korean name) or web fonts.
  Web fonts can come from a Google Fonts CSS link, or a direct `.woff2/.ttf/.otf` URL (fetched in
  the background and injected as a `data:` font → works even on strict-CSP sites).
- **Separate code font** — a distinct font for code/monospace regions only.
- **Fine-grained tuning** — size scale, minimum font size, weight (with an option to preserve
  heading boldness), line height, letter spacing, and variable-font axes (`opsz`, `wdth`, etc.).
  Applied live to the current tab while you edit.
- **Per-site control** — exclude sites (blocklist), exclude specific elements (CSS selectors),
  and toggle the current site with the `Alt+Shift+F` shortcut.
- **Privacy-respecting** — no account, no server, no tracking. Settings are stored on-device only.
  [Privacy Policy](docs/PRIVACY.en.md)

Cross-browser (Chrome + Firefox), Manifest V3.

## Install

### From the stores (after release)

- Chrome Web Store: _coming soon_
- Firefox Add-ons (AMO): _coming soon_

### From source

```bash
npm ci
npm run build          # produces dist/chrome and dist/firefox
```

- **Chrome:** `chrome://extensions` → enable Developer mode → "Load unpacked" → select `dist/chrome`
- **Firefox:** `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `dist/firefox/manifest.json`

## Development

```bash
npm test               # vitest (jsdom)
npm run build          # build both targets
npm run package        # produce the 3 store zips (dist/)
npm run screenshots    # generate store screenshot PNGs (docs/store-assets/)
```

The build uses only dependency-free tooling (an esbuild bundle plus plain Node
packaging/icon/screenshot scripts).

## Documentation

- [Privacy Policy](docs/PRIVACY.en.md)
- [Store listing (English)](docs/STORE-LISTING.en.md)
- [Build guide for AMO reviewers](docs/REVIEWERS.md)

## License

[MIT](LICENSE)
