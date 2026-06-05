# Manual Test Checklist

## Load (Chrome)
1. `npm run build:chrome`
2. chrome://extensions → Developer mode ON → "Load unpacked" → select `dist/chrome`
3. Open options, set body font to an installed font (e.g. Pretendard), Save.

## Load (Firefox)
1. `npm run build:firefox`
2. about:debugging#/runtime/this-firefox → "Load Temporary Add-on" → select `dist/firefox/manifest.json`

## Functional-font protection matrix (the icon must NOT break)
- [ ] Font Awesome demo page — icons intact, body text changed
- [ ] Material Icons/Symbols page — ligature icons intact
- [ ] VS Code codicon / Glyphicons page — intact
- [ ] PUA icon app (e.g. Claude sidebar) — sidebar icons intact
- [ ] KaTeX page — equations intact
- [ ] MathJax page (mjx-container) — equations intact
- [ ] SMuFL/Bravura music page — notation intact
- [ ] Libre Barcode page — barcode still scannable shape
- [ ] Wingdings/Webdings page — symbols intact
- [ ] Anti-scraping PUA-number site — numbers still correct
- [ ] Emoji-heavy page — color emoji preserved after replacement

## Behavior
- [ ] Body text uses chosen font on a normal site (news article)
- [ ] Code blocks use the code font when set (GitHub / MDN)
- [ ] scale (1.2) enlarges text proportionally; minSize floors tiny text
- [ ] weight + preserveBold: body lightens but headings stay bold
- [ ] line-height / letter-spacing apply when set
- [ ] Blocklist: add docs.google.com/spreadsheets → Sheets unaffected
- [ ] Popup toggle disables/enables current site instantly
- [ ] Keyboard shortcut Alt+Shift+F toggles current site
- [ ] Web font by Google Fonts CSS link works
- [ ] Web font by direct .woff2 URL works on a CSP-strict site (data URL path)
- [ ] Options export → import round-trips settings
- [ ] SPA (e.g. YouTube/Twitter) — new content gets the font as you scroll
