# Build instructions for AMO reviewers

This add-on (**Refont**) is bundled with **esbuild**, so the submitted package
contains generated (bundled) files. Per Mozilla policy, the full source is
provided. The code is **bundled but not minified or obfuscated** — the output
is readable.

## Environment

- **Node.js** ≥ 22.12 (or ≥ 20.19 on the 20.x line) — the build toolchain (Vite 8,
  pulled in by Vitest) requires it; also declared in `package.json` `engines.node`.
  Developed and verified with v26.
- **npm** (ships with Node.js)
- No other system tools are required. All build dependencies are installed from
  npm via the committed `package-lock.json`.

## Reproduce the build

From the root of this source package:

```bash
npm ci                 # install exact dependencies from package-lock.json
npm run build:firefox  # produces dist/firefox/
```

The contents of `dist/firefox/` are **byte-for-byte** the files in the submitted
add-on package (`refont-firefox-<version>.zip`). The `manifest.json` sits at the
root of that directory.

(Optionally, `npm run build` builds both the Chrome and Firefox targets, and
`npm run package` regenerates all three zips, including this source zip.)

## Run the tests (optional)

```bash
npm test               # vitest, jsdom environment
```

## What the build does

`scripts/build.mjs` runs esbuild on four entry points and copies static assets:

| Source entry            | Output file        | Role                                  |
| ----------------------- | ------------------ | ------------------------------------- |
| `src/background.js`     | `background.js`    | background script (event page)        |
| `src/content.js`        | `content.js`       | content script (applies font CSS)     |
| `src/popup.js`          | `popup.js`         | toolbar popup (full settings UI)      |
| `src/options.js`        | `options.js`       | options page (same settings UI)       |

esbuild options used: `bundle: true`, `format: 'iife'`, `target: ['chrome110',
'firefox115']`. **No minification.** The only third-party runtime dependency is
[`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill),
which is bundled into each output file.

Static assets copied verbatim into `dist/firefox/`:
`public/popup.html`, `public/options.html`, `public/settings-ui.css`,
`public/icons/*`, and `public/manifest.firefox.json` → `manifest.json`.

## Privacy / data

The add-on collects no data. Settings are stored in `storage.local` only. The
only outbound network request is fetching a font file from a URL **the user
explicitly enters** (e.g. Google Fonts), sent directly to that provider; there
is no developer server, analytics, or telemetry. See `docs/PRIVACY.md`.
