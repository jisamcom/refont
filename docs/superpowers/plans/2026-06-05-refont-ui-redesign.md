# Refont UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Refont's plain popup + options pages with one shared, polished "Type Foundry console" settings UI (cobalt accent), fixing the live-preview bug and exposing sliders, variable axes, a searchable in-font picker with Korean names, current-site exclude, a page-fonts protection picker, and a separated code-font section.

**Architecture:** A single component `mountSettingsUI(root, ctx)` (in `src/ui/settings-ui.js`) builds the whole UI and is mounted by both `popup.js` (context `popup`, has active tab) and `options.js` (context `options`, no current site). It reads settings via the existing `GET_SETTINGS` message and saves via `SAVE_SETTINGS`; the engine/background/protection pipeline is unchanged except for additive variable-axis CSS (`engine.buildCss`) and a `GET_PAGE_FONTS` message handled by `content.js`. Shared styles live in `public/settings-ui.css`. The approved visual/markup source of truth is `docs/mockups/refont-ui.html`.

**Tech Stack:** MV3 cross-browser (Chrome/Firefox), webextension-polyfill, esbuild (IIFE bundle), vitest + jsdom. Tests live in `tests/<module>.test.js` importing from `../src/...`. Run all: `npx vitest run`. Build: `npm run build`.

---

## File Structure

**New**
- `src/lib/page-fonts.js` — pure: `firstFamilyToken`, `dedupeClassify` (page-fonts list building).
- `src/lib/settings-io.js` — pure: `serializeSettings`, `parseSettings` (export/import; extracted to avoid a `settings-ui ↔ options` cycle).
- `src/ui/font-names.js` — pure: `FONT_KO_NAMES`, `labelOf`, `toOptions` (Korean display names).
- `src/ui/font-picker.js` — `makeFontPicker` component + pure `filterFonts`.
- `src/ui/settings-ui.js` — `mountSettingsUI(root, ctx)` + pure `settingsToState`/`stateToSettings`/`previewSize`.
- `public/settings-ui.css` — shared styles (ported from the mockup `<style>`, cobalt tokens).
- Test files mirroring each new pure module.

**Modified**
- `src/lib/storage.js` — `axes`, `weightFine` defaults; `SCHEMA_VERSION = 2`.
- `src/lib/engine.js` — `parseAxes` + `font-variation-settings` in `buildCss`.
- `src/lib/messaging.js` — `GET_PAGE_FONTS`.
- `src/lib/font-detect.js` — `MONO_CANDIDATES`.
- `src/content.js` — `collectPageFonts` + `GET_PAGE_FONTS` handler.
- `public/popup.html`, `public/options.html` — thin shells (link CSS, `#root`, script).
- `src/popup.js` — resolve tab/host, mount UI (popup ctx), wire `⤢`.
- `src/options.js` — mount UI (options ctx); keep `serializeSettings`/`parseSettings`.
- `scripts/build.mjs` — copy `public/settings-ui.css`.

---

## Task 1: Storage — `axes`, `weightFine`, schema v2

**Files:**
- Modify: `src/lib/storage.js`
- Test: `tests/storage.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/storage.test.js` inside the existing file (after the `migrate` describe):

```js
describe('redesign fields', () => {
  it('defaults axes and weightFine, schema is 2', () => {
    expect(DEFAULTS.axes).toBe('');
    expect(DEFAULTS.weightFine).toBe(false);
    expect(SCHEMA_VERSION).toBe(2);
  });
  it('migrate fills axes/weightFine for a v1 object and bumps version', () => {
    const m = migrate({ schemaVersion: 1, scale: 1.2 });
    expect(m.axes).toBe('');
    expect(m.weightFine).toBe(false);
    expect(m.schemaVersion).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/storage.test.js`. Expected: FAIL (`DEFAULTS.axes` undefined, `SCHEMA_VERSION` is 1).

- [ ] **Step 3: Implement** — in `src/lib/storage.js` set `export const SCHEMA_VERSION = 2;` and add two keys to `DEFAULTS` (after `letterSpacing: 0,`):

```js
  letterSpacing: 0,
  axes: '',          // raw variable-axis string, e.g. "opsz 14, wdth 80"
  weightFine: false, // weight slider continuous (variable) vs 100-step
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/storage.test.js`. Expected: PASS (all, including existing `migrate({})` equality — DEFAULTS now includes the new keys so equality still holds).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.js tests/storage.test.js
git commit -m "feat(storage): add axes + weightFine, bump schema to v2"
```

---

## Task 2: Engine — variable-axis CSS

**Files:**
- Modify: `src/lib/engine.js`
- Test: `tests/engine.test.js`

- [ ] **Step 1: Write the failing tests** — append to `tests/engine.test.js`, and add `parseAxes` to the import on line 3 (`import { sanitizeFamilyName, fontStack, buildCss, computeElementInline, parseAxes } from '../src/lib/engine.js';`):

```js
describe('parseAxes', () => {
  it('parses comma-separated tag/value pairs', () => {
    expect(parseAxes('opsz 14, wdth 80')).toEqual([
      { tag: 'opsz', val: '14' }, { tag: 'wdth', val: '80' },
    ]);
  });
  it('keeps negative and decimal values', () => {
    expect(parseAxes('slnt -6, GRAD 0.5')).toEqual([
      { tag: 'slnt', val: '-6' }, { tag: 'GRAD', val: '0.5' },
    ]);
  });
  it('drops malformed fragments and handles empty', () => {
    expect(parseAxes('opsz, wdth 80, , junk')).toEqual([{ tag: 'wdth', val: '80' }]);
    expect(parseAxes('')).toEqual([]);
    expect(parseAxes(undefined)).toEqual([]);
  });
});

