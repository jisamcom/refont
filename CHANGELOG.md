# Changelog

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
