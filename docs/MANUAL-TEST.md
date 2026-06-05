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

## Redesigned UI (shared popup + options component)
> **Test gotcha:** a *loaded* Refont overrides inline fonts on `<all_urls>` pages, so any standalone preview/mockup page may look "stuck" on one font. The real popup/options run on `chrome-extension://` pages and are NOT affected. If something looks wrong, re-check with Refont disabled or in an incognito window.

- [ ] **Popup = full settings:** clicking the toolbar icon shows the whole settings UI (not just two buttons); white background, cobalt accent.
- [ ] **Live preview (the v0.1 bug):** dragging scale / weight / line-height / letter-spacing updates the top specimen (KR + EN + numerals) in real time — not just font-family.
- [ ] **Value chips on load:** open the popup after saving non-default values — the scale/min/lh/ls chips and weight show the *saved* values immediately (not "1.10×"/"700").
- [ ] **Font picker:** opens a searchable list; each row renders in its own font; Korean-named fonts show Korean (맑은 고딕/바탕/굴림…); typing an unlisted name offers "직접 사용"; search works in Korean (e.g. "나눔").
- [ ] **Code font section:** enabling "코드/고정폭에 별도 폰트" reveals the code picker + a code preview that re-renders in the chosen mono font.
- [ ] **Weight ticks + fine mode:** ticks highlight near the value; "미세조정 (variable)" switches the slider to 1-step; "원본" shows when weight is unset.
- [ ] **Variable axes:** entering e.g. `opsz 14, wdth 80` changes a known variable font (Inter/Recursive) on a real page after Save (note: include `wght` in the axes if weight also looks frozen).
- [ ] **이 사이트 제외:** the current host shows in the row; "+ 추가" appends it to the blocklist textarea.
- [ ] **보호 폰트:** the page-fonts-in-use list shows one font per row, classifies an icon font (e.g. Font Awesome) as `기능성` and a body font as `본문`; "+" adds it to the manual protect list (the section titles 이 사이트 제외 / 보호 폰트 render in readable Pretendard, not spread-out caps).
- [ ] **Readability:** 기능성/본문 tags are legible (not tiny grey); cobalt text passes contrast.
- [ ] **Save / Export / Import:** Save shows "✓ 저장됨" and the page updates; Export downloads JSON; Import re-applies and reloads.
- [ ] **Options tab parity:** `⤢` from the popup opens the full options tab with the identical UI; in options the current-site row reads "현재 사이트 없음" and the page-fonts list shows the popup hint; `⤢` is hidden there.
- [ ] **Off state:** toggling a site off dims the body but you can still adjust controls (not frozen); in the options tab, global-off still lets you edit defaults.

## Known limitations (v0.1)
- **Google Fonts / CSS-link web fonts under strict CSP:** the `@import` route is subject to the page's `style-src`/`font-src` CSP and may be blocked. For CSP-strict sites, use a direct font-file URL (`.woff2/.ttf/.otf`) — that path fetches in the background and injects a `data:` `@font-face`, which bypasses CSP.
- **Per-host selector exclusions (`manualExclusions`)** are not yet editable in the options UI; they can be set via settings Import for now. For protecting a font family that the auto-detector missed, use the "보호 폰트 추가" (protection denylist) field in options.