describe('buildCss font-variation-settings', () => {
  it('omits the rule when no axes', () => {
    expect(buildCss({ bodyFont: { name: 'A' }, axes: '' })).not.toContain('font-variation-settings');
  });
  it('emits parsed axes with !important when present', () => {
    const css = buildCss({ bodyFont: { name: 'A' }, axes: 'opsz 14, wdth 80' });
    expect(css).toMatch(/\[data-fc\]\{font-variation-settings:'opsz' 14,'wdth' 80 !important;\}/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/engine.test.js`. Expected: FAIL (`parseAxes` is not exported).

- [ ] **Step 3: Implement** — in `src/lib/engine.js` add the exported function (above `buildCss`):

```js
// Parse "opsz 14, wdth 80, slnt -6" -> [{tag:'opsz', val:'14'}, ...]. Drops malformed pairs.
export function parseAxes(str) {
  return String(str || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^([A-Za-z]{2,4})\s+(-?\d+(?:\.\d+)?)$/);
      return m ? { tag: m[1], val: m[2] } : null;
    })
    .filter(Boolean);
}
```

  Then in `buildCss`, immediately before `return rules.join('\n');`:

```js
  const axes = parseAxes(s.axes);
  if (axes.length) {
    const decl = axes.map((a) => `'${a.tag}' ${a.val}`).join(',');
    rules.push(`[data-fc]{font-variation-settings:${decl} !important;}`);
  }
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/engine.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine.js tests/engine.test.js
git commit -m "feat(engine): emit font-variation-settings for manual variable axes"
```

---

## Task 3: Font names module (Korean display names)

**Files:**
- Create: `src/ui/font-names.js`
- Test: `tests/font-names.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/font-names.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { FONT_KO_NAMES, labelOf, toOptions } from '../src/ui/font-names.js';

describe('labelOf', () => {
  it('returns the Korean name for a known family', () => {
    expect(labelOf('Malgun Gothic')).toBe('맑은 고딕');
    expect(labelOf('Nanum Myeongjo')).toBe('나눔명조');
  });
  it('strips " Variable" and passes unknown names through', () => {
    expect(labelOf('Pretendard Variable')).toBe('Pretendard');
    expect(labelOf('Georgia')).toBe('Georgia');
  });
  it('handles null/undefined', () => {
    expect(labelOf(null)).toBe('');
  });
});

describe('toOptions', () => {
  it('maps families to {f} / {f,ko} option objects', () => {
    expect(toOptions(['Georgia', 'Batang'])).toEqual([
      { f: 'Georgia' }, { f: 'Batang', ko: '바탕' },
    ]);
  });
  it('FONT_KO_NAMES is a non-empty map', () => {
    expect(Object.keys(FONT_KO_NAMES).length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/font-names.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/ui/font-names.js`:

```js
// src/ui/font-names.js
// Display-only Korean names for known font families. The stored/applied value is
// always the real CSS family; this only changes what the picker shows.
export const FONT_KO_NAMES = {
  'Malgun Gothic': '맑은 고딕',
  'Batang': '바탕',
  'Gulim': '굴림',
  'Dotum': '돋움',
  'Gungsuh': '궁서',
  'Gungsuhche': '궁서체',
  'Nanum Gothic': '나눔고딕',
  'Nanum Myeongjo': '나눔명조',
  'Nanum Barun Gothic': '나눔바른고딕',
  'NanumSquare': '나눔스퀘어',
  'Nanum Pen Script': '나눔손글씨 펜',
  'Spoqa Han Sans Neo': '스포카 한 산스 네오',
  'Noto Sans KR': '노토 산스 KR',
  'Noto Serif KR': '노토 세리프 KR',
  'Apple SD Gothic Neo': '애플 SD 산돌고딕 Neo',
  'Gowun Dodum': '고운돋움',
};

// Display label: Korean name if known, else family; always strip " Variable".
export function labelOf(family) {
  const f = String(family || '');
  return (FONT_KO_NAMES[f] || f).replace(' Variable', '');
}

// Map a family-name array to picker option objects ({f} or {f, ko}).
export function toOptions(families) {
  return (families || []).map((f) => (FONT_KO_NAMES[f] ? { f, ko: FONT_KO_NAMES[f] } : { f }));
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/font-names.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/font-names.js tests/font-names.test.js
git commit -m "feat(ui): Korean font display names (font-names module)"
```

---

## Task 4: Font detect — `MONO_CANDIDATES`

**Files:**
- Modify: `src/lib/font-detect.js`
- Test: `tests/font-detect.test.js`

- [ ] **Step 1: Write the failing test** — append to `tests/font-detect.test.js`, adding `MONO_CANDIDATES` to its import from `../src/lib/font-detect.js`:

```js
describe('MONO_CANDIDATES', () => {
  it('is a non-empty list of monospace family names', () => {
    expect(Array.isArray(MONO_CANDIDATES)).toBe(true);
    expect(MONO_CANDIDATES).toContain('Consolas');
    expect(MONO_CANDIDATES).toContain('D2Coding');
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/font-detect.test.js`. Expected: FAIL (`MONO_CANDIDATES` undefined).

- [ ] **Step 3: Implement** — in `src/lib/font-detect.js` add (after `FONT_CANDIDATES`):

```js
export const MONO_CANDIDATES = [
  'D2Coding', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Cascadia Mono',
  'Source Code Pro', 'IBM Plex Mono', 'Consolas', 'Courier New', 'Lucida Console',
  'SF Mono', 'Menlo', 'Monaco',
];
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/font-detect.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/font-detect.js tests/font-detect.test.js
git commit -m "feat(font-detect): add MONO_CANDIDATES for the code-font picker"
```

---

## Task 5: Page-fonts collector (pure) + content wiring

**Files:**
- Create: `src/lib/page-fonts.js`
- Modify: `src/lib/messaging.js`, `src/content.js`
- Test: `tests/page-fonts.test.js`

- [ ] **Step 1: Write the failing test** — create `tests/page-fonts.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { firstFamilyToken, dedupeClassify } from '../src/lib/page-fonts.js';

describe('firstFamilyToken', () => {
  it('takes the first family and strips quotes', () => {
    expect(firstFamilyToken('"Font Awesome 6 Free", sans-serif')).toBe('Font Awesome 6 Free');
    expect(firstFamilyToken("'KaTeX_Main', serif")).toBe('KaTeX_Main');
  });
  it('returns empty for blank input', () => {
    expect(firstFamilyToken('')).toBe('');
    expect(firstFamilyToken(undefined)).toBe('');
  });
});

describe('dedupeClassify', () => {
  const isProt = (n) => /awesome|katex/i.test(n);
  it('dedupes case-insensitively and classifies via the injected fn', () => {
    const out = dedupeClassify(
      ['Pretendard, sans-serif', 'pretendard', '"Font Awesome 6 Free"', 'KaTeX_Main'],
      isProt,
    );
    expect(out).toEqual([
      { name: 'Pretendard', protected: false },
      { name: 'Font Awesome 6 Free', protected: true },
      { name: 'KaTeX_Main', protected: true },
    ]);
  });
  it('skips empties and caps the list', () => {
    const raw = Array.from({ length: 50 }, (_, i) => `Font${i}`);
    expect(dedupeClassify(['', '  ', ...raw], () => false, 40)).toHaveLength(40);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/page-fonts.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pure module** — create `src/lib/page-fonts.js`:

```js
// src/lib/page-fonts.js
// Pure helpers for building the "fonts in use on this page" list.
import { sanitizeFamilyName } from './engine.js';

// '"Font Awesome 6 Free", sans-serif' -> 'Font Awesome 6 Free'
export function firstFamilyToken(fontFamily) {
  const first = String(fontFamily || '').split(',')[0] || '';
  return sanitizeFamilyName(first.replace(/^["']|["']$/g, ''));
}

// rawFamilies: array of computed `font-family` strings (one per element).
// isProtectedFn: (name) => boolean. Returns deduped [{name, protected}], capped.
export function dedupeClassify(rawFamilies, isProtectedFn, cap = 40) {
  const seen = new Map(); // lowercased name -> {name, protected}
  for (const raw of rawFamilies || []) {
    const name = firstFamilyToken(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { name, protected: !!isProtectedFn(name) });
    if (seen.size >= cap) break;
  }
  return [...seen.values()];
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/page-fonts.test.js`. Expected: PASS.

- [ ] **Step 5: Add the message constant** — in `src/lib/messaging.js` add to the `MSG` object: `GET_PAGE_FONTS: 'GET_PAGE_FONTS',`.

- [ ] **Step 6: Wire the content script** — in `src/content.js`:
  - add imports: `import { dedupeClassify } from './lib/page-fonts.js';` and add `isProtectedFamily` to the existing font-protection import (`import { shouldProtect, hasIconClassHint, isProtectedFamily } from './lib/font-protection.js';`).
  - add the collector function (near `scan`):

```js
function collectPageFonts() {
  const raw = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode.nodeType === 1 ? walker.currentNode : walker.nextNode();
  while (node) {
    if (!SKIP_TAGS.has(node.tagName)) {
      const t = directText(node);
      if (t && t.trim()) { try { raw.push(getComputedStyle(node).fontFamily); } catch {} }
    }
    node = walker.nextNode();
  }
  const extra = (settings && settings.protectionDenylistExtra) || [];
  return dedupeClassify(raw, (name) => isProtectedFamily(name, extra));
}
```

  - replace the existing `onMessage` listener so it answers `GET_PAGE_FONTS`:

```js
browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return undefined;
  if (msg.type === MSG.REAPPLY) { apply(); return undefined; }
  if (msg.type === MSG.GET_PAGE_FONTS) return Promise.resolve(collectPageFonts());
  return undefined;
});
```

- [ ] **Step 7: Run the full suite** — Run: `npx vitest run`. Expected: PASS (no regressions; content.js has no unit test but must still import cleanly — covered indirectly).

- [ ] **Step 8: Commit**

```bash
git add src/lib/page-fonts.js tests/page-fonts.test.js src/lib/messaging.js src/content.js
git commit -m "feat(content): collect page fonts in use via GET_PAGE_FONTS"
```

---

## Task 6: Reusable font picker component

**Files:**
- Create: `src/ui/font-picker.js`
- Test: `tests/font-picker.test.js`

- [ ] **Step 1: Write the failing test** (pure filter + a jsdom smoke test) — create `tests/font-picker.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { filterFonts, makeFontPicker } from '../src/ui/font-picker.js';

const FONTS = [{ f: 'Pretendard Variable' }, { f: 'Batang', ko: '바탕' }, { f: 'Georgia' }];

describe('filterFonts', () => {
  it('matches family and Korean name, case-insensitively', () => {
    expect(filterFonts(FONTS, 'geo').map((o) => o.f)).toEqual(['Georgia']);
    expect(filterFonts(FONTS, '바').map((o) => o.f)).toEqual(['Batang']);
    expect(filterFonts(FONTS, '').length).toBe(3);
  });
});

describe('makeFontPicker', () => {
  it('renders a button showing the current value label and calls onChange on pick', () => {
    const mount = document.createElement('div');
    const onChange = vi.fn();
    const api = makeFontPicker(mount, { fonts: FONTS, value: 'Batang', onChange });
    expect(mount.querySelector('.fp-name').textContent).toBe('바탕');
    // open + pick Georgia
    mount.querySelector('.fp-btn').click();
    const georgia = [...mount.querySelectorAll('.fp-opt .o-name')].find((n) => n.textContent === 'Georgia');
    georgia.closest('.fp-opt').click();
    expect(onChange).toHaveBeenCalledWith('Georgia');
    expect(api.value).toBe('Georgia');
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/font-picker.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/ui/font-picker.js` by porting the mockup's `makeFontPicker` (in `docs/mockups/refont-ui.html`) into a module, extracting the pure filter. Use exactly:

```js
// src/ui/font-picker.js
import { labelOf } from './font-names.js';

// Pure: filter option objects by query against family + Korean name.
export function filterFonts(fonts, q) {
  const ql = String(q || '').trim().toLowerCase();
  if (!ql) return fonts.slice();
  return fonts.filter((o) => o.f.toLowerCase().includes(ql) || (o.ko && o.ko.toLowerCase().includes(ql)));
}

// fonts: [{f, ko?}]; value: css family string; sample: swatch text; onChange(family)
export function makeFontPicker(mount, { fonts, value, sample = 'Aa가', onChange }) {
  let val = value;
  let custom = !fonts.some((o) => o.f === value);
  mount.innerHTML = `<button type="button" class="fp-btn"><span class="fp-sample"></span><span class="fp-name"></span><span class="fp-cv">⌄</span></button>
   <div class="fp-panel" hidden><input class="fp-search" placeholder="검색 또는 직접 입력…"><div class="fp-list"></div></div>`;
  const btn = mount.querySelector('.fp-btn');
  const panel = mount.querySelector('.fp-panel');
  const list = mount.querySelector('.fp-list');
  const search = mount.querySelector('.fp-search');
  const bSamp = mount.querySelector('.fp-sample');
  const bName = mount.querySelector('.fp-name');
  const labFor = (fam) => { const o = fonts.find((x) => x.f === fam); return o ? (o.ko || o.f).replace(' Variable', '') : labelOf(fam); };
  const paintBtn = () => {
    bSamp.style.fontFamily = `'${val}',sans-serif`; bSamp.textContent = sample;
    bName.textContent = labFor(val); bName.classList.toggle('custom', custom);
  };
  function render(q = '') {
    list.innerHTML = '';
    for (const o of filterFonts(fonts, q)) {
      const f = o.f; const lab = (o.ko || o.f).replace(' Variable', '');
      const row = document.createElement('div');
      row.className = 'fp-opt' + (f === val ? ' sel' : '');
      row.innerHTML = `<span class="o-check">✓</span><span class="o-name" style="font-family:'${f}',sans-serif">${lab}</span><span class="o-spec" style="font-family:'${f}',sans-serif">${sample} 012</span>`;
      row.onclick = () => pick(f, false); list.appendChild(row);
    }
    const typed = String(q || '').trim();
    if (typed && !fonts.some((o) => o.f.toLowerCase() === typed.toLowerCase() || (o.ko && o.ko.toLowerCase() === typed.toLowerCase()))) {
      const row = document.createElement('div');
      row.className = 'fp-opt mk';
      row.innerHTML = `<span class="o-check">✓</span><span class="o-name">직접 사용: “${typed}”</span><span class="badge">custom</span>`;
      row.onclick = () => pick(typed, true); list.appendChild(row);
    }
    if (!list.children.length) list.innerHTML = '<div class="fp-empty">결과 없음 — 입력해서 직접 지정하세요</div>';
  }
  const open = () => { mount.classList.add('open'); panel.hidden = false; search.value = ''; render(''); search.focus(); };
  const close = () => { mount.classList.remove('open'); panel.hidden = true; };
  function pick(f, isCustom) { val = f; custom = isCustom; paintBtn(); close(); onChange && onChange(f); }
  btn.onclick = () => (mount.classList.contains('open') ? close() : open());
  search.oninput = () => render(search.value);
  document.addEventListener('click', (e) => { if (!mount.contains(e.target)) close(); });
  paintBtn();
  return { get value() { return val; }, refresh: paintBtn };
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/font-picker.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/font-picker.js tests/font-picker.test.js
git commit -m "feat(ui): reusable searchable font picker component"
```

---

## Task 7: Shared stylesheet `settings-ui.css`

**Files:**
- Create: `public/settings-ui.css`

- [ ] **Step 1: Port the styles** — copy the **entire contents of the `<style>…</style>` block** from `docs/mockups/refont-ui.html` into `public/settings-ui.css` (without the `<style>` tags), then apply these exact removals/edits (mockup-only chrome that has no place in the real popup):
  - **Remove** the rules for `.stage`, `.stage > .cap`, `.note`, `.note b`, `.note code`, `.accentbar`, `.ab-label`, `.ab-sw`, `.ab-sw::before`, `.ab-sw:hover`, `.ab-sw.active`.
  - **Replace** the `body { … }` rule with a context-neutral version (the popup/options HTML sets sizing):

```css
*{box-sizing:border-box}
html,body{margin:0}
body{
  font-family:var(--ui);
  color:var(--ink);
  background:
    radial-gradient(1100px 560px at 12% -12%, var(--accent-haze), transparent 60%),
    var(--bg);
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.035;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

  - **Keep** the `:root` cobalt tokens exactly as in the mockup (`--accent:#2f55e0;` … `--accent-haze:rgba(47,85,224,.05);`).
  - **Add** at the end, context sizing for the two mounts:

```css
/* mounted contexts */
.popup{position:relative;z-index:1}
body.ctx-popup{width:384px}
body.ctx-popup .popup{max-height:600px;border-radius:0;border:0;box-shadow:none}
body.ctx-options{padding:32px 16px 64px;display:flex;justify-content:center}
body.ctx-options .popup{width:420px;max-height:none}

@media (prefers-reduced-motion: reduce){
  .popup{animation:none}
  .fp-panel{animation:none}
}
```

- [ ] **Step 2: Sanity check** — Run: `node -e "const c=require('fs').readFileSync('public/settings-ui.css','utf8'); if(!c.includes('--accent:#2f55e0')) throw new Error('cobalt token missing'); if(c.includes('.accentbar')) throw new Error('accentbar not removed'); console.log('ok')"`. Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add public/settings-ui.css
git commit -m "feat(ui): shared settings stylesheet (cobalt, from approved mockup)"
```

---

## Task 8: `settings-ui.js` — markup, mount, pure mapping helpers

**Files:**
- Create: `src/ui/settings-ui.js`
- Test: `tests/settings-ui.test.js`

This task builds the static markup + the pure state↔settings mapping and a smoke-test of mounting. Wiring (sliders/picker/sections/actions) follows in Tasks 9–12.

- [ ] **Step 1: Write the failing test** — create `tests/settings-ui.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
vi.mock('webextension-polyfill', () => ({ default: { runtime: {} } }));
import { settingsToState, stateToSettings, previewSize, mountSettingsUI } from '../src/ui/settings-ui.js';
import { DEFAULTS } from '../src/lib/storage.js';

describe('settingsToState / stateToSettings', () => {
  it('round-trips the core fields', () => {
    const s = { ...DEFAULTS, scale: 1.2, weight: 700, axes: 'opsz 14',
      bodyFont: { source: 'system', name: 'Batang', url: null, urlType: 'css' },
      codeFont: { source: 'system', name: 'Consolas', url: null, urlType: 'css' },
      blocklist: ['a.com'], protectionDenylistExtra: ['my-icons'] };
    const st = settingsToState(s);
    expect(st.family).toBe('Batang');
    expect(st.codeEnabled).toBe(true);
    expect(st.codeFamily).toBe('Consolas');
    expect(st.blocklist).toEqual(['a.com']);
    const back = stateToSettings(st);
    expect(back.scale).toBe(1.2);
    expect(back.bodyFont.name).toBe('Batang');
    expect(back.codeFont.name).toBe('Consolas');
    expect(back.protectionDenylistExtra).toEqual(['my-icons']);
  });
  it('codeFont is null when codeEnabled false', () => {
    const st = settingsToState({ ...DEFAULTS, codeFont: null });
    expect(st.codeEnabled).toBe(false);
    expect(stateToSettings(st).codeFont).toBeNull();
  });
});

describe('previewSize', () => {
  it('scales and applies the min floor proportionally to the EN base', () => {
    expect(previewSize(16, 1.5, 0, 16)).toBe(24);
    expect(previewSize(16, 1, 20, 16)).toBe(20);
  });
});

describe('mountSettingsUI', () => {
  it('renders the popup frame with all sections', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'news.example.com', tabId: 1, settings: { ...DEFAULTS } });
    expect(root.querySelector('.popup')).toBeTruthy();
    expect(root.querySelector('#srcSeg')).toBeTruthy();
    expect(root.querySelector('#rWeight')).toBeTruthy();
    expect(root.querySelector('#save')).toBeTruthy();
    expect(document.body.classList.contains('ctx-popup')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement skeleton + helpers** — create `src/ui/settings-ui.js`. The `MARKUP` constant is the **popup inner markup** ported from `docs/mockups/refont-ui.html`: copy the markup **from `<div class="top">` through the closing `</div>` of `.actions`** (i.e. everything inside `<div class="popup" id="popup">…</div>` in the mockup), wrapped in `<div class="popup" id="popup">…</div>`. Do **not** include `.stage`, `.cap`, `.accentbar`, or `.note`. Provide the pure helpers and a `mount` that injects markup, sets the body context class, and stores `ctx`/`state` for later wiring tasks:

```js
// src/ui/settings-ui.js
import browser from 'webextension-polyfill';
import { MSG } from '../lib/messaging.js';
import { DEFAULTS } from '../lib/storage.js';

// ---- pure mapping (unit-tested) ----
export function settingsToState(s) {
  const bf = s.bodyFont || DEFAULTS.bodyFont;
  return {
    enabled: s.enabled,
    source: bf.source || 'system',
    family: bf.name || '',
    url: bf.url || '',
    urlType: bf.urlType || 'css',
    scale: s.scale, minSize: s.minSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
    weight: s.weight, weightFine: !!s.weightFine, preserveBold: s.preserveBold !== false, axes: s.axes || '',
    codeEnabled: !!(s.codeFont && s.codeFont.name),
    codeFamily: (s.codeFont && s.codeFont.name) || '',
    blocklist: (s.blocklist || []).slice(),
    protectExtra: (s.protectionDenylistExtra || []).slice(),
  };
}

export function stateToSettings(st) {
  return {
    enabled: st.enabled,
    bodyFont: { source: st.source, name: st.family, url: st.source === 'weburl' ? st.url : null, urlType: st.urlType },
    codeFont: st.codeEnabled && st.codeFamily ? { source: 'system', name: st.codeFamily, url: null, urlType: 'css' } : null,
    scale: st.scale, minSize: st.minSize, weight: st.weight, weightFine: st.weightFine,
    preserveBold: st.preserveBold, lineHeight: st.lineHeight, letterSpacing: st.letterSpacing, axes: st.axes,
    blocklist: st.blocklist, protectionDenylistExtra: st.protectExtra,
  };
}

// preview font-size for a specimen line: scale, then min floor scaled to the EN base.
export function previewSize(base, scale, min, baseEn) {
  return Math.max(base * scale, min ? min * (base / baseEn) : 0);
}

const MARKUP = `<div class="popup" id="popup"> … PORTED FROM MOCKUP … </div>`;

export function mountSettingsUI(root, ctx) {
  const settings = ctx.settings || DEFAULTS;
  const state = settingsToState(settings);
  document.body.classList.add(ctx.context === 'options' ? 'ctx-options' : 'ctx-popup');
  root.innerHTML = MARKUP;
  // Wiring added in Tasks 9–12. Expose for those tasks/tests:
  const api = { root, ctx, state };
  return api;
}
```

  Replace the `MARKUP` placeholder with the real ported markup (verbatim from the mockup, minus mockup chrome). This is the only allowed reference-by-source in the plan because the markup is large and already committed as the approved source of truth; copy it exactly.

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: PASS (helpers + smoke mount).

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings-ui.js tests/settings-ui.test.js
git commit -m "feat(ui): settings-ui skeleton + state mapping helpers"
```

---

## Task 9: Wire specimen preview + sliders + weight + axes

**Files:**
- Modify: `src/ui/settings-ui.js`
- Test: `tests/settings-ui.test.js`

- [ ] **Step 1: Write the failing test** — append:

```js
describe('live preview wiring', () => {
  it('updates the specimen font-size and weight when sliders change', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS, scale: 1, weight: 0 } });
    const rWeight = root.querySelector('#rWeight');
    rWeight.value = '800'; rWeight.dispatchEvent(new Event('input'));
    expect(root.querySelector('#sKr').style.fontWeight).toBe('800');
    const rScale = root.querySelector('#rScale');
    rScale.value = '2'; rScale.dispatchEvent(new Event('input'));
    expect(parseFloat(root.querySelector('#sEn').style.fontSize)).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: FAIL (sliders not wired; fontWeight empty).

- [ ] **Step 3: Implement wiring** — inside `mountSettingsUI`, after `root.innerHTML = MARKUP;`, port the mockup `<script>` logic into module functions operating on `root` (scope all `$` lookups to `root.querySelector`). Include, adapted from the mockup: `applyPreview()` (uses `previewSize` + `parseAxes`-style local axis parse), `drawReadout()` (uses `labelOf` from font-names), the slider `wire()` + `setP()` track fill, weight ticks (`markTicks`), the `toggleCheck` for `ckPreserve`/`ckFine`, and the `axes` input listener. Initialize control values from `state` before first `applyPreview()`. Keep the specimen base sizes (`baseKr=23, baseEn=16, baseNum=12`). Use `import { labelOf } from './font-names.js'` and `import { parseAxes } from '../lib/engine.js'` (reuse the engine parser instead of duplicating).

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings-ui.js tests/settings-ui.test.js
git commit -m "feat(ui): live specimen preview + sliders + weight + axes wiring"
```

---

## Task 10: Integrate font pickers (body + code) + code preview + source segmented control

**Files:**
- Modify: `src/ui/settings-ui.js`
- Test: `tests/settings-ui.test.js`

- [ ] **Step 1: Write the failing test** — append:

```js
describe('font pickers', () => {
  it('mounts body + code pickers and updates state.family on pick', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, bodyFont: { source: 'system', name: 'Georgia', url: null, urlType: 'css' } },
      installedFonts: ['Georgia', 'Batang'], monoFonts: ['Consolas'] });
    expect(root.querySelector('#bodyPicker .fp-btn')).toBeTruthy();
    expect(root.querySelector('#bodyPicker .fp-name').textContent).toBe('Georgia');
    root.querySelector('#bodyPicker .fp-btn').click();
    const batang = [...root.querySelectorAll('#bodyPicker .o-name')].find((n) => n.textContent === '바탕');
    batang.closest('.fp-opt').click();
    expect(api.state.family).toBe('Batang');
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: FAIL (pickers not mounted).

- [ ] **Step 3: Implement** — in `mountSettingsUI`:
  - import `makeFontPicker` and `toOptions`.
  - Determine font lists: `const installed = ctx.installedFonts || []; const mono = ctx.monoFonts || [];` Build option arrays `toOptions(installed)` and `toOptions(mono)`; ensure the current `state.family`/`state.codeFamily` is present (if custom, the picker handles it).
  - Mount `makeFontPicker(root.querySelector('#bodyPicker'), { fonts: bodyOpts, value: state.family || 'Pretendard Variable', sample: 'Aa가', onChange: (f) => { state.family = f; applyPreview(); } })`.
  - Mount the code picker on `#codePicker` with `mono` opts, `value: state.codeFamily || 'Consolas'`, sample `'{ }'`, `onChange: (f) => { state.codeFamily = f; updateCodePrev(f); }`; port `updateCodePrev`.
  - Wire `#srcSeg` (system/weburl) and `#webTypeSeg` (css/file) segmented controls + `#ckCode` reveal of `#codeWrap` (port from mockup). Reflect `state.source`/`state.urlType`/`state.codeEnabled` into the controls on init.
  - `document.fonts.ready` → refresh both pickers (guard `document.fonts`).

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings-ui.js tests/settings-ui.test.js
git commit -m "feat(ui): wire body/code font pickers + source segmented controls"
```

---

## Task 11: Blocklist + current-site + page-fonts + protection (context-aware)

**Files:**
- Modify: `src/ui/settings-ui.js`
- Test: `tests/settings-ui.test.js`

- [ ] **Step 1: Write the failing test** — append:

```js
describe('scope + protection', () => {
  it('renders the current host and adds it to the blocklist textarea', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'news.example.com', tabId: 1, settings: { ...DEFAULTS } });
    expect(root.querySelector('#curHost').textContent).toContain('news.example.com');
    root.querySelector('#addHost').click();
    expect(root.querySelector('#blocklist').value).toContain('news.example.com');
  });
  it('renders page fonts and adds one to the protect list on +', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS },
      pageFonts: [{ name: 'Font Awesome 6 Free', protected: true }, { name: 'Pretendard', protected: false }] });
    const rows = root.querySelectorAll('#pageFonts .chip');
    expect(rows.length).toBe(2);
    rows[0].querySelector('.plus').click();
    expect(root.querySelector('#protect').value).toContain('Font Awesome 6 Free');
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement** — in `mountSettingsUI`:
  - Populate `#blocklist` textarea from `state.blocklist.join('\n')` and `#protect` from `state.protectExtra.join('\n')`; on `input`, parse back into `state.blocklist`/`state.protectExtra` (split lines, trim, filter empty).
  - Current-site row: set `#curHost` from `ctx.currentHost` (split scheme/host/path display if a full URL is provided; else show host). Wire `#addHost` to append `ctx.currentHost` to the blocklist textarea (dedup) with the transient "✓ 추가됨" feedback (port from mockup).
  - Render `#pageFonts` from `ctx.pageFonts` (array of `{name, protected}`): one `.chip` per row (name in its own font, `.tag prot|body`, `+` button). `+` appends `name` to `#protect` + marks `.added` (port from mockup). Empty-state when none.
  - **Context behavior:** if `ctx.context === 'options'` (no `currentHost`): set the `.site` row to a disabled/explanatory state ("현재 사이트 없음 — 팝업에서 사이트별로 설정"), and show the page-fonts empty hint ("팝업에서 페이지별로 확인").

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings-ui.js tests/settings-ui.test.js
git commit -m "feat(ui): scope (blocklist/current-site) + page-fonts protection picker"
```

---

## Task 12: Power toggle + action bar (save/export/import/full) — context-aware

**Files:**
- Modify: `src/ui/settings-ui.js`
- Test: `tests/settings-ui.test.js`

- [ ] **Step 1: Write the failing test** — append (mock the messaging round-trip):

```js
describe('actions', () => {
  it('saves the current state via SAVE_SETTINGS', async () => {
    const sent = [];
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS },
      send: (m) => { sent.push(m); return Promise.resolve({}); } });
    api.state.scale = 1.4;
    root.querySelector('#save').click();
    await Promise.resolve();
    const saveMsg = sent.find((m) => m.type === 'SAVE_SETTINGS');
    expect(saveMsg).toBeTruthy();
    expect(saveMsg.payload.scale).toBe(1.4);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run tests/settings-ui.test.js`. Expected: FAIL.

- [ ] **Step 3a: Extract IO helpers to a neutral module** — create `src/lib/settings-io.js` (avoids a `settings-ui ↔ options` import cycle). Move the serialize/parse logic here verbatim:

```js
// src/lib/settings-io.js
import { DEFAULTS } from './storage.js';

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
```

- [ ] **Step 3b: Implement actions** — in `mountSettingsUI`:
  - import `{ serializeSettings, parseSettings } from '../lib/settings-io.js'`.
  - Use a `send` function: `const send = ctx.send || ((m) => browser.runtime.sendMessage(m));` (injectable for tests).
  - **Save:** `#save` → `send({ type: MSG.SAVE_SETTINGS, payload: stateToSettings(state) })`, then the "✓ 저장됨" feedback (port). In options context the payload's `enabled` comes from the toggle (already in state).
  - **Export:** `#export` → build `serializeSettings({ ...DEFAULTS, ...stateToSettings(state) })`, download as `refont-settings.json` via a Blob + temporary `<a>`.
  - **Import:** `#import` → click hidden `#importFile`; on `change`, `parseSettings(await file.text())` → `send({ type: MSG.SAVE_SETTINGS, payload })` → `location.reload()` (acceptable for both contexts; re-mounts with fresh settings). On parse error, show "잘못된 파일" in the save button area.
  - **Power toggle** `#toggle`: 
    - popup: ON ⇔ `ctx.currentHost` not in `state.blocklist`; on click `send({ type: MSG.TOGGLE_SITE, url: ctx.currentUrl || ctx.currentHost })`, flip `.off` class + label, and update `state.blocklist` to match. Initialize from `ctx.blocked`.
    - options: bind to `state.enabled`; click flips `state.enabled` + label "전체 켜짐/꺼짐" (persisted on Save). 
  - **`⤢` full-screen** `#full`: popup → `browser.runtime.openOptionsPage(); window.close();`. options → hide the button (`#full`).
  - **Off-state refinement:** toggling off adds `.off` to `.popup` for the visual cue but does **not** set `pointer-events:none` (per spec §12) — controls remain operable.

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run tests/settings-ui.test.js`. Then full suite: `npx vitest run`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings-io.js src/ui/settings-ui.js tests/settings-ui.test.js
git commit -m "feat(ui): power toggle + save/export/import/full-screen actions"
```

---

## Task 13: HTML shells + popup.js/options.js mounts + build copy

**Files:**
- Modify: `public/popup.html`, `public/options.html`, `src/popup.js`, `src/options.js`, `scripts/build.mjs`
- Test: `tests/options-io.test.js` (must still pass — `serializeSettings`/`parseSettings` stay exported from `options.js`)

- [ ] **Step 1: Replace `public/popup.html`** with a thin shell:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="settings-ui.css" />
</head>
<body>
  <div id="root"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `public/options.html`** with the same shell but title + options.js:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>Refont 설정</title>
  <link rel="stylesheet" href="settings-ui.css" />
</head>
<body>
  <div id="root"></div>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 3: Rewrite `src/popup.js`** to resolve the active tab + page fonts and mount the UI:

```js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';
import { detectFonts, makeMeasurer, FONT_CANDIDATES, MONO_CANDIDATES } from './lib/font-detect.js';
import { mountSettingsUI } from './ui/settings-ui.js';

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  const url = (tab && tab.url) || '';
  const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
  let installedFonts = [], monoFonts = [];
  try { installedFonts = detectFonts(FONT_CANDIDATES, makeMeasurer()); } catch {}
  try { monoFonts = detectFonts(MONO_CANDIDATES, makeMeasurer()); } catch {}
  let pageFonts = [];
  try { pageFonts = await browser.tabs.sendMessage(tab.id, { type: MSG.GET_PAGE_FONTS }); } catch {}
  mountSettingsUI(document.getElementById('root'), {
    context: 'popup', currentHost: host, currentUrl: url, tabId: tab && tab.id,
    blocked: isBlocked(url, settings.blocklist),
    settings, installedFonts, monoFonts, pageFonts: pageFonts || [],
  });
}
if (typeof document !== 'undefined' && document.getElementById('root')) init();
```

- [ ] **Step 4: Rewrite `src/options.js`** re-exporting `serializeSettings`/`parseSettings` from the neutral module (so `tests/options-io.test.js` keeps passing) and mounting in options context:

```js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { detectFonts, makeMeasurer, FONT_CANDIDATES, MONO_CANDIDATES } from './lib/font-detect.js';
import { mountSettingsUI } from './ui/settings-ui.js';

// Re-export for the existing import/export unit test (tests/options-io.test.js).
export { serializeSettings, parseSettings } from './lib/settings-io.js';

async function init() {
  const settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  let installedFonts = [], monoFonts = [];
  try { installedFonts = detectFonts(FONT_CANDIDATES, makeMeasurer()); } catch {}
  try { monoFonts = detectFonts(MONO_CANDIDATES, makeMeasurer()); } catch {}
  mountSettingsUI(document.getElementById('root'), {
    context: 'options', currentHost: null, tabId: null,
    settings, installedFonts, monoFonts, pageFonts: [],
  });
}
if (typeof document !== 'undefined' && document.getElementById('root')) init();
```

  (The export/import wiring lives inside `settings-ui.js` per Task 12; `serializeSettings`/`parseSettings` are re-exported here both for the test and for `settings-ui.js` to import for the import/export buttons.)

- [ ] **Step 5: Update `scripts/build.mjs`** — after the `copyFileSync` for popup.html, add:

```js
copyFileSync(join(root, 'public/settings-ui.css'), join(outdir, 'settings-ui.css'));
```

- [ ] **Step 6: Run tests + build** — Run: `npx vitest run` (expect PASS, incl. options-io). Then `npm run build` (expect both `dist/chrome` and `dist/firefox` built with `settings-ui.css` present).

- [ ] **Step 7: Commit**

```bash
git add public/popup.html public/options.html src/popup.js src/options.js scripts/build.mjs
git commit -m "feat(ui): mount shared settings UI in popup + options shells"
```

---

## Task 14: Full verification + manual-test checklist + finish

**Files:**
- Modify: `docs/MANUAL-TEST.md`

- [ ] **Step 1: Full test suite** — Run: `npx vitest run`. Expected: all green (original 61 + new tests).

- [ ] **Step 2: Build both** — Run: `npm run build`. Expected: success; verify `dist/chrome/settings-ui.css`, `dist/chrome/popup.html`, `dist/chrome/options.html` exist (and firefox).

- [ ] **Step 3: Extend `docs/MANUAL-TEST.md`** — add a "Redesigned UI" section covering: popup shows full settings; live preview updates for size/weight/spacing/axes; picker renders options in-font with Korean names + custom input (body + code); weight ticks + fine mode; variable axes change a known variable font after Save; "+ 추가" adds current host; page-fonts list classifies an icon font as 기능성 and adding it protects it; options tab renders the same UI; `⤢` opens options from popup; **and the reminder to test standalone preview pages with Refont disabled / in incognito** (a loaded Refont overrides inline fonts on `<all_urls>` pages but not on `chrome-extension://` popup/options).

- [ ] **Step 4: Commit**

```bash
git add docs/MANUAL-TEST.md
git commit -m "docs: manual-test checklist for the redesigned UI"
```

- [ ] **Step 5: Finish the branch** — use **superpowers:finishing-a-development-branch** (verify tests pass → present merge/PR options). Manual browser testing per `docs/MANUAL-TEST.md` remains the outstanding real-world step (as noted in project memory).

---

## Notes for the implementer
- **Markup/CSS source of truth:** `docs/mockups/refont-ui.html`. Where a task says "port from the mockup," copy the exact markup/CSS/JS and adapt only as the step specifies (scope `$` to `root`, remove mockup-only chrome, replace mock data with `ctx`). Don't redesign.
- **DRY:** reuse `engine.parseAxes` (don't duplicate the axis parser in the UI), `font-names.labelOf`, `font-picker.makeFontPicker`.
- **No live page apply while dragging:** preview is local; the page updates on Save (which triggers `broadcastReapply`).
- **Injectable seams for tests:** `mountSettingsUI` accepts `ctx.settings`, `ctx.installedFonts`, `ctx.monoFonts`, `ctx.pageFonts`, and `ctx.send` so the component is testable without the browser runtime.
