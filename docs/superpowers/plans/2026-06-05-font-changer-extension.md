# Font Changer Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-browser (Chrome + Firefox, MV3) extension that force-replaces page body fonts with a user-chosen font while never breaking functional fonts (icons, math, music, barcode, dingbat, anti-scraping, emoji).

**Architecture:** Hybrid engine. `font-family` is applied via a **user-origin** stylesheet (injected by the background via `scripting.insertCSS({origin:'USER'})`) that targets only elements the content-script's JS pass opted in by adding a `data-fc` / `data-fc-code` attribute. Per-element size/weight (relative to each element's own computed value) are set inline by the JS pass. Web fonts are fetched in the background and injected as base64 `data:` `@font-face` to bypass site CSP. Protection of functional fonts is decided per element by computed font-family denylist → PUA content → weak class hint.

**Tech Stack:** Vanilla JS (ES modules), `webextension-polyfill`, `esbuild` (bundling), `vitest` + `jsdom` (tests). No framework.

**Spec:** [docs/superpowers/specs/2026-06-05-font-changer-extension-design.md](../specs/2026-06-05-font-changer-extension-design.md)
**Research (denylist source of truth):** [docs/superpowers/specs/2026-06-05-functional-fonts-protection-research.md](../specs/2026-06-05-functional-fonts-protection-research.md)

---

## File Structure

```
package.json                 # deps + scripts (test, build, build:chrome, build:firefox)
vitest.config.js             # jsdom env
.gitignore                   # node_modules, dist
scripts/build.mjs            # esbuild bundle + copy html/icons/manifest → dist/<browser>/
public/
  manifest.chrome.json       # MV3 (service_worker)
  manifest.firefox.json      # MV3 (background.scripts + gecko id)
  options.html
  popup.html
  icons/icon-16.png icon-48.png icon-128.png   # placeholder PNGs
src/
  background.js              # message/command router; web-font fetch→dataURL; CSS inject; badge
  content.js                 # orchestration: scan DOM, mark data-fc, inline size/weight, observe
  options.js                 # options page logic (binds DEFAULTS schema, import/export)
  popup.js                   # popup: per-site toggle + quick font + open options
  lib/
    messaging.js             # MSG constant map (pure)
    url-match.js             # isBlocked(url, blocklist) (pure)
    storage.js               # DEFAULTS, SCHEMA_VERSION, migrate, getSettings, saveSettings
    font-protection.js       # denylist, PUA, class hint, shouldProtect (pure)
    engine.js                # fontStack, buildCss, computeElementInline (pure)
    font-detect.js           # FONT_CANDIDATES, detectFonts(pure), makeMeasurer(browser)
    dom-utils.js             # directText, isCodeElement, collectText (jsdom-testable)
tests/
  url-match.test.js  storage.test.js  font-protection.test.js
  engine.test.js  font-detect.test.js  background.test.js  dom-utils.test.js
docs/MANUAL-TEST.md          # load + manual test matrix
```

Each `lib/*` module has one responsibility and is independently testable. `src/*` entry files wire modules to browser APIs.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`, `scripts/build.mjs`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
*.log
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "font-changer",
  "version": "0.1.0",
  "description": "Replace page fonts everywhere except functional fonts (icons, math, barcode, ...).",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "node scripts/build.mjs chrome && node scripts/build.mjs firefox",
    "build:chrome": "node scripts/build.mjs chrome",
    "build:firefox": "node scripts/build.mjs firefox"
  },
  "dependencies": {
    "webextension-polyfill": "^0.12.0"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "jsdom": "^24.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Create `scripts/build.mjs`**

```js
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = process.argv[2] || 'chrome';
const outdir = join(root, 'dist', target);

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [
    join(root, 'src/background.js'),
    join(root, 'src/content.js'),
    join(root, 'src/options.js'),
    join(root, 'src/popup.js'),
  ],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox115'],
  outdir,
  logLevel: 'info',
});

// static assets
copyFileSync(join(root, 'public/options.html'), join(outdir, 'options.html'));
copyFileSync(join(root, 'public/popup.html'), join(outdir, 'popup.html'));
cpSync(join(root, 'public/icons'), join(outdir, 'icons'), { recursive: true });
copyFileSync(
  join(root, `public/manifest.${target}.json`),
  join(outdir, 'manifest.json'),
);

