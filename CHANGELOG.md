# Changelog

## v0.3.1 — 2026-07-18

### 🐛 Fixes
- **firefox:** raise strict_min_version to 142 for data_collection_permissions
- **i18n:** show family names (not Korean aliases) under an English UI
- **i18n:** close three localization gaps in settings UI

## v0.3.0 — 2026-07-18

### ✨ Features
- **ui:** localize settings UI (ko/en) with in-app language selector
- **settings:** add language field (auto/ko/en), default auto
- **i18n:** add ko/en string dictionary with resolveLocale + createT

### 🐛 Fixes
- **scope:** normalize and range-check the port in a rule
- **webfont:** strip CSS comments inside an unquoted url() argument too
- **scope:** default-port toggle keys + query/hash-safe authority split
- **webfont:** handle CR/FF hex terminators and comments around url()
- **scope:** match rules against the target's effective (default-filled) port
- **webfont:** decode CSS escapes in quoted url() too, not just unquoted
- **scope:** compare toggle rules canonically and keep sibling exceptions
- **webfont:** match @font-face with a comment or long gap before the brace
- **a11y:** keep a single aria-selected row when the choice is also in 최근
- **webfont:** parse url() with a CSS-aware scanner, not a regex
- **scope:** make the site toggle flip path/port-scoped pages correctly
- **settings:** persist both source families so the inactive one survives
- **page-fonts:** list currently-used fonts via a bounded live scan
- **a11y:** complete the font-picker combobox semantics
- **scope:** resolve block vs allow by specificity (longest match wins)
- **popup:** make the site toggle inert when Refont is globally off
- **webfont:** absolutize relative urls, stream-cap, comment-aware @font-face
- **popup:** tolerate a rejected site-toggle send (no unhandled rejection)
- **a11y:** make toggles, checkboxes, and the font picker keyboard-operable
- **popup:** reflect global-off state in the site toggle
- **page-fonts:** bound the page-font cache with LRU eviction
- **badge:** refresh the toolbar badge on save / site toggle / global switch
- **observer:** reclassify an element when its only text node is removed
- **popup:** request page fonts from the top frame only (frameId 0)
- **security:** inject only @font-face from a webfont CSS link, not @import
- **ui:** separate system and web font families
- **scope:** allowlist override so parent/path-blocked sites can be re-enabled
- **css:** remove the pre-restart USER sheet via a content-supplied prev
- **ui:** keep chosen language when resetting settings to defaults
- **ui:** hide language selector in popup and wire language option labels
- protect editing surfaces and harden USER-sheet lifecycle

### ⚡ Performance
- compile per-element protection and manual-exclusion matchers

### ♻️ Refactor
- **i18n:** freeze dictionary, match primary subtag, harden tests

### 📝 Docs
- add English README, privacy policy, and store listing
- implementation plan for ko/en i18n (UI + docs)
- design spec for Korean/English i18n (UI + docs)

## v0.2.5 — 2026-07-11

### 🐛 Fixes
- track parent SPA path in opaque (about:blank/srcdoc/blob) child frames
- catch Firefox forward pushState via href poll fallback
- harden settings, font fetch, blocklist, and SPA handling (code review)

## v0.2.4 — 2026-06-09

### 🐛 Fixes
- O(n^2) dedupeRoots froze huge pages for seconds

## v0.2.3 — 2026-06-07

### 🐛 Fixes
- migrate imported settings; width off-path; release runner detection

## v0.2.2 — 2026-06-07

### 🐛 Fixes
- **content:** tag elements whose text is added *after* insertion (Synology DSM/ExtJS, jQuery, some SPAs) — the observer ignored a text node added to an existing element
- **engine:** empty body font no longer forces generic sans-serif page-wide (real default + `migrate()` self-heal + popup never saves empty)
- **manifest:** reach `about:blank` / dynamically-created app iframes (`match_about_blank`, + `match_origin_as_fallback` on Chrome)

### ✨ Features
- Accessibility "읽기 좋게" preset (min-size / line-height / letter+word-spacing), font-agnostic incl. Korean
- Local Font Access picker (Chromium only; Firefox falls back to the heuristic list)
- `font-display: optional` reliability via `document.fonts.load()` warm-up

### ♻️ Refactor
- letter/word-spacing moved px → em (WCAG 1.4.12); schema 4 migration converts legacy px values
- Firefox `strict_min_version` 140 (clears benign AMO warnings)

## v0.2.1 — 2026-06-07

### ✨ Features
- Variable-font width dial (`font-stretch`) + optical-sizing toggle
- Registered variable axes routed to standard CSS properties; custom axes via `font-variation-settings`
- Web-font `font-display` option (swap | optional)

### ⚡ Performance
- Two-pass read-then-write DOM scan (no layout thrashing)

## v0.2.0 — 2026-06-07

### ✨ Features
- CSS-variable apply engine: per-element opt-in via data-attributes + `--refont-*` custom properties; O(1) live preview
- Synchronous author `<style>` + user-origin `!important` reinforcement to win the cascade
- Batched MutationObserver; background web-font fetch (cache + size cap + MIME check)

### 🐛 Fixes
- Reach iframes (e.g. Naver Cafe) and kill the flash of original font
- Build settings/picker DOM without `innerHTML` (AMO clean)
