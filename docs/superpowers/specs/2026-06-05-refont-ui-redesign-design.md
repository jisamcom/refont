# Refont UI Redesign — Design Spec

**Date:** 2026-06-05
**Status:** Design approved (mockup), spec under review
**Supersedes UI portions of:** `2026-06-05-font-changer-extension-design.md`
**Visual source of truth:** `docs/mockups/refont-ui.html` (high-fidelity, self-contained)

---

## 1. Goal

Replace Refont's current plain popup + options pages with a single, polished **"Type Foundry console"** settings UI that is shared verbatim between the popup and the full-screen options tab. The redesign also fixes a live-preview bug and adds controls the engine already supports but the old UI never exposed well (sliders, variable axes, current-site exclude, page-fonts protection picker, a searchable font picker, and a separated code-font section).

This is a **UI/UX redesign only.** The replacement engine (user-origin CSS on `[data-fc]`/`[data-fc-code]`, functional-font protection, background web-font fetch) is unchanged except for two small additive features: variable-axis CSS and a page-fonts collector.

## 2. Motivation (from user testing of the shipped v0.1)

- The popup was just two buttons; all real settings lived in a separate full-screen tab. User wants **full settings in the popup itself**.
- **Live preview was broken** — it reflected only font-family, not size/weight/spacing.
- Plain number inputs are clumsy → wants **sliders**, with weight **breakpoints (100–900)** plus a **fine mode** for variable fonts.
- No way to use **variable-font axes** (opsz/wdth/slnt).
- Adding the current site to the blocklist required typing the host by hand.
- No way to see **which fonts a page actually uses** to protect one that broke.
- The font picker was a bare `<select>` of detected fonts + a separate text input; wants a **searchable picker that renders each option in its own font** and accepts direct input. Korean-named fonts should display their **Korean names**.
- Code font was an afterthought; wants it as **its own section** with the same picker + a code preview.
- Visual design was "밋밋" (flat). Adopted aesthetic: typography-as-hero, white background, **single cobalt accent**, mono numerals.

## 3. Scope

**In scope**
- A shared settings UI component rendered in both popup and options contexts.
- Live specimen preview reflecting all properties in real time.
- Sliders for scale / min-size / line-height / letter-spacing / weight (+ ticks, + fine mode).
- Manual variable-axis input applied via `font-variation-settings`.
- Searchable font picker (detected fonts + Korean display names + in-font option rendering + custom input), reused for body and code.
- Separated code-font section with code preview.
- Current-site row (live host + "+ 추가" to blocklist) + editable blocklist.
- Page-fonts-in-use list (per-row, classified functional/body) with one-click add to the manual protection list.
- Save / Export / Import / open-full-screen actions.
- Storage additions (`axes`, `weightFine`) + schema bump.
- Cobalt design tokens + WCAG-AA contrast, focus rings, keyboard operability.

**Out of scope (unchanged or deferred)**
- The protection denylist research, engine math, web-font fetch pipeline.
- Per-host CSS selector `manualExclusions` editing (still import-only).
- Live apply-to-page while dragging sliders (preview is local; page updates on **Save**).
- Per-font `fvar` axis parsing (cross-browser constraint — axes stay manual, as decided in brainstorming).

## 4. Visual design system

The mockup is the canonical reference. Key tokens (light theme):

| Token | Value | Use |
|---|---|---|
| `--bg` / `--bg-2` / `--bg-3` | `#ffffff` / `#f7f6f3` / `#f1efea` | surfaces |
| `--ink` / `--ink-dim` / `--ink-faint` | `#1b1916` / `#6a655c` / `#9c968b` | text tiers |
| `--accent` | `#2f55e0` | cobalt fill (toggle, slider, swatch) |
| `--accent-deep` | `#1e3fb5` | primary button, borders |
| `--accent-text` | `#2447c4` | cobalt **as text** on white (7.5:1, AA pass) |
| `--accent-glow` | `rgba(47,85,224,.20)` | focus ring, glow |
| `--accent-haze` | `rgba(47,85,224,.05)` | background tint |
| `--danger` / `--ok` | `#c8472f` / `#5a9a3e` | functional tag / body tag, saved state |
| `--ui` | Pretendard → system-ui | UI + Korean |
| `--mono` | IBM Plex Mono | numerals, labels |
| `--display` | Fraunces | wordmark only |
| `--r` | `13px` | frame radius |