console.log(`Built ${target} → ${outdir}`);
```

- [ ] **Step 5: Install deps**

Run: `npm install`
Expected: `node_modules/` created, no errors. (If offline, the executing agent must have network; note this in the run.)

- [ ] **Step 6: Verify vitest runs (no tests yet)**

Run: `npm test`
Expected: vitest reports "No test files found" (exit 0) or runs 0 tests. This confirms the toolchain works.

- [ ] **Step 7: Commit**

```bash
git add package.json vitest.config.js .gitignore scripts/build.mjs
git commit -m "chore: scaffold font-changer project (esbuild + vitest)"
```

---

## Task 2: `lib/messaging.js` — message constants

**Files:**
- Create: `src/lib/messaging.js`

- [ ] **Step 1: Create the module**

```js
// Message type constants shared between background, content, options, popup.
export const MSG = {
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  FETCH_FONT: 'FETCH_FONT',
  APPLY_CSS: 'APPLY_CSS',
  REMOVE_CSS: 'REMOVE_CSS',
  TOGGLE_SITE: 'TOGGLE_SITE',
  REAPPLY: 'REAPPLY',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messaging.js
git commit -m "feat: add messaging constants"
```

---

## Task 3: `lib/url-match.js` — blocklist matching (pure, TDD)

**Files:**
- Create: `src/lib/url-match.js`
- Test: `tests/url-match.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/url-match.test.js
import { describe, it, expect } from 'vitest';
import { isBlocked } from '../src/lib/url-match.js';

describe('isBlocked', () => {
  it('returns false for empty blocklist', () => {
    expect(isBlocked('https://example.com/', [])).toBe(false);
  });
  it('matches a bare domain entry', () => {
    expect(isBlocked('https://mail.google.com/x', ['google.com'])).toBe(true);
  });
  it('matches a host+path entry', () => {
    expect(isBlocked('https://docs.google.com/spreadsheets/d/1', ['docs.google.com/spreadsheets'])).toBe(true);
  });
  it('does not match an unrelated path', () => {
    expect(isBlocked('https://docs.google.com/document/d/1', ['docs.google.com/spreadsheets'])).toBe(false);
  });
  it('is case-insensitive', () => {
    expect(isBlocked('https://Example.COM/', ['example.com'])).toBe(true);
  });
  it('returns false for an unparseable url', () => {
    expect(isBlocked('not a url', ['example.com'])).toBe(false);
  });
  it('ignores blank entries', () => {
    expect(isBlocked('https://example.com/', ['  ', ''])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/url-match.test.js`
Expected: FAIL — "Failed to resolve import '../src/lib/url-match.js'".

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/url-match.js
// Pure: decide if a URL is on the disable blocklist.
// An entry matches if it is a substring of the host, or of host+pathname.
export function isBlocked(url, blocklist) {
  if (!Array.isArray(blocklist) || blocklist.length === 0) return false;
  let host = '';
  let hostPath = '';
  try {
    const u = new URL(url);
    host = u.host.toLowerCase();
    hostPath = (u.host + u.pathname).toLowerCase();
  } catch {
    return false;
  }
  return blocklist.some((raw) => {
    const e = String(raw).trim().toLowerCase();
    if (!e) return false;
    return host.includes(e) || hostPath.includes(e);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/url-match.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/url-match.js tests/url-match.test.js
git commit -m "feat: add blocklist url matching"
```

---

## Task 4: `lib/storage.js` — settings schema + persistence (TDD with browser mock)

**Files:**
- Create: `src/lib/storage.js`
- Test: `tests/storage.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/storage.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock webextension-polyfill before importing the module under test.
const store = { data: {} };
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async () => ({ ...store.data })),
        set: vi.fn(async (obj) => { Object.assign(store.data, obj); }),
      },
    },
  },
}));

import { DEFAULTS, SCHEMA_VERSION, migrate, getSettings, saveSettings } from '../src/lib/storage.js';

beforeEach(() => { store.data = {}; });

describe('DEFAULTS', () => {
  it('is enabled by default with sane values', () => {
    expect(DEFAULTS.enabled).toBe(true);
    expect(DEFAULTS.scale).toBe(1);
    expect(DEFAULTS.preserveBold).toBe(true);
    expect(Array.isArray(DEFAULTS.blocklist)).toBe(true);
    expect(DEFAULTS.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('migrate', () => {
  it('fills missing keys from DEFAULTS', () => {
    const m = migrate({ enabled: false });
    expect(m.enabled).toBe(false);
    expect(m.scale).toBe(1);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('returns a full default object for empty input', () => {
    expect(migrate({})).toEqual(DEFAULTS);
    expect(migrate(undefined)).toEqual(DEFAULTS);
  });
});

describe('getSettings/saveSettings', () => {
  it('returns DEFAULTS when storage empty', async () => {
    expect(await getSettings()).toEqual(DEFAULTS);
  });
  it('persists a partial update merged over current', async () => {
    await saveSettings({ scale: 1.2 });
    const s = await getSettings();
    expect(s.scale).toBe(1.2);
    expect(s.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/storage.test.js`
Expected: FAIL — cannot resolve `../src/lib/storage.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/storage.js
import browser from 'webextension-polyfill';

export const SCHEMA_VERSION = 1;

export const DEFAULTS = {
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  bodyFont: { source: 'system', name: '', url: null, urlType: 'css' },
  codeFont: null, // null = leave code/monospace untouched
  scale: 1,
  minSize: 0,
  weight: 0,
  preserveBold: true,
  lineHeight: 0,
  letterSpacing: 0,
  blocklist: [],
  manualExclusions: {},
  protectionDenylistExtra: [],
};

// Merge stored settings over DEFAULTS (forward-compatible). Future schema
// bumps add `if (stored.schemaVersion < N) { ...transform... }` branches here.
export function migrate(stored) {
  const base = { ...DEFAULTS };
  if (stored && typeof stored === 'object') {
    for (const k of Object.keys(DEFAULTS)) {
      if (k in stored && stored[k] !== undefined) base[k] = stored[k];
    }
  }
  base.schemaVersion = SCHEMA_VERSION;
  return base;
}

export async function getSettings() {
  const stored = await browser.storage.local.get(null);
  return migrate(stored);
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial, schemaVersion: SCHEMA_VERSION };
  await browser.storage.local.set(next);
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/storage.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.js tests/storage.test.js
git commit -m "feat: add settings schema + storage with migration"
```

---

## Task 5: `lib/font-protection.js` — functional-font detection (pure, TDD)

This is the core quality module. Identifiers come verbatim from the research doc.

**Files:**
- Create: `src/lib/font-protection.js`
- Test: `tests/font-protection.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/font-protection.test.js
import { describe, it, expect } from 'vitest';
import {
  isProtectedFamily, isPuaText, hasIconClassHint, shouldProtect,
  FONT_FAMILY_DENYLIST,
} from '../src/lib/font-protection.js';

describe('isProtectedFamily', () => {
  it('matches icon fonts case-insensitively as substrings', () => {
    expect(isProtectedFamily('"Font Awesome 6 Free", sans-serif')).toBe(true);
    expect(isProtectedFamily('FontAwesome')).toBe(true);
    expect(isProtectedFamily('Material Icons')).toBe(true);
    expect(isProtectedFamily('codicon')).toBe(true);
  });
  it('matches math/music/barcode/dingbat/display families', () => {
    expect(isProtectedFamily('KaTeX_Main')).toBe(true);
    expect(isProtectedFamily('MJXTEX-I')).toBe(true);
    expect(isProtectedFamily('Bravura Text')).toBe(true);
    expect(isProtectedFamily('Libre Barcode 128 Text')).toBe(true);
    expect(isProtectedFamily('Wingdings')).toBe(true);
    expect(isProtectedFamily('DSEG7 Classic')).toBe(true);
    expect(isProtectedFamily('Adobe Blank')).toBe(true);
  });
  it('does not match ordinary text fonts', () => {
    expect(isProtectedFamily('Pretendard, sans-serif')).toBe(false);
    expect(isProtectedFamily('Arial')).toBe(false);
    expect(isProtectedFamily('"Noto Sans KR"')).toBe(false);
  });
  it('matches risky tokens only as a whole family token, not substring', () => {
    expect(isProtectedFamily('Symbol')).toBe(true);             // exact token
    expect(isProtectedFamily('"Symbol", sans-serif')).toBe(true);
    expect(isProtectedFamily('My Symbolic Font')).toBe(false);   // substring must NOT match
  });
  it('honors user-supplied extra denylist entries', () => {
    expect(isProtectedFamily('weird-custom-icons', ['weird-custom-icons'])).toBe(true);
  });
});

describe('isPuaText', () => {
  it('true when text is substantially Private Use Area', () => {
    expect(isPuaText('')).toBe(true);          // BMP PUA
    expect(isPuaText('')).toBe(true);                 // legacy symbol PUA
    expect(isPuaText('\u{1F3B5}'.normalize())).toBe(false); // emoji (not PUA)
  });
  it('true for musical symbols block', () => {
    expect(isPuaText('\u{1D11E}')).toBe(true); // U+1D11E G clef
  });
  it('false for normal text and empty', () => {
    expect(isPuaText('hello')).toBe(false);
    expect(isPuaText('   ')).toBe(false);
    expect(isPuaText('')).toBe(false);
  });
});

describe('hasIconClassHint', () => {
  it('matches common icon class tokens', () => {
    expect(hasIconClassHint('fa fa-home')).toBe(true);
    expect(hasIconClassHint('material-icons')).toBe(true);
    expect(hasIconClassHint('codicon codicon-add')).toBe(true);
  });
  it('does not match arbitrary classes', () => {
    expect(hasIconClassHint('header main-nav')).toBe(false);
    expect(hasIconClassHint('fabulous')).toBe(false); // word-boundary, not substring
  });
});

describe('shouldProtect', () => {
  it('protects when computed family is on denylist', () => {
    expect(shouldProtect({ fontFamily: 'Material Icons', className: '', text: 'home' })).toBe(true);
  });
  it('protects when pseudo-element family is an icon font', () => {
    expect(shouldProtect({ fontFamily: 'Arial', pseudoFontFamily: '"Font Awesome 6 Free"', className: '', text: '' })).toBe(true);
  });
  it('protects PUA content even with unknown family', () => {
    expect(shouldProtect({ fontFamily: 'SomeRandomHashFont', className: '', text: '' })).toBe(true);
  });
  it('protects class-hint + short text', () => {
    expect(shouldProtect({ fontFamily: 'Arial', className: 'fa fa-star', text: '' })).toBe(true);
  });
  it('does NOT protect class-hint with long real text', () => {
    expect(shouldProtect({ fontFamily: 'Arial', className: 'icon-wrapper', text: 'Add to favorites' })).toBe(false);
  });
  it('does NOT protect ordinary text', () => {
    expect(shouldProtect({ fontFamily: 'Pretendard', className: 'para', text: 'Hello world' })).toBe(false);
  });
});

describe('FONT_FAMILY_DENYLIST', () => {
  it('is a non-trivial lowercase list', () => {
    expect(FONT_FAMILY_DENYLIST.length).toBeGreaterThan(30);
    expect(FONT_FAMILY_DENYLIST.every((s) => s === s.toLowerCase())).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/font-protection.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/font-protection.js
// Decide whether an element renders a "functional" font that must NOT be replaced.
// Identifiers sourced from docs/superpowers/specs/2026-06-05-functional-fonts-protection-research.md

export const FONT_FAMILY_DENYLIST = [
  // Icon (HIGH)
  'font awesome', 'fontawesome', 'material icons', 'material symbols', 'codicon',
  'icomoon', 'katfont', 'pcgamer', 'etmodules', 'etbuilder', 'cloudapp',
  // Icon (MED)
  'ionicons', 'bootstrap-icons', 'glyphicons', 'glyphicon', 'octicons',
  'phosphor', 'tabler', 'dashicons', 'remixicon', 'typicons', 'boxicons',
  'weather icons', 'segoe fluent icons', 'segoe mdl2 assets', 'iconfont',
  // Math (HIGH) — prefixes matched via substring
  'katex_', 'mjxtex', 'mjxzero', 'mathjax_',
  // Math (MED)
  'stix two math', 'stix two text', 'stixgeneral', 'latin modern math', 'xits', 'asana math',
  // Music / SMuFL
  'bravura', 'petaluma', 'leland', 'gonville', 'gootville', 'emmentaler', 'sebastian', 'finale maestro',
  // Barcode
  'libre barcode', 'code128', 'code 128', 'code39', 'code 39', 'code 3 of 9', 'barcode', 'idautomation',
  // Dingbat / symbol
  'wingdings', 'webdings', 'marlett', 'zapf dingbats', 'dingbats',
  // Display / 7-seg
  'dseg', '7 segment', 'seven segment', '14 segment', 'nixie',
  // Anti-scraping (site-specific; prefer PUA heuristic)
  'stonefont',
  // Legacy / minority PUA
  'doulos', 'charis sil', 'andika', 'gentium',
  // Blank / sentinel
  'adobe blank', 'adobeblank',
];

// Generic tokens too dangerous to substring-match — only match as a whole family token.
export const FONT_FAMILY_DENYLIST_RISKY = ['symbol', 'maestro'];

// Weak secondary hint only. Never use alone (FA class prefixes were refuted as reliable).
export const ICON_CLASS_HINT_RE =
  /\b(fa|fas|far|fab|fal|fad|fa-solid|fa-regular|fa-brands|fa-light|fa-duotone|fa-thin|fa-sharp|material-icons|material-symbols(?:-outlined|-rounded|-sharp)?|glyphicon|codicon|octicon|mdi|zmdi|ri|bi|ti|ph|typcn|dashicons|wi|bx|oi|el|ai|iconfont)\b/i;

export const PUA_RANGES = [
  [0xe000, 0xf8ff],     // BMP PUA
  [0xf0000, 0xffffd],   // Supplementary PUA-A
  [0x100000, 0x10fffd], // Supplementary PUA-B
];
const MUSICAL_SYMBOLS = [0x1d100, 0x1d1ff];

function inProtectedCodepoint(cp) {
  if (cp >= MUSICAL_SYMBOLS[0] && cp <= MUSICAL_SYMBOLS[1]) return true;
  return PUA_RANGES.some(([a, b]) => cp >= a && cp <= b);
}

function splitFamilies(familyStr) {
  return String(familyStr)
    .toLowerCase()
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export function isProtectedFamily(familyStr, extra = []) {
  if (!familyStr) return false;
  const lower = String(familyStr).toLowerCase();
  const list = FONT_FAMILY_DENYLIST.concat((extra || []).map((s) => String(s).toLowerCase()));
  if (list.some((d) => d && lower.includes(d))) return true;
  const tokens = splitFamilies(familyStr);
  if (tokens.some((t) => FONT_FAMILY_DENYLIST_RISKY.includes(t))) return true;
  return false;
}

export function isPuaText(text) {
  if (!text) return false;
  const t = String(text).replace(/\s+/g, '');
  if (!t) return false;
  let pua = 0;
  let total = 0;
  for (const ch of t) {
    total += 1;
    if (inProtectedCodepoint(ch.codePointAt(0))) pua += 1;
  }
  return total > 0 && pua / total >= 0.5;
}

export function hasIconClassHint(className) {
  if (!className) return false;
  return ICON_CLASS_HINT_RE.test(String(className));
}

// info: { fontFamily, pseudoFontFamily?, className, text }
export function shouldProtect(info, extra = []) {
  const { fontFamily, pseudoFontFamily, className, text } = info || {};
  if (isProtectedFamily(fontFamily, extra)) return true;
  if (isProtectedFamily(pseudoFontFamily, extra)) return true;
  if (isPuaText(text)) return true;
  if (hasIconClassHint(className) && (!text || text.trim().length <= 3)) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/font-protection.test.js`
Expected: PASS. If the emoji assertion fails, confirm the test uses `\u{1F3B5}` (a real emoji codepoint, not PUA) — emoji must NOT be treated as PUA.

- [ ] **Step 5: Commit**

```bash
git add src/lib/font-protection.js tests/font-protection.test.js
git commit -m "feat: functional-font protection (denylist + PUA + class hint)"
```

---

## Task 6: `lib/engine.js` — CSS builder + per-element inline (pure, TDD)

**Files:**
- Create: `src/lib/engine.js`
- Test: `tests/engine.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/engine.test.js
import { describe, it, expect } from 'vitest';
import { fontStack, buildCss, computeElementInline } from '../src/lib/engine.js';

describe('fontStack', () => {
  it('puts the chosen font first, then emoji fonts, then generic', () => {
    const s = fontStack('Pretendard');
    expect(s.startsWith('"Pretendard"')).toBe(true);
    expect(s).toContain('Apple Color Emoji');
    expect(s).toContain('Segoe UI Emoji');
    expect(s.endsWith('sans-serif')).toBe(true);
  });
  it('uses the provided generic for code', () => {
    expect(fontStack('D2Coding', 'monospace').endsWith('monospace')).toBe(true);
  });
  it('strips dangerous characters from the name', () => {
    expect(fontStack('Evil";}body{x')).not.toContain(';');
    expect(fontStack('Evil";}body{x')).not.toContain('}');
  });
  it('falls back to emoji+generic when name empty', () => {
    expect(fontStack('')).toContain('Apple Color Emoji');
  });
});

describe('buildCss', () => {
  it('emits a [data-fc] body rule with !important', () => {
    const css = buildCss({ bodyFont: { name: 'Pretendard' } });
    expect(css).toMatch(/\[data-fc\]\s*\{[^}]*font-family:[^}]*!important/);
  });
  it('emits a [data-fc-code] rule only when codeFont set', () => {
    expect(buildCss({ bodyFont: { name: 'A' }, codeFont: null })).not.toContain('data-fc-code');
    expect(buildCss({ bodyFont: { name: 'A' }, codeFont: { name: 'D2Coding' } })).toContain('[data-fc-code]');
  });
  it('emits line-height / letter-spacing only when nonzero', () => {
    expect(buildCss({ bodyFont: { name: 'A' }, lineHeight: 0, letterSpacing: 0 })).not.toContain('line-height');
    const css = buildCss({ bodyFont: { name: 'A' }, lineHeight: 1.6, letterSpacing: 0.5 });
    expect(css).toContain('line-height:1.6');
    expect(css).toContain('letter-spacing:0.5px');
  });
});

describe('computeElementInline', () => {
  it('scales font-size by the multiplier', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { scale: 1.5 }).fontSize).toBe('24px');
  });
  it('applies the minimum-size floor', () => {
    expect(computeElementInline({ fontSize: 10, fontWeight: 400 }, { scale: 1, minSize: 14 }).fontSize).toBe('14px');
  });
  it('returns no fontSize when unchanged', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { scale: 1, minSize: 0 }).fontSize).toBeUndefined();
  });
  it('sets weight only on normal-weight elements when preserveBold', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { weight: 300, preserveBold: true }).fontWeight).toBe('300');
    expect(computeElementInline({ fontSize: 16, fontWeight: 700 }, { weight: 300, preserveBold: true }).fontWeight).toBeUndefined();
  });
  it('sets weight on all elements when preserveBold false', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 700 }, { weight: 300, preserveBold: false }).fontWeight).toBe('300');
  });
  it('never sets weight when weight is 0', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { weight: 0 }).fontWeight).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/engine.js
// Pure font-replacement math. No DOM/browser access.

const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

export function fontStack(name, generic = 'sans-serif') {
  const safe = String(name || '').replace(/["\\;{}<>]/g, '').trim();
  if (!safe) return `${EMOJI_FONTS}, ${generic}`;
  return `"${safe}", ${EMOJI_FONTS}, ${generic}`;
}

// Returns a user-origin stylesheet string. Targets only opted-in [data-fc]/[data-fc-code].
export function buildCss(settings) {
  const s = settings || {};
  const rules = [];
  const bodyName = s.bodyFont && s.bodyFont.name;
  rules.push(`[data-fc]{font-family:${fontStack(bodyName)} !important;}`);
  if (s.codeFont && s.codeFont.name) {
    rules.push(`[data-fc-code]{font-family:${fontStack(s.codeFont.name, 'monospace')} !important;}`);
  }
  if (s.lineHeight && s.lineHeight > 0) {
    rules.push(`[data-fc]{line-height:${s.lineHeight} !important;}`);
  }
  if (s.letterSpacing && s.letterSpacing !== 0) {
    rules.push(`[data-fc]{letter-spacing:${s.letterSpacing}px !important;}`);
  }
  return rules.join('\n');
}

// computed: { fontSize:number(px), fontWeight:number }
// Returns { fontSize?:string, fontWeight?:string } — only keys that should change.
export function computeElementInline(computed, settings) {
  const out = {};
  const s = settings || {};
  const scale = s.scale || 1;
  const minSize = s.minSize || 0;
  const weight = s.weight || 0;
  const preserveBold = s.preserveBold !== false;

  const base = computed && computed.fontSize;
  if (base && base > 0) {
    let target = base * scale;
    if (minSize > 0 && target < minSize) target = minSize;
    if (Math.abs(target - base) > 0.01) {
      out.fontSize = `${Math.round(target * 100) / 100}px`;
    }
  }
  if (weight > 0) {
    const cw = (computed && computed.fontWeight) || 400;
    if (!preserveBold || cw <= 400) out.fontWeight = String(weight);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine.js tests/engine.test.js
git commit -m "feat: engine css builder + per-element inline math"
```

---

## Task 7: `lib/font-detect.js` — installed-font detection (TDD pure core)

**Files:**
- Create: `src/lib/font-detect.js`
- Test: `tests/font-detect.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/font-detect.test.js
import { describe, it, expect } from 'vitest';
import { detectFonts, FONT_CANDIDATES } from '../src/lib/font-detect.js';

// Fake measurer: a font is "installed" if its name is in `installed`.
// Baselines (monospace/serif/sans-serif) return a fixed width; an installed
// candidate returns a different width for at least one baseline.
function fakeMeasure(installed) {
  const BASE = { monospace: 100, serif: 110, 'sans-serif': 120 };
  return (familyExpr) => {
    // familyExpr like: '"Candidate", monospace' OR a bare baseline 'monospace'
    const m = familyExpr.match(/^"([^"]+)",\s*(.+)$/);
    if (!m) return BASE[familyExpr]; // bare baseline
    const [, cand, base] = m;
    if (installed.includes(cand)) return BASE[base] + 7; // differs → installed
    return BASE[base]; // identical → falls back to baseline → not installed
  };
}

describe('detectFonts', () => {
  it('returns only installed candidates', () => {
    const out = detectFonts(['Pretendard', 'Ghost Font', 'D2Coding'], fakeMeasure(['Pretendard', 'D2Coding']));
    expect(out).toEqual(['Pretendard', 'D2Coding']);
  });
  it('returns empty when none installed', () => {
    expect(detectFonts(['A', 'B'], fakeMeasure([]))).toEqual([]);
  });
});

describe('FONT_CANDIDATES', () => {
  it('includes common Korean and Latin fonts', () => {
    expect(FONT_CANDIDATES).toContain('Malgun Gothic');
    expect(FONT_CANDIDATES).toContain('Arial');
    expect(FONT_CANDIDATES.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/font-detect.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/font-detect.js
// Detect locally-installed fonts via canvas text-width comparison (cross-browser,
// no permission). Works on Chrome + Firefox identically.

export const FONT_CANDIDATES = [
  // Korean (Windows/macOS common)
  'Malgun Gothic', '맑은 고딕', 'Gulim', '굴림', 'Batang', '바탕', 'Dotum', '돋움',
  'Nanum Gothic', '나눔고딕', 'Nanum Myeongjo', 'NanumSquare', 'Nanum Barun Gothic',
  'Pretendard', 'Pretendard Variable', 'Spoqa Han Sans Neo', 'Noto Sans KR', 'Noto Serif KR',
  'Apple SD Gothic Neo', 'AppleGothic', 'Apple SD 산돌고딕 Neo', 'Spoqa Han Sans',
  // Latin (common)
  'Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Georgia', 'Verdana',
  'Tahoma', 'Trebuchet MS', 'Calibri', 'Cambria', 'Segoe UI', 'Roboto', 'Open Sans',
  'Inter', 'Lato', 'Montserrat', 'Source Sans Pro', 'Courier New', 'Consolas',
  // Monospace
  'D2Coding', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Menlo', 'Monaco',
];

const BASELINES = ['monospace', 'serif', 'sans-serif'];
const TEST_STRING = 'mmmmmmmmmwwwwwww가나다라ABCabc0123';

// measure: (familyExpr:string) => number  (width of TEST_STRING in that family expr)
export function detectFonts(candidates, measure) {
  const baseWidths = BASELINES.map((b) => measure(b));
  const installed = [];
  for (const font of candidates) {
    const present = BASELINES.some((b, i) => measure(`"${font}", ${b}`) !== baseWidths[i]);
    if (present) installed.push(font);
  }
  return installed;
}

// Browser-only: build a real canvas-based measurer. Not unit-tested (jsdom canvas
// returns 0); covered by manual test.
export function makeMeasurer() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return (familyExpr) => {
    ctx.font = `72px ${familyExpr}`;
    return ctx.measureText(TEST_STRING).width;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/font-detect.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/font-detect.js tests/font-detect.test.js
git commit -m "feat: canvas-based installed font detection"
```

---

## Task 8: `lib/dom-utils.js` — DOM helpers (TDD in jsdom)

**Files:**
- Create: `src/lib/dom-utils.js`
- Test: `tests/dom-utils.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/dom-utils.test.js
import { describe, it, expect } from 'vitest';
import { directText, isCodeElement } from '../src/lib/dom-utils.js';

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild;
}

describe('directText', () => {
  it('returns only direct text, not descendant text', () => {
    const node = el('<p>Hello <span>world</span>!</p>');
    expect(directText(node).trim()).toBe('Hello !');
  });
  it('returns empty string for element with no direct text', () => {
    const node = el('<div><span>x</span></div>');
    expect(directText(node).trim()).toBe('');
  });
});

describe('isCodeElement', () => {
  it('true for code/pre/kbd/samp tags', () => {
    expect(isCodeElement(el('<code>x</code>'), 'Arial')).toBe(true);
    expect(isCodeElement(el('<pre>x</pre>'), 'Arial')).toBe(true);
  });
  it('true when computed family is monospace', () => {
    expect(isCodeElement(el('<span>x</span>'), 'Consolas, monospace')).toBe(true);
  });
  it('false for normal element + family', () => {
    expect(isCodeElement(el('<span>x</span>'), 'Arial')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dom-utils.test.js`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/dom-utils.js
// Small DOM helpers, isolated so they can be unit-tested in jsdom.

export function directText(el) {
  let s = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3 /* TEXT_NODE */) s += node.nodeValue;
  }
  return s;
}

const CODE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'TT']);

export function isCodeElement(el, computedFamily) {
  if (CODE_TAGS.has(el.tagName)) return true;
  return /monospace/i.test(computedFamily || '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dom-utils.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dom-utils.js tests/dom-utils.test.js
git commit -m "feat: dom helpers (directText, isCodeElement)"
```

---

## Task 9: `src/background.js` — font fetch + router (TDD pure parts)

**Files:**
- Create: `src/background.js`
- Test: `tests/background.test.js`

The testable pure pieces (`guessFontMime`, `arrayBufferToBase64`, `fetchFontAsDataUrl`) are exported; the browser wiring is added after.

- [ ] **Step 1: Write the failing test**

```js
// tests/background.test.js
import { describe, it, expect, vi } from 'vitest';

// webextension-polyfill throws at import outside an extension; mock it.
// (Hoisted by vitest; kept first for clarity.) The empty default makes the
// browser-wiring guard in background.js false, so only pure exports load.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { guessFontMime, arrayBufferToBase64, fetchFontAsDataUrl } from '../src/background.js';

describe('guessFontMime', () => {
  it('maps extensions to mime types', () => {
    expect(guessFontMime('https://x/a.woff2')).toBe('font/woff2');
    expect(guessFontMime('https://x/a.woff')).toBe('font/woff');
    expect(guessFontMime('https://x/a.ttf')).toBe('font/ttf');
    expect(guessFontMime('https://x/a.otf')).toBe('font/otf');
    expect(guessFontMime('https://x/a.xyz')).toBe('application/octet-stream');
  });
});

describe('arrayBufferToBase64', () => {
  it('round-trips simple bytes', () => {
    const buf = new Uint8Array([72, 105]).buffer; // "Hi"
    expect(arrayBufferToBase64(buf)).toBe('SGk=');
  });
});

describe('fetchFontAsDataUrl', () => {
  it('returns a data: URL on success', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    const url = await fetchFontAsDataUrl('https://x/a.woff2', fakeFetch);
    expect(url.startsWith('data:font/woff2;base64,')).toBe(true);
  });
  it('throws on http error', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404 });
    await expect(fetchFontAsDataUrl('https://x/a.woff2', fakeFetch)).rejects.toThrow(/404/);
  });
});
```

> Note: `src/background.js` guards its browser-wiring section behind `if (browser && browser.runtime && browser.runtime.onMessage)`, so under the empty mock the wiring no-ops and only the pure exports are exercised.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/background.test.js`
Expected: FAIL — cannot resolve `../src/background.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/background.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { getSettings, saveSettings } from './lib/storage.js';
import { isBlocked } from './lib/url-match.js';

export function guessFontMime(url) {
  const u = String(url).toLowerCase();
  if (u.endsWith('.woff2')) return 'font/woff2';
  if (u.endsWith('.woff')) return 'font/woff';
  if (u.endsWith('.ttf')) return 'font/ttf';
  if (u.endsWith('.otf')) return 'font/otf';
  return 'application/octet-stream';
}

export function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function fetchFontAsDataUrl(url, fetchFn = fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return `data:${guessFontMime(url)};base64,${arrayBufferToBase64(buf)}`;
}

// ---- Browser wiring (no-ops in unit tests where runtime is absent) ----
async function applyCssToTab(tabId, css) {
  if (!css) return;
  await browser.scripting.insertCSS({ target: { tabId }, css, origin: 'USER' });
}
async function removeCssFromTab(tabId, css) {
  try { await browser.scripting.removeCSS({ target: { tabId }, css, origin: 'USER' }); } catch {}
}

async function setBadge(tabId, enabled) {
  try {
    await browser.action.setBadgeText({ tabId, text: enabled ? '' : 'off' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#888' });
  } catch {}
}

async function toggleSite(url) {
  const settings = await getSettings();
  let host = '';
  try { host = new URL(url).host; } catch { return settings; }
  const list = settings.blocklist.slice();
  const idx = list.findIndex((e) => e === host);
  if (idx >= 0) list.splice(idx, 1); else list.push(host);
  return saveSettings({ blocklist: list });
}

async function broadcastReapply() {
  const tabs = await browser.tabs.query({});
  for (const t of tabs) {
    if (t.id != null) browser.tabs.sendMessage(t.id, { type: MSG.REAPPLY }).catch(() => {});
  }
}

if (browser && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((msg, sender) => {
    const tabId = sender && sender.tab && sender.tab.id;
    switch (msg && msg.type) {
      case MSG.GET_SETTINGS:
        return getSettings();
      case MSG.SAVE_SETTINGS:
        return saveSettings(msg.payload).then(async (s) => { await broadcastReapply(); return s; });
      case MSG.FETCH_FONT:
        return fetchFontAsDataUrl(msg.url);
      case MSG.APPLY_CSS:
        return applyCssToTab(tabId, msg.css);
      case MSG.REMOVE_CSS:
        return removeCssFromTab(tabId, msg.css);
      case MSG.TOGGLE_SITE:
        return toggleSite(msg.url || (sender.tab && sender.tab.url)).then(async (s) => { await broadcastReapply(); return s; });
      default:
        return undefined;
    }
  });

  if (browser.commands && browser.commands.onCommand) {
    browser.commands.onCommand.addListener(async (command) => {
      if (command !== 'toggle-site') return;
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) { await toggleSite(tab.url); await broadcastReapply(); }
    });
  }

  if (browser.tabs && browser.tabs.onUpdated) {
    browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
      if (info.status !== 'complete' || !tab.url) return;
      const s = await getSettings();
      setBadge(tabId, s.enabled && !isBlocked(tab.url, s.blocklist));
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/background.test.js`
Expected: PASS (the `if (browser && browser.runtime...)` guard is false under the mock, so wiring is skipped).

