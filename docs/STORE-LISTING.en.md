[한국어](STORE-LISTING.md) · **English**

# Refont — Store listing (English)

> Copy the text in this document directly into the Chrome Web Store / Firefox AMO
> listing forms.

---

## Common

- **Extension name:** Refont
- **Version:** 0.1.0
- **Default locale:** English
- **Homepage/support:** https://github.com/jisamcom/refont
- **Privacy policy URL:** (fill in once hosted)
- **Data collection:** None

---

## Chrome Web Store

### Summary (132 characters max)

```
Replaces a web page's body font with the font you choose. Automatically detects and protects "functional fonts" like icons, math, music notation, barcodes, and emoji, so nothing breaks.
```

### Category

- Primary: **Accessibility** — for improved readability
- Alternative: Tools / Functionality & UI

### Description

```
Refont replaces the body font on any web page with the font you choose.
It focuses on exactly one thing — viewing the web in a font that's easy to
read — while leaving fonts where "the font itself is a function" untouched,
so nothing breaks.

■ Automatic protection of functional fonts
Icon fonts (Font Awesome, Material Icons/Symbols, Bootstrap Icons, etc.),
math (KaTeX, MathJax, STIX), music notation (SMuFL, Bravura), barcodes,
dingbats (Wingdings), emoji, and even anti-scraping fonts that scramble
glyph mappings — all detected and protected automatically by combining
font name, Private Use Area (PUA) characters, and common icon-class hints.
Only the body text changes; icons and formulas stay exactly as they are.

■ Any font you want
· Choose from fonts installed on your computer (Korean fonts are shown by
  their Korean name)
· Web fonts are supported too — a Google Fonts CSS link, or a direct
  .woff2/.ttf/.otf URL (the direct-URL method is fetched in the background
  and injected as a data: font, so it works even on sites with strict CSP)
· A separate font can be set for code/monospace regions only

■ Fine-grained tuning
Adjust size scale, minimum font size, weight (with an option to preserve
heading boldness), line height, letter spacing, and even variable-font axes
(opsz, wdth, and more) yourself. Changes preview live on the current tab as
you edit, and one click on "Reset to defaults" puts everything back.

■ Per-site control
· Exclude specific sites (blocklist)
· Exclude specific elements only (CSS selectors) — e.g. keep the original
  font on price tables
· Toggle the current site on/off with the Alt+Shift+F shortcut
· See the list of fonts actually used on the page, sorted into
  "Functional/Body," and add them to the protection list in one click

■ Privacy-respecting
No account, no server, no tracking. Settings are stored on your device
only. The only network request is fetching the font from a URL you
entered yourself. See the privacy policy for details.

Works on Chrome and Firefox. Manifest V3.
```

### Single purpose description

```
Replaces the font of a web page's text with a font the user specifies,
while leaving fonts where the font itself is a function — icons, math,
barcodes, emoji — exactly as they are.
```

### Permission justifications

- **storage**
  ```
  Used to store settings on-device — the font and adjustments (size,
  letter spacing, etc.) the user chose, the excluded-sites list, and
  more. Stored data is never transmitted anywhere.
  ```
- **scripting**
  ```
  Used to inject CSS into the current page to change the font of the
  page's text.
  ```
- **tabs**
  ```
  Used to read the current tab's address (host) to handle the
  "exclude this site" feature and the toolbar badge.
  ```
- **host permission `<all_urls>`**
  ```
  Access to all sites is required to replace fonts on any site the user
  visits. Not used to read page content and send it anywhere — used only
  to inject CSS for font replacement.
  ```

### Privacy practices (Privacy practices tab)

- Data collection items: **check "Not collected" for all**
- Certify (check) the following 3 items:
  - User data is not sold or transferred to third parties outside the approved use case.
  - Not used or transferred for purposes unrelated to the single purpose.
  - Not used or transferred for creditworthiness or lending purposes.

---

## Firefox AMO (addons.mozilla.org)

### Summary (250 characters max)

```
Replaces a web page's body font with the font you choose. Automatically
detects and protects "functional fonts" like icons, math, music notation,
barcodes, and emoji, so nothing breaks. Supports both installed fonts and
web fonts (Google Fonts, direct URL), with size/weight/letter-spacing/
line-height/variable-axis controls and per-site exclusion. No tracking.
```

### Category

- Primary: **Appearance**
- Alternative: Web Development / Other

### Description

> Use the same body text as the Chrome description. (Copy the "Description" block above.)

### Tags

```
font, typography, readability, fonts, accessibility, webfont, korean
```

### License

- Source code license: **MIT** (see the repository's `LICENSE` file — can be changed if desired)

### Data collection consent (manifest)

- `browser_specific_settings.gecko.data_collection_permissions.required = ["none"]`
  → Already set in `public/manifest.firefox.json`. AMO will recognize this as "no data."

### Source code submission

- Because the Extension is bundled with esbuild, AMO policy **requires source code
  submission**.
- Upload the `dist/refont-source-0.1.0.zip` produced by `npm run package`.
- Build reproduction steps are included in `REVIEWERS.md` inside the source zip.

---

## Note: if you want a more descriptive name

The store display name follows the manifest's `name` field, currently `Refont`.
If you want something more search-friendly, change `name` in both manifests
(`public/manifest.chrome.json`, `public/manifest.firefox.json`) to something like
`"Refont — Web Font Replacer (Protects Functional Fonts)"` and rebuild/repackage.
(Keeping the short `Refont` is recommended for now.)