Rules locked during the audit:
- **Cobalt as text only at `--accent-text`** (the brighter `--accent` fails AA as text).
- **Korean section titles use `--ui` (Pretendard), not mono-uppercase-letterspaced** (which mangles Hangul). English titles keep the mono caps treatment. Implement as `.sec-h .t` (English) vs `.sec-h .t.kr` (Korean).
- **Tags/badges** (`기능성`/`본문`) render in `--ui` at 11px/600 with darkened red/green for legibility — not 9px mono.
- Focus-visible cobalt ring on every interactive control; custom controls (toggle, checks, segmented, picker) get `tabindex`/`role`.
- Slider thumb 14px wide (grab target).

> The accent-color switcher in the mockup (`.accentbar`) is a **mockup-only** comparison tool and is **not** carried into the extension.

## 5. Information architecture

One component, two contexts:

```
mountSettingsUI(rootEl, ctx)
  ctx = { context: 'popup' | 'options', currentHost: string|null, tabId: number|null }
```

- **popup context** — opened from the toolbar; has an active tab. `currentHost`/`tabId` set. The top toggle controls **this site** (blocklist membership). The current-site row and page-fonts list are populated from the active tab. A `⤢` action opens the full options tab.
- **options context** — standalone full tab. No active page → `currentHost = null`. The top toggle controls the **global `enabled`** flag. The current-site row collapses to a disabled "현재 사이트 없음" state and the page-fonts list shows an empty-state hint ("팝업에서 페이지별로 확인"). `⤢` is hidden.

Layout (both contexts, identical markup; width differs by container):
- **Sticky top:** wordmark `Refont.` + version, power toggle, live **specimen** (KR / EN / numerals lines) + a mono **readout** of the active settings.
- **Scroll body, sections in order:** Typeface (source) · Size & rhythm · Weight · Code font · 이 사이트 제외 · 보호 폰트.
- **Sticky actions:** 저장 (primary) · 내보내기 · 가져오기 · ⤢ (popup only).

## 6. Components

### 6.1 Shared settings UI (`src/ui/settings-ui.js`)
Builds the DOM (markup currently inline in the mockup) into `rootEl`, wires every control to an in-memory `state`, and on **Save** sends `SAVE_SETTINGS`. Reads initial settings via `GET_SETTINGS`. Owns: section markup, slider wiring, toggle/check wiring, axes input, action bar, context-specific toggle/host/page-font behavior. Delegates the picker to `font-picker.js` and names to `font-names.js`.

`state` mirrors storage:
```
{ family, source, url, urlType, scale, minSize, lineHeight, letterSpacing,
  weight, weightFine, preserveBold, axes, codeEnabled, codeFamily,
  blocklist[], protectExtra[], enabled }
```
`readState()` → settings payload for save; `writeState(settings)` → populate controls.

### 6.2 Font picker (`src/ui/font-picker.js`)
`makeFontPicker(mountEl, { fonts, value, sample, onChange }) → { value, refresh }`.
- `fonts`: array of `{ f: cssFamily, ko?: koreanName }`.
- Closed button shows a sample swatch in the font + the display label (Korean if present, `' Variable'` stripped) + chevron.
- Panel: search input + scrollable list. Each option renders its **label and a `Aa가 012` sample in its own font**. Search matches family **and** Korean name. A trailing "직접 사용: '…'" custom row appears when the query matches nothing, marked with a `custom` badge.
- Reused for body (sans default sample `Aa가`) and code (mono, sample `{ }`).
- Closes on outside click; re-`refresh()`ed on `document.fonts.ready` so late web fonts repaint the closed button.