- [ ] **Step 5: Commit**

```bash
git add src/background.js tests/background.test.js
git commit -m "feat: background router + web-font fetch to data URL"
```

---

## Task 10: `src/content.js` — orchestration

No new pure logic (all extracted to tested libs); this wires them to the live DOM. Verified via manual test in Task 14.

**Files:**
- Create: `src/content.js`

- [ ] **Step 1: Write the content script**

```js
// src/content.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';
import { buildCss, computeElementInline } from './lib/engine.js';
import { shouldProtect } from './lib/font-protection.js';
import { directText, isCodeElement } from './lib/dom-utils.js';

let settings = null;
let observer = null;
let appliedCss = '';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE']);

function pseudoFamily(el, which) {
  try { return getComputedStyle(el, which).fontFamily; } catch { return ''; }
}

function processElement(el) {
  if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return;
  const text = directText(el);
  if (!text || !text.trim()) return; // only opt-in elements that hold real text

  const cs = getComputedStyle(el);
  const fontFamily = cs.fontFamily;
  const className = el.getAttribute('class') || '';
  const info = {
    fontFamily,
    pseudoFontFamily: `${pseudoFamily(el, '::before')} ${pseudoFamily(el, '::after')}`,
    className,
    text,
  };
  const extra = settings.protectionDenylistExtra || [];
  if (shouldProtect(info, extra) || matchesManualExclusion(el)) return;

  if (settings.codeFont && isCodeElement(el, fontFamily)) {
    el.setAttribute('data-fc-code', '');
  } else {
    el.setAttribute('data-fc', '');
  }

  const inline = computeElementInline(
    { fontSize: parseFloat(cs.fontSize) || 0, fontWeight: parseInt(cs.fontWeight, 10) || 400 },
    settings,
  );
  if (inline.fontSize) el.style.setProperty('font-size', inline.fontSize, 'important');
  if (inline.fontWeight) el.style.setProperty('font-weight', inline.fontWeight, 'important');
}

function matchesManualExclusion(el) {
  const map = settings.manualExclusions || {};
  const host = location.host;
  const list = map[host] || [];
  for (const sel of list) {
    try { if (sel && el.matches(sel)) return true; } catch {}
  }
  return false;
}

function scan(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode.nodeType === 1 ? walker.currentNode : walker.nextNode();
  while (node) {
    processElement(node);
    node = walker.nextNode();
  }
}

function startObserver() {
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) { processElement(n); scan(n); }
      }
      if (m.type === 'characterData' && m.target.parentElement) {
        processElement(m.target.parentElement);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
  });
}

async function injectWebFont() {
  const bf = settings.bodyFont;
  if (!bf || bf.source !== 'weburl' || !bf.url) return;
  const styleId = '__fontchanger_webfont';
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  if (bf.urlType === 'css') {
    style.textContent = `@import url("${bf.url}");`;
  } else {
    try {
      const dataUrl = await browser.runtime.sendMessage({ type: MSG.FETCH_FONT, url: bf.url });
      style.textContent = `@font-face{font-family:"${bf.name}";src:url(${dataUrl});font-display:swap;}`;
    } catch { return; }
  }
  (document.head || document.documentElement).appendChild(style);
}

function clearMarks() {
  for (const el of document.querySelectorAll('[data-fc],[data-fc-code]')) {
    el.removeAttribute('data-fc');
    el.removeAttribute('data-fc-code');
    el.style.removeProperty('font-size');
    el.style.removeProperty('font-weight');
  }
}

async function apply() {
  settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  const active = settings.enabled && !isBlocked(location.href, settings.blocklist);

  if (observer) { observer.disconnect(); observer = null; }
  clearMarks();
  if (appliedCss) { await browser.runtime.sendMessage({ type: MSG.REMOVE_CSS, css: appliedCss }); appliedCss = ''; }

  if (!active) return;

  appliedCss = buildCss(settings);
  await browser.runtime.sendMessage({ type: MSG.APPLY_CSS, css: appliedCss });
  await injectWebFont();
  scan(document.documentElement);
  startObserver();
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === MSG.REAPPLY) apply();
});

apply();
```

