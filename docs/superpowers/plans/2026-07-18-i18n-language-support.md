# Korean/English i18n (UI + docs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add English alongside Korean for the settings UI (with an auto-detect + manual language control) and ship English siblings of README / PRIVACY / STORE-LISTING.

**Architecture:** A pure in-app string dictionary (`src/lib/i18n.js`) holds every UI string for both locales. The settings UI marks static text with `data-i18n` attributes filled by a one-pass DOM walk after mount, and routes dynamic strings through a `t()` function. A `language` setting (`'auto'|'ko'|'en'`, default `'auto'`) selects the locale; changing it persists and reloads the page. Native `_locales` and manifest text are intentionally NOT used.

**Tech Stack:** Vanilla JS ES modules, vitest + jsdom, bun (`bun run test`, `bun run build`). No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-07-18-i18n-language-support-design.md`

**Conventions:** Build/test with **bun** (no npm/node). Commit messages carry **no `Co-Authored-By` trailer**.

---

## Task 1: i18n core module + dictionary

**Files:**
- Create: `src/lib/i18n.js`
- Test: `tests/i18n.test.js`

- [ ] **Step 1: Write the failing test** — `tests/i18n.test.js`

```js
import { describe, it, expect } from 'vitest';
import { LOCALES, messages, resolveLocale, createT } from '../src/lib/i18n.js';

describe('resolveLocale', () => {
  it('passes an explicit locale through', () => {
    expect(resolveLocale('ko', 'en-US')).toBe('ko');
    expect(resolveLocale('en', 'ko-KR')).toBe('en');
  });
  it('auto-detects from the browser language', () => {
    expect(resolveLocale('auto', 'ko-KR')).toBe('ko');
    expect(resolveLocale('auto', 'ko')).toBe('ko');
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('auto', 'fr')).toBe('en');
  });
  it('treats unknown/missing settings as auto and missing navLang as en', () => {
    expect(resolveLocale(undefined, 'ko-KR')).toBe('ko');
    expect(resolveLocale('auto', '')).toBe('en');
    expect(resolveLocale('auto', undefined)).toBe('en');
  });
});

describe('createT', () => {
  it('looks up a key in the requested locale', () => {
    expect(createT('en')('action.save')).toBe(messages.en['action.save']);
    expect(createT('ko')('action.save')).toBe('저장');
  });
  it('falls back locale -> ko -> key', () => {
    const t = createT('en');
    expect(t('__missing__')).toBe('__missing__'); // no such key anywhere -> key itself
  });
  it('interpolates {n}-style placeholders', () => {
    expect(createT('en')('loadLocal.added', { n: 3 })).toBe('✓ 3 added');
    expect(createT('ko')('loadLocal.added', { n: 3 })).toBe('✓ 3개 추가됨');
  });
});