### 6.3 Live specimen preview
Pure-local preview (does not touch the page). `applyPreview()` sets, on the KR/EN/numeral lines: `font-family`, `font-weight`, `letter-spacing`, `line-height`, `font-size` (scaled, min-floored), and `font-variation-settings` from parsed axes. Updates on **every** control change — this is the bug fix (old UI updated only family). The mono readout lists family · scale× · weight (· min · lh · ls · axes) using the Korean label.

### 6.4 Sliders
Five range inputs (`scale` 0.5–2.5/.05, `minSize` 0–24/1, `lineHeight` 0–2.6/.05, `letterSpacing` −1–4/.1, `weight` 100–900). Each has a label + a mono value chip; `0`/off-states render "끔" dimmed. A `--p` CSS var fills the track to the thumb. Weight has tick marks (100/300/500/700/900) that highlight near the current value.

### 6.5 Weight fine mode + variable axes
- `미세조정 (variable)` check toggles weight step 100↔1 (continuous). Snapping back to nearest 100 when turned off. Persisted as `weightFine`.
- `볼드 위계 보존` check = `preserveBold` (existing engine behavior).
- A collapsible "추가 가변 축" holds a text input like `opsz 14, wdth 80, slnt -6`. Parsed to `{tag,val}` pairs; applied to the preview and to the page CSS (see 6.10). Invalid fragments are ignored. Stored as the raw string `axes`.

### 6.6 Code font section
Its own elevated section, gated by a `코드/고정폭에 별도 폰트 사용` check (`codeEnabled`). When on, reveals a code-font picker (mono candidates) + a small syntax-tinted code preview that re-renders in the chosen font. Maps to existing `codeFont = { source:'system', name, url:null, urlType:'css' }` (null when disabled).

### 6.7 이 사이트 제외 (blocklist)
- **popup:** a row showing the live current URL (scheme dim, host emphasized) + a `+ 추가` button that appends `currentHost` to the blocklist (de-duped, with a transient "✓ 추가됨" confirmation). The big power toggle remains the primary on/off; this row is for permanent exclusion.
- **options:** the row is disabled/explanatory (no current host).
- Below: an editable textarea blocklist (one entry per line), bound to `state.blocklist`.

### 6.8 보호 폰트 (protection)
- **Page fonts in use:** a one-per-row list (`pageFonts`), each row = font name rendered in that font + a tag (`기능성` if protected, `본문` otherwise) + a `+` button that appends the family to the manual protect list (row then shows an "added" state). Populated from the content script (6.9). Empty-state hint when none / not-a-popup.
- **수동 보호 목록:** a textarea (`protectExtra`, one family fragment per line) bound to `state.protectExtra` → saved as `protectionDenylistExtra`.

### 6.9 Page-fonts collection (content script)
New message `GET_PAGE_FONTS`. The popup sends it to the active tab via `tabs.sendMessage`; `content.js` replies with a deduped list of families actually used on the page, each classified:
```
collectPageFonts(doc, isProtectedFn) -> [{ name, protected }]
```
- Walk elements with direct text (reuse the existing scan traversal), read `getComputedStyle(el).fontFamily`, take the first family token, strip quotes (reuse `sanitizeFamilyName`), dedupe case-insensitively, **cap at 40** (log nothing; just stop — documented limit).
- `protected = isProtectedFamily(name, settings.protectionDenylistExtra)`.
- The pure list-building (token split, dedupe, classify, cap) is extracted as a testable helper; the DOM walk is the thin browser wrapper.

### 6.10 Engine: variable axes (`src/lib/engine.js`)
- Add pure `parseAxes(str) -> [{tag,val}]` (2–4 letter tag + number, comma-separated; invalid pairs dropped).
- `buildCss(settings)`: when `parseAxes(settings.axes)` is non-empty, append
  `[data-fc]{font-variation-settings:'opsz' 14,'wdth' 80 !important;}`.
  Only the **extra** axes are emitted; `wght` continues to come from the per-element inline `font-weight` (which drives the wght axis on variable fonts) unless the user explicitly types a `wght` pair. `computeElementInline` is unchanged.