- [ ] **Step 2: Sanity build**

Run: `npm run build:chrome`
Expected: `dist/chrome/content.js` produced, no esbuild errors. (Functional verification is the manual test in Task 14.)

- [ ] **Step 3: Commit**

```bash
git add src/content.js
git commit -m "feat: content script orchestration (scan/mark/observe)"
```

---

## Task 11: Options page

**Files:**
- Create: `public/options.html`, `src/options.js`
- Test: `tests/options-io.test.js` (settings serialize/parse only)

- [ ] **Step 1: Write the failing test (import/export round-trip)**

```js
// tests/options-io.test.js
import { describe, it, expect } from 'vitest';
import { serializeSettings, parseSettings } from '../src/options.js';
import { DEFAULTS } from '../src/lib/storage.js';

// options.js imports webextension-polyfill — mock it so the import resolves.
import { vi } from 'vitest';
vi.mock('webextension-polyfill', () => ({ default: { runtime: {} } }));

describe('settings import/export', () => {
  it('serializes to JSON and parses back', () => {
    const json = serializeSettings({ ...DEFAULTS, scale: 1.3 });
    const parsed = parseSettings(json);
    expect(parsed.scale).toBe(1.3);
    expect(parsed.enabled).toBe(true);
  });
  it('rejects invalid JSON', () => {
    expect(() => parseSettings('{not json')).toThrow();
  });
  it('drops unknown keys (keeps only schema keys)', () => {
    const parsed = parseSettings(JSON.stringify({ scale: 2, hackedKey: 1 }));
    expect(parsed.scale).toBe(2);
    expect('hackedKey' in parsed).toBe(false);
  });
});
```

