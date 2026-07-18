# Refont — UI + docs internationalization (Korean / English)

Date: 2026-07-18
Status: Approved (design)

## Goal

Add English alongside the current Korean for the extension's settings UI and for
the user-facing documents (README, privacy policy, store listing). The settings
window gets a language control; the effective UI language auto-detects the
browser language on first use and can be manually overridden.

## Decisions (locked)

- **Languages:** Korean + English only.
- **Selection:** auto-detect from `navigator.language`, with a manual override in
  the settings window. Setting value is one of `'auto' | 'ko' | 'en'`, default
  `'auto'`. `'auto'` resolves to `ko` when the browser language starts with `ko`,
  else `en`.
- **UI mechanism:** custom in-app string dictionary (NOT native `_locales`),
  because the requirement is a runtime, in-UI language switch — which native
  `chrome.i18n` (locked to the browser UI locale) cannot do.
- **Markup strings:** `data-i18n` attributes on the static `MARKUP`, filled by a
  one-pass DOM walk after mount (approach "A"). Dynamic runtime strings use a
  `t()` call.
- **Runtime switch:** changing the language persists the setting and reloads the
  page (`location.reload()`) so everything re-renders in the new language. A
  language switch is rare; reload is simpler and more robust than partial
  re-render with listener/state re-binding.
- **Docs:** keep Korean as the default file, add an English sibling. Scope =
  README, PRIVACY, STORE-LISTING.

## Out of scope (explicit)

- Manifest `name` / `description` and the command description — already English;
  localizing them would require native `_locales` and adds no value now.
- Content-script strings — none are user-facing (it injects fonts/CSS only).
- `docs/REVIEWERS.md` (already English) and `CHANGELOG.md`.
- Additional languages (JA/ZH) — not now.

## Architecture

### 1. i18n core — `src/lib/i18n.js` (new, pure, unit-tested)

```
export const LOCALES = ['ko', 'en'];
export const messages = { ko: { <key>: '<문자열>' }, en: { <key>: '<string>' } };

export function resolveLocale(setting, navLang = navigator.language) {
  if (setting === 'ko' || setting === 'en') return setting;   // manual override
  return String(navLang || '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function createT(locale) {
  const dict = messages[locale] || messages.ko;
  return (key, vars) => {
    let s = (dict[key] != null ? dict[key] : (messages.ko[key] != null ? messages.ko[key] : key));
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  };
}
```

- Fallback chain: requested locale → `ko` → the key itself (so a missing key is
  visible, never blank).
- Interpolation: `{name}` placeholders for dynamic strings
  (e.g. `'✓ {n}개 추가됨'` / `'✓ {n} added'`).
- All strings for both languages live in this one file.

### 2. Settings / storage — `src/lib/storage.js`

- `DEFAULTS.language = 'auto'`.
- `normalizeSettings`: clamp `language` to `'auto' | 'ko' | 'en'`; anything else
  → `'auto'`.
- No effect on the content script — `language` is a UI-only field.

### 3. UI — `src/ui/settings-ui.js` (+ `src/options.js`, `src/popup.js`)

- Static `MARKUP` text becomes `<... data-i18n="key">`; translatable attributes
  use `data-i18n-placeholder="key"` / `data-i18n-title="key"` (and aria-label
  where present). Markup stays static and readable.
- After the markup is parsed/mounted, `applyI18n(root, t)` walks the tree once:
  `[data-i18n]` → `textContent`; `[data-i18n-placeholder]` → `placeholder`;
  `[data-i18n-title]` → `title`; etc.
- Dynamic strings assigned in the mount logic (`끔`, `원본`, `기능성`, `본문`,
  `권한 거부됨`, `현재 사이트 없음`, `✓ 추가됨`, `✓ {n}개 추가됨`, `저장됨`,
  `추가`, and the rest of the `textContent =` sites) are replaced with `t(...)`.
- `t` is created at mount time from `resolveLocale(settings.language)` →
  `createT(locale)`, and threaded through the mount logic.
- **Language selector:** a `자동 / 한국어 / English` `<select>`. Shown on the
  **options page only** (`ctx.context === 'options'`); the popup inherits the
  chosen language but does not show the switcher (keeps the compact popup clean).
  On change → persist `settings.language`, then `location.reload()`.
- **Not translated:** the font specimen lines (`다람쥐 헌 쳇바퀴에 타고파`, the
  EN pangram, the numerals row) are font-rendering samples, intentionally shown
  regardless of UI language. The version string stays as-is.
- Any remaining hardcoded user-facing strings in `options.js` / `popup.js` are
  routed through `t()` as well.

### 4. Docs localization

| Korean (default, kept) | English (new) |
|---|---|
| `README.md` | `README.en.md` |
| `docs/PRIVACY.md` | `docs/PRIVACY.en.md` |
| `docs/STORE-LISTING.md` | `docs/STORE-LISTING.en.md` |

- Each file gets a language-switch line at the top (`한국어 · English` with the
  other file linked).
- Store privacy-policy URL keeps the Korean file as canonical; the English file
  is supplementary (no functional dependency).
- `docs/STORE-LISTING.md` keeps its `(한국어)` title; the English file mirrors it.

### 5. Testing

- `tests/i18n.test.js` (new):
  - `resolveLocale`: `'ko'`/`'en'` pass through; `'auto'` (and unknown) →
    `ko`/`en` by `navLang` (`'ko-KR'`, `'ko'`, `'en-US'`, `''`, `undefined`).
  - `createT`: key lookup per locale; fallback locale→ko→key; `{n}`
    interpolation.
  - **Key parity:** every key in `messages.ko` exists in `messages.en` and vice
    versa (catches missing/typo'd translations).
- `tests/settings-ui.test.js` (update): the 26 existing tests that assert Korean
  text are updated to assert via the dictionary/keys (mount with a known locale).
  Add a test that changing the language `<select>` persists `settings.language`
  and calls `location.reload()` (reload mocked).
- `bun run test` stays green; `bun run build` succeeds.

## Risks / notes

- The `settings-ui.test.js` update is the largest single edit; keep it mechanical
  (assert `t('key')` output rather than literal Korean).
- Reload-on-switch briefly blanks the options tab — acceptable for a rare action.
- Key naming: use short dotted keys grouped by area (`toggle.on`, `src.system`,
  `metric.off`, `site.none`, …) to keep the dictionary navigable.
```