### 6.11 Power toggle
- popup: ON ⇔ `currentHost` **not** in `blocklist`. Toggling sends `TOGGLE_SITE` (existing) and **applies immediately** (users expect instant per-site on/off), and reflects into `state.blocklist`. Label "이 사이트 켜짐/꺼짐".
- options: toggles global `enabled`, which is persisted **on Save** with the rest of the form (consistent with every other options-page control). Label "전체 켜짐/꺼짐".

## 7. Data flow

- **Load:** page → `GET_SETTINGS` → `writeState`. popup also: query active tab → `currentHost`/`tabId`; `tabs.sendMessage(tabId, GET_PAGE_FONTS)` → render list; `isBlocked(url, blocklist)` → toggle state.
- **Edit:** controls mutate `state` + `applyPreview()` (local only).
- **Save:** `SAVE_SETTINGS` with the full payload → background persists → `broadcastReapply()` → content scripts rebuild CSS/marks on all tabs. Toggle changes that use `TOGGLE_SITE` apply immediately (existing behavior) and also reflect into `state.blocklist`.
- **Export/Import:** unchanged `serializeSettings`/`parseSettings` (now include `axes`, `weightFine` automatically via `DEFAULTS` iteration).

## 8. Storage changes (`src/lib/storage.js`)

Add to `DEFAULTS`:
```
axes: '',          // raw variable-axis string, e.g. "opsz 14, wdth 80"
weightFine: false, // weight slider continuous (variable) vs 100-step
```
Bump `SCHEMA_VERSION` 1 → 2. No transform branch needed — `migrate()` already fills missing keys from `DEFAULTS`; the version bump is a marker.

## 9. Messaging changes (`src/lib/messaging.js`)
Add `GET_PAGE_FONTS: 'GET_PAGE_FONTS'`. Handled in `content.js` (it owns page DOM); popup is the caller.

## 10. Font names + detection
- `src/ui/font-names.js` — pure `FONT_KO_NAMES` map (`'Malgun Gothic'→'맑은 고딕'`, `Batang→바탕`, `Gulim→굴림`, `Dotum→돋움`, `Gungsuh→궁서`, `Nanum Gothic→나눔고딕`, `Nanum Myeongjo→나눔명조`, …) + `labelOf(family)` (strips `' Variable'`, returns Korean if known). Display-only; stored value is always the real CSS family.
- `src/lib/font-detect.js` — add a `MONO_CANDIDATES` subset (Consolas, Cascadia Code/Mono, Courier New, Lucida Console, D2Coding, JetBrains Mono, Fira Code, Source Code Pro) for the code picker; body picker uses the existing `FONT_CANDIDATES`. Pickers list `detectFonts(...)` results mapped through `FONT_KO_NAMES`, always allowing custom input.

## 11. File structure

**New**
- `src/ui/settings-ui.js` — shared UI builder + wiring (`mountSettingsUI`).
- `src/ui/font-picker.js` — `makeFontPicker`.
- `src/ui/font-names.js` — `FONT_KO_NAMES`, `labelOf`.
- `public/settings-ui.css` — shared styles (from the mockup `<style>`), cobalt tokens.

**Modified**
- `public/popup.html` — thin shell: links `settings-ui.css`, `<div id="root">`, `popup.js`. Wider popup (~384px).
- `public/options.html` — thin shell: same css + root + `options.js`.
- `src/popup.js` — resolve tab/host, `mountSettingsUI(root, {context:'popup',...})`, wire `⤢`.
- `src/options.js` — `mountSettingsUI(root, {context:'options', currentHost:null})`; keep export/import (moved into the shared action bar).
- `src/content.js` — `GET_PAGE_FONTS` handler + `collectPageFonts` wrapper; no change to apply flow (axes ride through `buildCss`).
- `src/lib/messaging.js` — add `GET_PAGE_FONTS`.
- `src/lib/engine.js` — `parseAxes` + axes in `buildCss`.
- `src/lib/storage.js` — `axes`, `weightFine`, `SCHEMA_VERSION=2`.
- `src/lib/font-detect.js` — `MONO_CANDIDATES`.