> Place the `vi.mock(...)` call ABOVE the `import { serializeSettings, ... }` line (vitest hoists `vi.mock`, but keep it visually first for clarity).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/options-io.test.js`
Expected: FAIL — cannot resolve `../src/options.js`.

- [ ] **Step 3: Create `public/options.html`**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>Font Changer 설정</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 24px auto; padding: 0 16px; }
    fieldset { margin-bottom: 16px; border: 1px solid #ddd; border-radius: 8px; }
    legend { font-weight: 600; }
    label { display: block; margin: 8px 0 4px; }
    input[type="text"], input[type="url"], textarea, select { width: 100%; box-sizing: border-box; padding: 6px; }
    .row { display: flex; gap: 12px; }
    .row > div { flex: 1; }
    #preview { font-size: 22px; padding: 12px; border: 1px dashed #ccc; border-radius: 8px; margin-top: 8px; }
    button { padding: 8px 14px; margin-right: 8px; }
    .muted { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Font Changer</h1>

  <fieldset>
    <legend>본문 폰트</legend>
    <label><input type="checkbox" id="enabled" /> 확장 켜기</label>
    <label>폰트 소스</label>
    <select id="bodySource"><option value="system">시스템 설치 폰트</option><option value="weburl">웹폰트 URL</option></select>
    <div id="systemFontWrap">
      <label>설치된 폰트 (감지됨)</label>
      <select id="detectedFonts"></select>
      <label>직접 입력</label>
      <input type="text" id="bodyName" placeholder="예: Pretendard" />
    </div>
    <div id="webFontWrap" hidden>
      <label>URL 종류</label>
      <select id="bodyUrlType"><option value="css">CSS/구글폰트 링크</option><option value="file">폰트 파일(.woff2/.ttf/.otf)</option></select>
      <label>URL</label>
      <input type="url" id="bodyUrl" placeholder="https://..." />
      <label>패밀리명 (파일 URL일 때 필수)</label>
      <input type="text" id="bodyWebName" placeholder="예: Pretendard" />
    </div>
    <div id="preview">다람쥐 헌 쳇바퀴에 타고파 The quick brown fox 0123456789</div>
  </fieldset>

  <fieldset>
    <legend>코드 폰트 (선택)</legend>
    <label><input type="checkbox" id="codeEnabled" /> 코드/고정폭에 별도 폰트 사용</label>
    <input type="text" id="codeName" placeholder="예: D2Coding" />
  </fieldset>

  <fieldset>
    <legend>크기 · 두께 · 간격</legend>
    <div class="row">
      <div><label>배율(scale)</label><input type="number" id="scale" min="0.5" max="3" step="0.05" /></div>
      <div><label>최소 크기(px, 0=끔)</label><input type="number" id="minSize" min="0" max="40" step="1" /></div>
    </div>
    <div class="row">
      <div><label>두께(0=원본)</label><input type="number" id="weight" min="0" max="900" step="100" /></div>
      <div><label><input type="checkbox" id="preserveBold" /> 볼드 위계 보존</label></div>
    </div>
    <div class="row">
      <div><label>줄간격(0=끔)</label><input type="number" id="lineHeight" min="0" max="3" step="0.1" /></div>
      <div><label>자간 px(0=끔)</label><input type="number" id="letterSpacing" min="-2" max="5" step="0.1" /></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>사이트 제외 (블록리스트) · 한 줄에 하나</legend>
    <textarea id="blocklist" rows="4" placeholder="docs.google.com/spreadsheets"></textarea>
  </fieldset>

  <fieldset>
    <legend>보호 폰트 추가 (한 줄에 하나, family명 일부)</legend>
    <textarea id="protectionExtra" rows="3" placeholder="예: my-custom-icons"></textarea>
    <p class="muted">자동 감지가 놓친 아이콘/기능성 폰트가 깨질 때 여기에 추가하세요.</p>
  </fieldset>

  <div>
    <button id="save">저장</button>
    <button id="export">설정 내보내기</button>
    <button id="import">설정 가져오기</button>
    <input type="file" id="importFile" accept="application/json" hidden />
    <span id="status" class="muted"></span>
  </div>

  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `src/options.js`**

```js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { DEFAULTS } from './lib/storage.js';
import { detectFonts, FONT_CANDIDATES, makeMeasurer } from './lib/font-detect.js';