describe('dictionary parity', () => {
  it('every ko key exists in en and vice-versa', () => {
    const ko = Object.keys(messages.ko).sort();
    const en = Object.keys(messages.en).sort();
    expect(en).toEqual(ko);
  });
  it('exports both locales', () => {
    expect(LOCALES).toEqual(['ko', 'en']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run test tests/i18n.test.js`
Expected: FAIL — `Cannot find module '../src/lib/i18n.js'`.

- [ ] **Step 3: Create `src/lib/i18n.js`** with the full dictionary

```js
// src/lib/i18n.js
// In-app UI string dictionary. NOT native _locales — the UI language is a stored
// setting that can be switched at runtime, which chrome.i18n cannot do. Every
// user-facing settings string lives here for both locales. `{name}` placeholders
// are filled by t(key, vars). Keys are dotted and grouped by UI area.
export const LOCALES = ['ko', 'en'];

export const messages = {
  ko: {
    'toggle.on': '이 사이트 켜짐',
    'toggle.off': '이 사이트 꺼짐',
    'toggle.onAll': '전체 켜짐',
    'toggle.offAll': '전체 꺼짐',
    'src.system': '시스템 폰트',
    'src.weburl': '웹폰트 URL',
    'src.fontLabel': '폰트 · 검색하거나 직접 입력',
    'src.loadLocal': '설치된 폰트 정확히 불러오기',
    'web.css': 'CSS / 구글폰트 링크',
    'web.file': '폰트 파일(.woff2)',
    'web.familyLabel': '패밀리명 (파일 URL일 때 필수)',
    'web.familyPlaceholder': '예: Pretendard',
    'web.optional': '레이아웃 시프트 최소화 (font-display: optional)',
    'size.presetA11y': '읽기 좋게 (접근성)',
    'size.presetHint': '최소 크기·줄간격·자간을 한 번에 (한글 포함)',
    'metric.scale': '크기 배율',
    'metric.min': '최소 크기',
    'metric.lineHeight': '줄간격',
    'metric.letterSpacing': '자간',
    'metric.wordSpacing': '어절 간격',
    'metric.weight': '두께',
    'metric.width': '너비',
    'metric.off': '끔',
    'metric.original': '원본',
    'opsz.off': 'opsz 끔',
    'check.preserveBold': '볼드 위계 보존',
    'check.fine': '미세조정 (variable)',
    'check.optical': '광학 크기 자동',
    'axes.summary': '추가 가변 축 (variable axes)',
    'axes.placeholder': '예: slnt -6, ital 1, GRAD 50',
    'axes.hint': 'tag value 쌍을 쉼표로. 두께·너비·광학 크기는 위 컨트롤로 조절하세요. 등록 축은 표준 속성으로, 커스텀 축(대문자)은 font-variation-settings로 적용됩니다.',
    'code.hint': '코드·고정폭 전용',
    'code.enable': '코드/고정폭에 별도 폰트 사용',
    'scope.title': '이 사이트 제외',
    'scope.addHost': '+ 추가',
    'scope.blocklistLabel': '블록리스트 (한 줄에 하나)',
    'scope.advSummary': '고급: 이 사이트의 특정 요소 제외 (CSS 선택자)',
    'scope.selPlaceholder': '한 줄에 하나 — 예: .sidebar, code.hljs, [data-no-font]',
    'scope.selPopupNote': '팝업에서 사이트별로 설정하세요.',
    'scope.hostNone': '현재 사이트 없음 — 팝업에서 사이트별로 설정',
    'scope.hostAdded': '✓ 추가됨',
    'protect.title': '보호 폰트',
    'protect.inUse': '이 페이지에서 사용 중',
    'protect.summary': '수동 보호 목록',
    'protect.placeholder': 'family명 일부 — 자동 감지가 놓친 아이콘/기능성 폰트',
    'protect.addTitle': '보호 목록에 추가',
    'pageFonts.popupHint': '팝업에서 페이지별로 확인',
    'pageFonts.none': '이 페이지에서 감지된 폰트 없음',
    'tag.functional': '기능성',
    'tag.body': '본문',
    'footer.reset': '기본값으로 초기화',
    'footer.resetConfirm': '한번 더 눌러 초기화',
    'action.save': '저장',
    'action.saved': '✓ 저장됨',
    'action.saveFail': '저장 실패',
    'action.export': '내보내기',
    'action.import': '가져오기',
    'action.importInvalid': '잘못된 파일',
    'action.fullTitle': '전체 화면 옵션 탭으로 열기',
    'loadLocal.added': '✓ {n}개 추가됨',
    'loadLocal.denied': '권한 거부됨',
    'lang.label': '언어',
    'lang.auto': '자동',
    'lang.ko': '한국어',
    'lang.en': 'English',
  },
  en: {
    'toggle.on': 'On for this site',
    'toggle.off': 'Off for this site',
    'toggle.onAll': 'On everywhere',
    'toggle.offAll': 'Off everywhere',
    'src.system': 'System font',
    'src.weburl': 'Web font URL',
    'src.fontLabel': 'Font · search or type',
    'src.loadLocal': 'Load exact installed fonts',
    'web.css': 'CSS / Google Fonts link',
    'web.file': 'Font file (.woff2)',
    'web.familyLabel': 'Family name (required for file URLs)',
    'web.familyPlaceholder': 'e.g. Pretendard',
    'web.optional': 'Minimize layout shift (font-display: optional)',
    'size.presetA11y': 'Easy reading (accessibility)',
    'size.presetHint': 'Min size, line height & letter spacing at once (Korean-friendly)',
    'metric.scale': 'Size scale',
    'metric.min': 'Min size',
    'metric.lineHeight': 'Line height',
    'metric.letterSpacing': 'Letter spacing',
    'metric.wordSpacing': 'Word spacing',
    'metric.weight': 'Weight',
    'metric.width': 'Width',
    'metric.off': 'Off',
    'metric.original': 'Original',
    'opsz.off': 'opsz off',
    'check.preserveBold': 'Preserve bold hierarchy',
    'check.fine': 'Fine-tune (variable)',
    'check.optical': 'Optical sizing auto',
    'axes.summary': 'Extra variable axes',
    'axes.placeholder': 'e.g. slnt -6, ital 1, GRAD 50',
    'axes.hint': 'Comma-separated tag value pairs. Adjust weight, width and optical size with the controls above. Registered axes apply as standard properties; custom axes (uppercase) via font-variation-settings.',
    'code.hint': 'Code / monospace only',
    'code.enable': 'Use a separate font for code/monospace',
    'scope.title': 'Exclude this site',
    'scope.addHost': '+ Add',
    'scope.blocklistLabel': 'Blocklist (one per line)',
    'scope.advSummary': 'Advanced: exclude specific elements on this site (CSS selectors)',
    'scope.selPlaceholder': 'One per line — e.g. .sidebar, code.hljs, [data-no-font]',
    'scope.selPopupNote': 'Set per-site from the popup.',
    'scope.hostNone': 'No current site — set per-site from the popup',
    'scope.hostAdded': '✓ Added',
    'protect.title': 'Protected fonts',
    'protect.inUse': 'In use on this page',
    'protect.summary': 'Manual protection list',
    'protect.placeholder': 'Part of a family name — icon/functional fonts auto-detection missed',
    'protect.addTitle': 'Add to protection list',
    'pageFonts.popupHint': 'Check per-page from the popup',
    'pageFonts.none': 'No fonts detected on this page',
    'tag.functional': 'Functional',
    'tag.body': 'Body',
    'footer.reset': 'Reset to defaults',
    'footer.resetConfirm': 'Press again to reset',
    'action.save': 'Save',
    'action.saved': '✓ Saved',
    'action.saveFail': 'Save failed',
    'action.export': 'Export',
    'action.import': 'Import',
    'action.importInvalid': 'Invalid file',
    'action.fullTitle': 'Open in full-screen options tab',
    'loadLocal.added': '✓ {n} added',
    'loadLocal.denied': 'Permission denied',
    'lang.label': 'Language',
    'lang.auto': 'Auto',
    'lang.ko': '한국어',
    'lang.en': 'English',
  },
};

// 'auto' (or anything not a known locale) resolves from the browser language:
// Korean when it starts with 'ko', English otherwise.
export function resolveLocale(setting, navLang = (typeof navigator !== 'undefined' ? navigator.language : '')) {
  if (setting === 'ko' || setting === 'en') return setting;
  return String(navLang || '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

// Build a translator for a resolved locale. Missing key -> ko -> the key itself
// (so a gap is visible, never blank). vars fill {name} placeholders.
export function createT(locale) {
  const dict = messages[locale] || messages.ko;
  return (key, vars) => {
    let s = dict[key] != null ? dict[key] : (messages.ko[key] != null ? messages.ko[key] : key);
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun run test tests/i18n.test.js`
Expected: PASS (all i18n tests, including parity).

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.js tests/i18n.test.js
git commit -m "feat(i18n): add ko/en string dictionary with resolveLocale + createT"
```

---

## Task 2: `language` setting in storage

**Files:**
- Modify: `src/lib/storage.js` (DEFAULTS ~line 11–33, normalize return ~line 88–113)
- Test: `tests/storage.test.js` (exists; already imports `DEFAULTS, normalizeSettings`)

- [ ] **Step 1: Write the failing test** — append this `describe` block to `tests/storage.test.js` (do NOT re-import; `DEFAULTS` and `normalizeSettings` are already imported at the top of that file)

```js
describe('language setting', () => {
  it('defaults to auto', () => {
    expect(DEFAULTS.language).toBe('auto');
    expect(normalizeSettings({}).language).toBe('auto');
  });
  it('keeps valid values and clamps invalid ones to auto', () => {
    expect(normalizeSettings({ language: 'ko' }).language).toBe('ko');
    expect(normalizeSettings({ language: 'en' }).language).toBe('en');
    expect(normalizeSettings({ language: 'auto' }).language).toBe('auto');
    expect(normalizeSettings({ language: 'fr' }).language).toBe('auto');
    expect(normalizeSettings({ language: 42 }).language).toBe('auto');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run test tests/storage.test.js`
Expected: FAIL — `DEFAULTS.language` is `undefined`.

- [ ] **Step 3: Add the field to `DEFAULTS`** in `src/lib/storage.js`

After the `recentFonts: { body: [], code: [] },` line inside `DEFAULTS`, add:

```js
  language: 'auto',  // UI language: 'auto' (follow browser) | 'ko' | 'en'
```

- [ ] **Step 4: Add a validator constant + normalize field** in `src/lib/storage.js`

Near the other `Set` constants (e.g. after `const FONT_URL_TYPES = new Set(['css', 'file']);`), add:

```js
const LANGUAGES = new Set(['auto', 'ko', 'en']);
```

In the object returned by `normalizeSettings`, after the `recentFonts: { ... },` block, add:

```js
    language: LANGUAGES.has(s.language) ? s.language : DEFAULTS.language,
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `bun run test tests/storage.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.js tests/storage.test.js
git commit -m "feat(settings): add language field (auto/ko/en), default auto"
```

---

## Task 3: Wire i18n into the settings UI

**Files:**
- Modify: `src/ui/settings-ui.js`
- Modify: `public/settings-ui.css` (small `.lang` rule)

This task has no isolated unit test of its own; it is covered by Task 4's updated `settings-ui.test.js`. Implement it, then run Task 4. Commit at the end of Task 4.

- [ ] **Step 1: Import i18n** at the top of `src/ui/settings-ui.js`

Add to the import block:

```js
import { resolveLocale, createT } from '../lib/i18n.js';
```

- [ ] **Step 2: Add `applyI18n` helper** (place it just above `export function mountSettingsUI`)

```js
// Fill data-i18n text/attributes from the dictionary after the static markup is
// mounted. Text-only elements carry data-i18n; attributes use data-i18n-<attr>.
export function applyI18n(root, t) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.getAttribute('data-i18n'));
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
}
```

- [ ] **Step 3: Annotate the static `MARKUP`** — add `data-i18n*` attributes.

Apply these exact edits inside the `MARKUP` template string. For each, add the attribute; the Korean text stays as the literal fallback (applyI18n overwrites it at mount).

Text elements (add `data-i18n="KEY"`):

| Current snippet | Add attribute |
|---|---|
| `<span class="lbl" id="toggleLbl">이 사이트 켜짐</span>` | `data-i18n="toggle.on"` |
| `<button role="tab" ... data-src="system">시스템 폰트</button>` | `data-i18n="src.system"` |
| `<button role="tab" ... data-src="weburl">웹폰트 URL</button>` | `data-i18n="src.weburl"` |
| `<label class="field">폰트 · 검색하거나 직접 입력</label>` | `data-i18n="src.fontLabel"` |
| `<button ... id="loadLocal" ...>설치된 폰트 정확히 불러오기</button>` | `data-i18n="src.loadLocal"` |
| `<button aria-selected="true" data-wt="css">CSS / 구글폰트 링크</button>` | `data-i18n="web.css"` |
| `<button aria-selected="false" data-wt="file">폰트 파일(.woff2)</button>` | `data-i18n="web.file"` |
| `<label class="field">패밀리명 (파일 URL일 때 필수)</label>` | `data-i18n="web.familyLabel"` |
| `<button ... id="presetA11y" ...>읽기 좋게 (접근성)</button>` | `data-i18n="size.presetA11y"` |
| the `<span class="hint" ...>최소 크기·줄간격·자간을 한 번에 (한글 포함)</span>` | `data-i18n="size.presetHint"` |
| `<span class="name">크기 배율</span>` | `data-i18n="metric.scale"` |
| `<span class="name">최소 크기</span>` | `data-i18n="metric.min"` |
| `<span class="name">줄간격</span>` | `data-i18n="metric.lineHeight"` |
| `<span class="name">자간</span>` | `data-i18n="metric.letterSpacing"` |
| `<span class="name">어절 간격</span>` | `data-i18n="metric.wordSpacing"` |
| `<span class="name">두께</span>` | `data-i18n="metric.weight"` |
| `<span class="name">너비</span>` | `data-i18n="metric.width"` |
| `<span class="val off" id="vMin">끔</span>` | `data-i18n="metric.off"` |
| `<span class="val off" id="vLh">끔</span>` | `data-i18n="metric.off"` |
| `<span class="val off" id="vWs">끔</span>` | `data-i18n="metric.off"` |
| `<span class="val off" id="vWidth">원본</span>` | `data-i18n="metric.original"` |
| `<summary>추가 가변 축 (variable axes)</summary>` | `data-i18n="axes.summary"` |
| the `<span class="hint" ...>` axes hint containing `<code>tag value</code> 쌍을 쉼표로...` | replace its entire inner HTML with plain text and `data-i18n="axes.hint"` (drop the `<code>` wrapper) |
| `<span class="hint">코드·고정폭 전용</span>` | `data-i18n="code.hint"` |
| `<span class="t kr">이 사이트 제외</span>` | `data-i18n="scope.title"` |
| `<button class="btn-add" id="addHost">+ 추가</button>` | `data-i18n="scope.addHost"` |
| `<label class="field">블록리스트 (한 줄에 하나)</label>` | `data-i18n="scope.blocklistLabel"` |
| `<summary>고급: 이 사이트의 특정 요소 제외 (CSS 선택자)</summary>` | `data-i18n="scope.advSummary"` |
| `<span class="t kr">보호 폰트</span>` | `data-i18n="protect.title"` |
| `<span class="hint">이 페이지에서 사용 중</span>` | `data-i18n="protect.inUse"` |
| `<summary>수동 보호 목록</summary>` | `data-i18n="protect.summary"` |
| `<button class="btn-reset" id="reset">기본값으로 초기화</button>` | `data-i18n="footer.reset"` |
| `<button class="btn primary" id="save">저장</button>` | `data-i18n="action.save"` |
| `<button class="btn" id="export">내보내기</button>` | `data-i18n="action.export"` |
| `<button class="btn" id="import">가져오기</button>` | `data-i18n="action.import"` |

Attribute elements:

| Current snippet | Add attribute(s) |
|---|---|
| `<input type="text" id="webFamily" placeholder="예: Pretendard" />` | `data-i18n-placeholder="web.familyPlaceholder"` |
| `<input type="text" id="axes" placeholder="예: slnt -6, ital 1, GRAD 50" ...>` | `data-i18n-placeholder="axes.placeholder"` |
| `<textarea id="selExclude" placeholder="한 줄에 하나 — ..." ...>` | `data-i18n-placeholder="scope.selPlaceholder"` |
| `<textarea id="protect" placeholder="family명 일부 — ..." ...>` | `data-i18n-placeholder="protect.placeholder"` |
| `<button class="btn icon" id="full" title="전체 화면 옵션 탭으로 열기">⤢</button>` | `data-i18n-title="action.fullTitle"` |

Mixed-content elements (a `<span class="box">` sibling): wrap the trailing Korean label in its own `<span data-i18n="KEY">`. Edit these five:

```html
<!-- ckOptional (was: ...<span class="box"></span>레이아웃 시프트 최소화 (font-display: optional)) -->
...<span class="box"></span><span data-i18n="web.optional">레이아웃 시프트 최소화 (font-display: optional)</span>

<!-- ckPreserve -->
...<span class="box"></span><span data-i18n="check.preserveBold">볼드 위계 보존</span>

<!-- ckFine -->
...<span class="box"></span><span data-i18n="check.fine">미세조정 (variable)</span>

<!-- ckOptical -->
...<span class="box"></span><span data-i18n="check.optical">광학 크기 자동</span>

<!-- ckCode -->
...<span class="box"></span><span data-i18n="code.enable">코드/고정폭에 별도 폰트 사용</span>
```

Leave untouched (NOT translated): the specimen lines `#sKr` (`다람쥐 헌 쳇바퀴에 타고파`), `#sEn`, `#sNum`; the version string; the code-preview block (`#codePrev`); the `webUrl` placeholder (a URL example).

- [ ] **Step 4: Add the language selector** to the `.footer` block in `MARKUP`

Replace the footer block:

```html
      <div class="footer">
        <button class="btn-reset" id="reset" data-i18n="footer.reset">기본값으로 초기화</button>
      </div>
```

with:

```html
      <div class="footer">
        <label class="lang" id="langRow"><span data-i18n="lang.label">언어</span>
          <select id="langSel">
            <option value="auto" data-i18n="lang.auto">자동</option>
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>
        </label>
        <button class="btn-reset" id="reset" data-i18n="footer.reset">기본값으로 초기화</button>
      </div>
```

- [ ] **Step 5: Create `t` and run `applyI18n` at mount time** in `mountSettingsUI`

Find near the top of `mountSettingsUI` (after `const settings = ctx.settings || DEFAULTS;`) and the place where the fragment is appended to `root`. Immediately AFTER the markup is appended to `root`, add:

```js
  const locale = resolveLocale(settings.language);
  const t = createT(locale);
  applyI18n(root, t);
```

(If the current mount does `root.appendChild(htmlToFragment(MARKUP))`, put these three lines on the line right after it, so `root.querySelectorAll` sees the mounted nodes.)

- [ ] **Step 6: Wire the language selector** — add after the `send` definition (`const send = ctx.send || (...)`, ~line 643)

```js
  // Language: persist immediately and reload so the whole UI re-renders in the
  // chosen locale. Shown on the options page only; the popup inherits the choice.
  // reload is injectable (ctx.reload) so tests don't have to monkeypatch location.
  const reloadPage = ctx.reload || (() => location.reload());
  const langRow = $('langRow');
  const langSel = $('langSel');
  if (ctx.context !== 'options') { if (langRow) langRow.hidden = true; }
  if (langSel) {
    langSel.value = settings.language || 'auto';
    langSel.addEventListener('change', async () => {
      try { await send({ type: MSG.SAVE_SETTINGS, payload: { language: langSel.value } }); } catch {}
      reloadPage();
    });
  }
```

- [ ] **Step 7: Replace dynamic Korean strings with `t(...)`** in `mountSettingsUI`

Apply these exact replacements (search the left literal, replace with the right expression):

| Current | Replace with |
|---|---|
| `parts.push({ t: 'opsz 끔' });` | `parts.push({ t: t('opsz.off') });` |
| `v.textContent = '끔';` (each of the 3 sites: vMin, vLh, vWs updaters) | `v.textContent = t('metric.off');` |
| `v.textContent = '원본';` (width updater) | `v.textContent = t('metric.original');` |
| `$('vWeight').textContent = state.weight === 0 ? '원본' : state.weight;` | `$('vWeight').textContent = state.weight === 0 ? t('metric.original') : state.weight;` |
| `vWidth.textContent = '원본';` (init block) | `vWidth.textContent = t('metric.original');` |
| `loadLocalBtn.textContent = `✓ ${added}개 추가됨`;` | `loadLocalBtn.textContent = t('loadLocal.added', { n: added });` |
| `loadLocalBtn.textContent = '권한 거부됨';` | `loadLocalBtn.textContent = t('loadLocal.denied');` |
| `curHost.textContent = '현재 사이트 없음 — 팝업에서 사이트별로 설정';` | `curHost.textContent = t('scope.hostNone');` |
| `addHost.textContent = '✓ 추가됨';` | `addHost.textContent = t('scope.hostAdded');` |
| `selNote.textContent = '팝업에서 사이트별로 설정하세요.';` | `selNote.textContent = t('scope.selPopupNote');` |
| `? '팝업에서 페이지별로 확인'` | `? t('pageFonts.popupHint')` |
| `: '이 페이지에서 감지된 폰트 없음';` | `: t('pageFonts.none');` |
| `tag.textContent = pf.protected ? '기능성' : '본문';` | `tag.textContent = pf.protected ? t('tag.functional') : t('tag.body');` |
| `plus.title = '보호 목록에 추가';` | `plus.title = t('protect.addTitle');` |
| `saveBtn.textContent = '✓ 저장됨';` | `saveBtn.textContent = t('action.saved');` |
| `saveBtn.textContent = '저장 실패';` | `saveBtn.textContent = t('action.saveFail');` |
| `saveBtn.textContent = '잘못된 파일';` | `saveBtn.textContent = t('action.importInvalid');` |
| `toggleLbl.textContent = on ? '이 사이트 켜짐' : '이 사이트 꺼짐';` (both sites) | `toggleLbl.textContent = on ? t('toggle.on') : t('toggle.off');` |
| `toggleLbl.textContent = on ? '전체 켜짐' : '전체 꺼짐';` (both sites) | `toggleLbl.textContent = on ? t('toggle.onAll') : t('toggle.offAll');` |
| `resetBtn.textContent = '한번 더 눌러 초기화';` | `resetBtn.textContent = t('footer.resetConfirm');` |
| `resetArmed = false; resetBtn.textContent = '기본값으로 초기화';` | `resetArmed = false; resetBtn.textContent = t('footer.reset');` |

Note: the `saveBtn` "restore original label" logic reads `const orig = saveBtn.textContent;` — after applyI18n the button already shows the localized `action.save`, so `orig` is correct in either locale. No change needed there.

- [ ] **Step 8: Add a `.lang` CSS rule** to `public/settings-ui.css` (append at the end)

```css
.footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lang { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-dim); }
.lang select { font: inherit; padding: 2px 4px; }
```

(If `.footer` already has a `display` rule in the file, keep the existing one and add only the `.lang` rules.)

- [ ] **Step 9: Sanity build** (no test yet — Task 4 covers tests)

Run: `bun run build`
Expected: builds Chrome + Firefox with no error.

Do NOT commit yet — commit together with Task 4.

---

## Task 4: Update settings-ui tests for i18n

**Files:**
- Modify: `tests/settings-ui.test.js`

- [ ] **Step 1: Force the auto-locale to Korean for the existing assertions**

jsdom's `navigator.language` defaults to `en-US`, which would make `language:'auto'` render English and break the existing Korean assertions. Pin it to Korean once. Add right after the imports (top of the file, after line 5):

```js
// Existing assertions expect Korean; DEFAULTS.language is 'auto', so pin the
// jsdom browser language to Korean for these tests.
Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
```

- [ ] **Step 2: Run the suite to confirm existing Korean tests still pass**

Run: `bun run test tests/settings-ui.test.js`
Expected: PASS — the pin keeps `'원본'`, `'이 사이트 제외'`, `'보호 폰트'`, `'한번 더'`, `'저장 실패'`, `'저장'` assertions valid.

- [ ] **Step 3: Add an English-render test** — append inside the `describe('mountSettingsUI', ...)` block

```js
  it('renders English when settings.language is en', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, language: 'en' } });
    const krTitles = [...root.querySelectorAll('.sec-h .t.kr')].map((e) => e.textContent);
    expect(krTitles).toContain('Exclude this site');
    expect(krTitles).toContain('Protected fonts');
    expect(root.querySelector('#save').textContent).toBe('Save');
    expect(root.querySelector('#vWidth').textContent).toBe('Original');
  });
```

- [ ] **Step 4: Add the language-selector persist+reload test** — append inside the same block

```js
  it('persists the language and reloads when the selector changes (options only)', async () => {
    const root = document.createElement('div');
    const sent = [];
    const reload = vi.fn();
    mountSettingsUI(root, { context: 'options', currentHost: null, reload,
      settings: { ...DEFAULTS }, send: (m) => { sent.push(m); return Promise.resolve({}); } });
    const sel = root.querySelector('#langSel');
    expect(root.querySelector('#langRow').hidden).toBe(false); // shown on options
    sel.value = 'en';
    sel.dispatchEvent(new Event('change'));
    await Promise.resolve(); await Promise.resolve();
    expect(sent).toContainEqual({ type: MSG.SAVE_SETTINGS, payload: { language: 'en' } });
    expect(reload).toHaveBeenCalled();
  });

  it('hides the language selector in the popup', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS } });
    expect(root.querySelector('#langRow').hidden).toBe(true);
  });
```

Add `MSG` to the imports at the top of the test file if not already present:

```js
import { MSG } from '../src/lib/messaging.js';
```

- [ ] **Step 5: Run the full suite**

Run: `bun run test`
Expected: PASS — all files, including `i18n`, `storage`, and `settings-ui`.

- [ ] **Step 6: Build**

Run: `bun run build`
Expected: Chrome + Firefox build OK.

- [ ] **Step 7: Commit Tasks 3 + 4 together**

```bash
git add src/ui/settings-ui.js public/settings-ui.css tests/settings-ui.test.js
git commit -m "feat(ui): localize settings UI (ko/en) with in-app language selector"
```

---

## Task 5: English documents

**Files:**
- Create: `README.en.md`, `docs/PRIVACY.en.md`, `docs/STORE-LISTING.en.md`
- Modify: `README.md`, `docs/PRIVACY.md`, `docs/STORE-LISTING.md` (add a language-switch line at the top of each)

- [ ] **Step 1: Add a language-switch line to the top of each Korean doc**

At the very top of `README.md` (above the existing `<div align="center">`), add:

```markdown
<p align="right"><b>한국어</b> · <a href="README.en.md">English</a></p>
```

At the very top of `docs/PRIVACY.md`, add:

```markdown
**한국어** · [English](PRIVACY.en.md)
```

At the very top of `docs/STORE-LISTING.md`, add:

```markdown
**한국어** · [English](STORE-LISTING.en.md)
```

- [ ] **Step 2: Create `README.en.md`**

Translate `README.md` section-by-section into English. Keep the same structure, images (same `public/...` / `docs/store-assets/...` paths), and links. Top line:

```markdown
<p align="right"><a href="README.md">한국어</a> · <b>English</b></p>
```

Keep code blocks, badges, and screenshot paths identical; translate only prose and headings.

- [ ] **Step 3: Create `docs/PRIVACY.en.md`**

Translate `docs/PRIVACY.md` fully. Top line:

```markdown
[한국어](PRIVACY.md) · **English**
```

Retain the exact same policy meaning (data collected = none, permissions rationale, contact). Do not alter the substance — this is a legal document; translate faithfully.

- [ ] **Step 4: Create `docs/STORE-LISTING.en.md`**

Translate `docs/STORE-LISTING.md`. Title becomes `# Refont — Store listing (English)`. Top line:

```markdown
[한국어](STORE-LISTING.md) · **English**
```

- [ ] **Step 5: Verify links resolve**

Run:

```bash
for f in README.en.md docs/PRIVACY.en.md docs/STORE-LISTING.en.md; do test -f "$f" && echo "ok $f"; done
grep -l "README.en.md" README.md; grep -l "PRIVACY.en.md" docs/PRIVACY.md; grep -l "STORE-LISTING.en.md" docs/STORE-LISTING.md
```

Expected: three `ok` lines and three matching source files.

- [ ] **Step 6: Commit**

```bash
git add README.md README.en.md docs/PRIVACY.md docs/PRIVACY.en.md docs/STORE-LISTING.md docs/STORE-LISTING.en.md
git commit -m "docs: add English README, privacy policy, and store listing"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full suite + build + whitespace**

Run:

```bash
bun run test && bun run build && git diff --check && echo ALL-GREEN
```

Expected: all tests pass, both bundles build, no whitespace errors, `ALL-GREEN`.

- [ ] **Step 2: Manual smoke checklist (record results, do not automate)**

- Options page in a `ko` browser → Korean UI; switch selector to `English` → reloads in English; switch to `한국어` → back to Korean.
- Options page in an `en` browser with `language:'auto'` → English UI.
- Popup shows no language selector but honors the saved language.
- README / PRIVACY / STORE-LISTING language links navigate both directions on GitHub.

---

## Self-review notes (author)

- **Spec coverage:** i18n core (T1), storage field (T2), UI markup + dynamic + selector + reload (T3), tests incl. parity/English/selector (T1+T4), docs (T5), out-of-scope items untouched. All spec sections mapped.
- **Type consistency:** `resolveLocale`/`createT`/`applyI18n`/`messages`/`LOCALES` names match across tasks; `SAVE_SETTINGS` payload `{ language }` matches `saveSettings` partial-merge behavior in `src/lib/storage.js`.
- **Known nuance:** the axes hint drops its inline `<code>` wrapper (becomes plain text) — intentional, noted in T3 Step 3.