**Build:** ensure the esbuild step copies `public/settings-ui.css` into `dist/<browser>/` alongside the existing HTML. `settings-ui.js`/`font-picker.js`/`font-names.js` are bundled transitively via `popup.js`/`options.js` entry points.

## 12. States & edge cases
- **Off:** specimen desaturates and the body dims as a visual cue, but **controls stay operable** (refinement over the mockup's full `pointer-events:none`, so users can still adjust settings — especially global defaults in the options tab — while off). The primary Save stays enabled; other actions follow the mockup's dimming.
- **Empty page-fonts:** "이 페이지에서 감지된 폰트 없음" (popup) / "팝업에서 사이트별로 확인" (options).
- **No detected install fonts:** picker still works via custom input.
- **`file://` / restricted pages:** `tabs.sendMessage` may reject (no content script). Catch → empty page-fonts list, current-site row shows the URL but page-fonts hint says unavailable.
- **Web font file (.woff2) mode:** family name input is required and shown only in "폰트 파일" sub-mode (the segmented control bug from v0.1 is fixed in the mockup).
- **Save feedback:** primary button flips to "✓ 저장됨" (ok color) for ~1.2s.

## 13. Accessibility
- All text ≥ 4.5:1 (cobalt-as-text at 7.5:1; tags re-darkened; faint greys promoted to `--ink-dim` where they carried meaning).
- `:focus-visible` cobalt ring on toggle, checks, segmented, picker button, action buttons, `+` buttons.
- Custom controls carry `role` + `tabindex` (`switch`, `checkbox`, `tab`).
- `prefers-reduced-motion`: gate the load `rise`/`fp` animations (add a media query — small addition over the mockup).

## 14. Testing

**Unit (vitest, pure functions):**
- `parseAxes`: valid pairs, mixed valid/invalid, empty, clamping of tag length.
- `buildCss`: emits `font-variation-settings` only when axes present; omits `wght` unless typed; existing family/lineHeight/letterSpacing rules unaffected.
- `labelOf` / `FONT_KO_NAMES`: Korean mapping, `' Variable'` stripping, unknown passthrough.
- `collectPageFonts` helper: token split, quote strip, case-insensitive dedupe, 40-cap, classify via injected `isProtectedFn`.
- `storage.migrate`: v1 stored object gains `axes`/`weightFine` defaults; `SCHEMA_VERSION` set to 2.
- font-picker filter: family + Korean-name matching, custom-row appearance.

**Manual (extend `docs/MANUAL-TEST.md`):**
- Popup shows full settings; live preview updates for size/weight/spacing/axes.
- Picker renders options in-font, Korean names show, custom input works, body + code.
- Weight ticks + fine mode; variable axes change a known variable font (e.g. Inter/Recursive) on a real page after Save.
- "+ 추가" adds the current host; page-fonts list classifies an icon font (e.g. Font Awesome) as 기능성 and adding it protects it.
- Options tab renders the same UI; ⤢ from popup opens it.
- **Test with Refont disabled / in incognito** when viewing any standalone preview page — a loaded Refont overrides inline fonts on `<all_urls>` pages (it does **not** affect `chrome-extension://` popup/options).

## 15. Risks / notes
- Page-fonts collection cost on huge DOMs → mitigated by the 40-cap and reusing the text-element traversal; runs once on popup open, not continuously.
- `font-variation-settings` + `font-weight` interaction: emit extra axes only, leave `wght` to `font-weight`, to avoid freezing weight.
- Korean web-font previews in the picker depend on the user's installed fonts; the picker degrades to system fallback gracefully (the extension only ever lists canvas-detected installed fonts + custom input — no network needed).