// ---- pure helpers (unit-tested) ----
export function serializeSettings(settings) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = settings[k];
  return JSON.stringify(out, null, 2);
}
export function parseSettings(json) {
  const obj = JSON.parse(json); // throws on invalid
  const out = {};
  for (const k of Object.keys(DEFAULTS)) if (k in obj) out[k] = obj[k];
  return { ...DEFAULTS, ...out };
}

// ---- DOM wiring (runs only in the options page) ----
function $(id) { return document.getElementById(id); }

function readForm() {
  const bodySource = $('bodySource').value;
  const bodyName = bodySource === 'system'
    ? ($('bodyName').value || $('detectedFonts').value)
    : $('bodyWebName').value;
  return {
    enabled: $('enabled').checked,
    bodyFont: {
      source: bodySource,
      name: bodyName,
      url: bodySource === 'weburl' ? $('bodyUrl').value : null,
      urlType: $('bodyUrlType').value,
    },
    codeFont: $('codeEnabled').checked ? { source: 'system', name: $('codeName').value, url: null, urlType: 'css' } : null,
    scale: parseFloat($('scale').value) || 1,
    minSize: parseInt($('minSize').value, 10) || 0,
    weight: parseInt($('weight').value, 10) || 0,
    preserveBold: $('preserveBold').checked,
    lineHeight: parseFloat($('lineHeight').value) || 0,
    letterSpacing: parseFloat($('letterSpacing').value) || 0,
    blocklist: $('blocklist').value.split('\n').map((s) => s.trim()).filter(Boolean),
    protectionDenylistExtra: $('protectionExtra').value.split('\n').map((s) => s.trim()).filter(Boolean),
  };
}

function writeForm(s) {
  $('enabled').checked = s.enabled;
  $('bodySource').value = s.bodyFont.source;
  $('bodyName').value = s.bodyFont.source === 'system' ? s.bodyFont.name : '';
  $('bodyWebName').value = s.bodyFont.source === 'weburl' ? s.bodyFont.name : '';
  $('bodyUrl').value = s.bodyFont.url || '';
  $('bodyUrlType').value = s.bodyFont.urlType || 'css';
  $('codeEnabled').checked = !!s.codeFont;
  $('codeName').value = s.codeFont ? s.codeFont.name : '';
  $('scale').value = s.scale;
  $('minSize').value = s.minSize;
  $('weight').value = s.weight;
  $('preserveBold').checked = s.preserveBold;
  $('lineHeight').value = s.lineHeight;
  $('letterSpacing').value = s.letterSpacing;
  $('blocklist').value = (s.blocklist || []).join('\n');
  $('protectionExtra').value = (s.protectionDenylistExtra || []).join('\n');
  toggleSourceUI();
  updatePreview();
}

function toggleSourceUI() {
  const sys = $('bodySource').value === 'system';
  $('systemFontWrap').hidden = !sys;
  $('webFontWrap').hidden = sys;
}

function updatePreview() {
  const name = $('bodySource').value === 'system'
    ? ($('bodyName').value || $('detectedFonts').value)
    : $('bodyWebName').value;
  $('preview').style.fontFamily = name ? `"${name}", sans-serif` : 'sans-serif';
}

function populateDetected() {
  try {
    const installed = detectFonts(FONT_CANDIDATES, makeMeasurer());
    const sel = $('detectedFonts');
    sel.innerHTML = '';
    for (const f of installed) {
      const o = document.createElement('option');
      o.value = f; o.textContent = f;
      sel.appendChild(o);
    }
  } catch {}
}

async function init() {
  const s = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  populateDetected();
  writeForm(s);

  $('bodySource').addEventListener('change', () => { toggleSourceUI(); updatePreview(); });
  ['bodyName', 'bodyWebName', 'detectedFonts'].forEach((id) =>
    $(id).addEventListener('input', updatePreview));

  $('save').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, payload: readForm() });
    $('status').textContent = '저장됨';
    setTimeout(() => ($('status').textContent = ''), 1500);
  });

  $('export').addEventListener('click', async () => {
    const cur = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
    const blob = new Blob([serializeSettings(cur)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'font-changer-settings.json';
    a.click();
  });

  $('import').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = parseSettings(await file.text());
      await browser.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, payload: parsed });
      writeForm(parsed);
      $('status').textContent = '가져옴';
    } catch {
      $('status').textContent = '잘못된 파일';
    }
  });
}

if (typeof document !== 'undefined' && document.getElementById('save')) {
  init();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/options-io.test.js`
Expected: PASS (the `if (... document.getElementById('save'))` guard is false in jsdom without the options DOM, so `init()` does not run).

- [ ] **Step 6: Commit**

```bash
git add public/options.html src/options.js tests/options-io.test.js
git commit -m "feat: options page with detection, preview, import/export"
```

---

## Task 12: Popup page

**Files:**
- Create: `public/popup.html`, `src/popup.js`

- [ ] **Step 1: Create `public/popup.html`**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: system-ui, sans-serif; width: 240px; padding: 12px; }
    button { display: block; width: 100%; padding: 8px; margin-top: 8px; }
    .host { font-size: 12px; color: #666; word-break: break-all; }
  </style>
</head>
<body>
  <div class="host" id="host"></div>
  <button id="toggleSite">이 사이트에서 토글</button>
  <button id="openOptions">설정 열기</button>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/popup.js`**

```js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  const host = (() => { try { return new URL(tab.url).host; } catch { return ''; } })();
  const blocked = isBlocked(tab.url, settings.blocklist);
  document.getElementById('host').textContent = `${host} — ${blocked ? '꺼짐' : '켜짐'}`;

  document.getElementById('toggleSite').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ type: MSG.TOGGLE_SITE, url: tab.url });
    window.close();
  });
  document.getElementById('openOptions').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
}

if (typeof document !== 'undefined' && document.getElementById('toggleSite')) {
  init();
}
```

- [ ] **Step 3: Build sanity**

Run: `npm run build:chrome`
Expected: `dist/chrome/popup.js` produced without errors.

- [ ] **Step 4: Commit**

```bash
git add public/popup.html src/popup.js
git commit -m "feat: popup with per-site toggle"
```

---

## Task 13: Manifests + icons

**Files:**
- Create: `public/manifest.chrome.json`, `public/manifest.firefox.json`, `public/icons/icon-16.png`, `public/icons/icon-48.png`, `public/icons/icon-128.png`

- [ ] **Step 1: Create `public/manifest.chrome.json`**

```json
{
  "manifest_version": 3,
  "name": "Font Changer",
  "version": "0.1.0",
  "description": "Replace page fonts everywhere except functional fonts (icons, math, barcode, ...).",
  "permissions": ["storage", "scripting", "activeTab", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_start", "all_frames": true }
  ],
  "action": { "default_popup": "popup.html", "default_title": "Font Changer" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "commands": {
    "toggle-site": {
      "suggested_key": { "default": "Alt+Shift+F" },
      "description": "Toggle font replacement on the current site"
    }
  },
  "icons": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

- [ ] **Step 2: Create `public/manifest.firefox.json`**

```json
{
  "manifest_version": 3,
  "name": "Font Changer",
  "version": "0.1.0",
  "description": "Replace page fonts everywhere except functional fonts (icons, math, barcode, ...).",
  "permissions": ["storage", "scripting", "activeTab", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "scripts": ["background.js"] },
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_start", "all_frames": true }
  ],
  "action": { "default_popup": "popup.html", "default_title": "Font Changer" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "commands": {
    "toggle-site": {
      "suggested_key": { "default": "Alt+Shift+F" },
      "description": "Toggle font replacement on the current site"
    }
  },
  "icons": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" },
  "browser_specific_settings": { "gecko": { "id": "font-changer@jisam", "strict_min_version": "115.0" } }
}
```

- [ ] **Step 3: Create placeholder icons**

Run (generates three solid-color PNG placeholders; replace with real art later):
```bash
node -e "const fs=require('fs');const png=(s)=>{const z=require('zlib');function chunk(t,d){const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const tc=Buffer.concat([Buffer.from(t),d]);const crc=Buffer.alloc(4);let c=~0;for(const b of tc){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}crc.writeUInt32BE((~c)>>>0);return Buffer.concat([len,tc,crc]);}const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(s,0);ihdr.writeUInt32BE(s,4);ihdr[8]=8;ihdr[9]=2;const row=Buffer.concat([Buffer.from([0]),Buffer.from(Array.from({length:s},()=>[60,120,200]).flat())]);const raw=Buffer.concat(Array.from({length:s},()=>row));const idat=z.deflateSync(raw);return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);};fs.mkdirSync('public/icons',{recursive:true});for(const s of [16,48,128])fs.writeFileSync(`public/icons/icon-${s}.png`,png(s));console.log('icons written');"
```
Expected: `icons written`, three PNG files exist.

- [ ] **Step 4: Full build**

Run: `npm run build`
Expected: `dist/chrome/` and `dist/firefox/` each contain `manifest.json`, `background.js`, `content.js`, `options.js`, `options.html`, `popup.js`, `popup.html`, `icons/`.

- [ ] **Step 5: Commit**

```bash
git add public/manifest.chrome.json public/manifest.firefox.json public/icons
git commit -m "feat: cross-browser manifests + placeholder icons"
```

---

## Task 14: Full test run + manual test checklist

**Files:**
- Create: `docs/MANUAL-TEST.md`

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: ALL suites PASS (url-match, storage, font-protection, engine, font-detect, dom-utils, background, options-io). If any fail, fix before proceeding.

- [ ] **Step 2: Create `docs/MANUAL-TEST.md`**

```markdown
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
```

- [ ] **Step 3: Perform the manual checklist**

Load the extension in Chrome and Firefox and walk the checklist. Record any failures as follow-up issues. (Automated tests cover logic; this confirms real-browser behavior.)

- [ ] **Step 4: Commit**

```bash
git add docs/MANUAL-TEST.md
git commit -m "docs: manual test checklist"
```

---

## Self-Review

Run after the plan is written (done by the plan author, not a subagent):

1. **Spec coverage:** every spec section maps to a task —
   - §2 architecture/modules → Tasks 2–13 (one module each). §3 font sources → Task 7 (system) + Tasks 9/10 (web font fetch + UI). §4 protection → Task 5 + Task 10 content wiring. §5 text rules → Task 6 (engine) + Task 10 (content). §6 site control → Task 3 + Tasks 9/12. §7 extras → Task 11 (import/export, preview) + Task 12 (toggle) + manifest commands (Task 13). §8 schema → Task 4. §9 engine → Tasks 6, 9, 10. §10 error handling → Task 9 (fetch fallback) + content try/catch. §11 testing → every TDD task + Task 14.
2. **Placeholders:** none — every code step contains full code; the icon step generates real PNG bytes.
3. **Type/name consistency:** `MSG.*` constants (Task 2) are used identically in background/content/options/popup. `DEFAULTS` keys (Task 4) match `readForm`/`writeForm`/`parseSettings` (Tasks 10/11) and `buildCss`/`computeElementInline` settings fields (Task 6). `data-fc`/`data-fc-code` attributes (Task 10) match the `buildCss` selectors (Task 6). `shouldProtect` signature (Task 5) matches its call in `processElement` (Task 10).
```
