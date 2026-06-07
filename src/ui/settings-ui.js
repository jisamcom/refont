// src/ui/settings-ui.js
import browser from 'webextension-polyfill';
import { MSG } from '../lib/messaging.js';
import { DEFAULTS } from '../lib/storage.js';
import { serializeSettings, parseSettings } from '../lib/settings-io.js';
import { parseAxes, splitTextAxes } from '../lib/engine.js';
import { localFontsSupported, queryInstalledFamilies } from '../lib/local-fonts.js';
import { labelOf, toOptions } from './font-names.js';
import { makeFontPicker } from './font-picker.js';

// ---- pure mapping (unit-tested) ----
export function settingsToState(s) {
  const bf = s.bodyFont || DEFAULTS.bodyFont;
  return {
    enabled: s.enabled,
    source: bf.source || 'system',
    // Never leave the body family empty: the picker only *displays* a default,
    // so an empty state would be saved verbatim and force generic sans-serif.
    family: bf.name || DEFAULTS.bodyFont.name,
    url: bf.url || '',
    urlType: bf.urlType || 'css',
    webfontDisplay: s.webfontDisplay || 'swap',
    scale: s.scale, minSize: s.minSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
    wordSpacing: s.wordSpacing || 0,
    weight: s.weight, weightFine: !!s.weightFine, preserveBold: s.preserveBold !== false, axes: s.axes || '',
    width: s.width || 0, opticalSizing: s.opticalSizing || 'auto',
    codeEnabled: !!(s.codeFont && s.codeFont.name),
    codeFamily: (s.codeFont && s.codeFont.name) || '',
    blocklist: (s.blocklist || []).slice(),
    protectExtra: (s.protectionDenylistExtra || []).slice(),
    manualExclusions: { ...(s.manualExclusions || {}) },
    recentFonts: {
      body: ((s.recentFonts && s.recentFonts.body) || []).slice(),
      code: ((s.recentFonts && s.recentFonts.code) || []).slice(),
    },
  };
}

export function stateToSettings(st) {
  return {
    enabled: st.enabled,
    bodyFont: { source: st.source, name: st.family, url: st.source === 'weburl' ? st.url : null, urlType: st.urlType },
    webfontDisplay: st.webfontDisplay,
    codeFont: st.codeEnabled && st.codeFamily ? { source: 'system', name: st.codeFamily, url: null, urlType: 'css' } : null,
    scale: st.scale, minSize: st.minSize, weight: st.weight, weightFine: st.weightFine,
    width: st.width, opticalSizing: st.opticalSizing,
    preserveBold: st.preserveBold, lineHeight: st.lineHeight, letterSpacing: st.letterSpacing,
    wordSpacing: st.wordSpacing, axes: st.axes,
    blocklist: st.blocklist, protectionDenylistExtra: st.protectExtra,
    manualExclusions: st.manualExclusions, recentFonts: st.recentFonts,
  };
}

// preview font-size for a specimen line: scale, then min floor scaled to the EN base.
export function previewSize(base, scale, min, baseEn) {
  return Math.max(base * scale, min ? min * (base / baseEn) : 0);
}

const MARKUP = `<div class="popup" id="popup">

    <!-- ===== sticky top ===== -->
    <div class="top">
      <div class="brandrow">
        <div class="brand"><span class="mark">Refont<span class="dot">.</span></span><span class="ver">v0.2.3</span></div>
        <div class="toggle on" id="toggle" role="switch" aria-checked="true" tabindex="0">
          <span class="lbl" id="toggleLbl">이 사이트 켜짐</span>
          <span class="switch"></span>
        </div>
      </div>

      <div class="specimen" id="specimen">
        <div class="grid"></div>
        <div class="spec-kr" id="sKr">다람쥐 헌 쳇바퀴에 타고파</div>
        <div class="spec-en" id="sEn">The quick brown fox jumps over</div>
        <div class="spec-num" id="sNum">0123456789 · 가나다라마 · ABCabc</div>
        <div class="readout" id="readout"></div>
      </div>
    </div>

    <!-- ===== scroll body ===== -->
    <div class="body">

      <!-- SOURCE -->
      <section>
        <div class="sec-h"><span class="t">Typeface</span><span class="rule"></span></div>
        <div class="seg" id="srcSeg" role="tablist">
          <button role="tab" aria-selected="true" data-src="system">시스템 폰트</button>
          <button role="tab" aria-selected="false" data-src="weburl">웹폰트 URL</button>
        </div>

        <div id="srcSystem">
          <label class="field">폰트 · 검색하거나 직접 입력</label>
          <div class="fp" id="bodyPicker"></div>
          <button class="btn-add" id="loadLocal" type="button" hidden style="margin-top:8px">설치된 폰트 정확히 불러오기</button>
        </div>

        <div id="srcWeb" hidden>
          <div class="seg" id="webTypeSeg" style="margin-top:8px">
            <button aria-selected="true" data-wt="css">CSS / 구글폰트 링크</button>
            <button aria-selected="false" data-wt="file">폰트 파일(.woff2)</button>
          </div>
          <label class="field">URL</label>
          <input type="url" id="webUrl" placeholder="https://fonts.googleapis.com/css2?family=…" />
          <div id="webFamilyWrap" hidden>
            <label class="field">패밀리명 (파일 URL일 때 필수)</label>
            <input type="text" id="webFamily" placeholder="예: Pretendard" />
            <span class="check" id="ckOptional" role="checkbox" aria-checked="false" tabindex="0" style="margin-top:9px"><span class="box"></span>레이아웃 시프트 최소화 (font-display: optional)</span>
          </div>
        </div>
      </section>

      <!-- SIZE & RHYTHM -->
      <section>
        <div class="sec-h"><span class="t">Size &amp; rhythm</span><span class="rule"></span></div>
        <div class="minirow"><button class="btn-add" id="presetA11y" type="button">읽기 좋게 (접근성)</button><span class="hint" style="font-size:11px;color:var(--ink-dim)">최소 크기·줄간격·자간을 한 번에 (한글 포함)</span></div>

        <div class="ctl">
          <div class="row"><span class="name">크기 배율</span><span class="val" id="vScale">1.10×</span></div>
          <input type="range" id="rScale" min="0.5" max="2.5" step="0.05" value="1.1" />
        </div>
        <div class="ctl">
          <div class="row"><span class="name">최소 크기</span><span class="val off" id="vMin">끔</span></div>
          <input type="range" id="rMin" min="0" max="24" step="1" value="0" />
        </div>
        <div class="ctl">
          <div class="row"><span class="name">줄간격</span><span class="val off" id="vLh">끔</span></div>
          <input type="range" id="rLh" min="0" max="2.6" step="0.05" value="0" />
        </div>
        <div class="ctl">
          <div class="row"><span class="name">자간</span><span class="val" id="vLs">0.00em</span></div>
          <input type="range" id="rLs" min="-0.05" max="0.3" step="0.01" value="0" />
        </div>
        <div class="ctl">
          <div class="row"><span class="name">어절 간격</span><span class="val off" id="vWs">끔</span></div>
          <input type="range" id="rWs" min="0" max="0.5" step="0.02" value="0" />
        </div>
      </section>

      <!-- WEIGHT & WIDTH -->
      <section>
        <div class="sec-h"><span class="t">Weight &amp; width</span><span class="rule"></span></div>
        <div class="ctl">
          <div class="row"><span class="name">두께</span><span class="val" id="vWeight">700</span></div>
          <input type="range" id="rWeight" min="100" max="900" step="100" value="700" />
          <div class="ticks" id="ticks"></div>
        </div>
        <div class="ctl">
          <div class="row"><span class="name">너비</span><span class="val off" id="vWidth">원본</span></div>
          <input type="range" id="rWidth" min="50" max="200" step="5" value="100" />
        </div>
        <div class="minirow">
          <span class="check on" id="ckPreserve" role="checkbox" aria-checked="true" tabindex="0"><span class="box"></span>볼드 위계 보존</span>
          <span class="check" id="ckFine" role="checkbox" aria-checked="false" tabindex="0"><span class="box"></span>미세조정 (variable)</span>
          <span class="check on" id="ckOptical" role="checkbox" aria-checked="true" tabindex="0"><span class="box"></span>광학 크기 자동</span>
        </div>
        <details class="adv">
          <summary>추가 가변 축 (variable axes)</summary>
          <input type="text" id="axes" placeholder="예: slnt -6, ital 1, GRAD 50" style="margin-top:6px" />
          <div class="sec-h" style="margin:8px 0 0"><span class="hint" style="font-size:11px;color:var(--ink-dim)"><code>tag value</code> 쌍을 쉼표로. 두께·너비·광학크기는 위 컨트롤로 조절하세요. 등록 축은 표준 속성으로, 커스텀 축(대문자)은 font-variation-settings로 적용됩니다.</span></div>
        </details>
      </section>

      <!-- CODE FONT -->
      <section>
        <div class="sec-h"><span class="t">Code font</span><span class="rule"></span><span class="hint">코드·고정폭 전용</span></div>
        <span class="check" id="ckCode" role="checkbox" aria-checked="false" tabindex="0"><span class="box"></span>코드/고정폭에 별도 폰트 사용</span>
        <div id="codeWrap" hidden>
          <div class="fp" id="codePicker" style="margin-top:9px"></div>
          <div class="codeprev" id="codePrev">
            <span class="ln"><span class="kw">const</span> <span class="vr">refont</span> = { size: <span class="nm2">14</span> };</span>
            <span class="ln">// 0O 1lI · ()=&gt;{} · &lt;tag/&gt;</span>
          </div>
        </div>
      </section>

      <!-- SCOPE / blocklist -->
      <section>
        <div class="sec-h"><span class="t kr">이 사이트 제외</span><span class="rule"></span></div>
        <div class="site">
          <span class="host" id="curHost"><span class="scheme">https://</span>news.example.com<span class="scheme">/article/2026</span></span>
          <button class="btn-add" id="addHost">+ 추가</button>
        </div>
        <label class="field">블록리스트 (한 줄에 하나)</label>
        <textarea id="blocklist">docs.google.com/spreadsheets</textarea>
        <details class="adv">
          <summary>고급: 이 사이트의 특정 요소 제외 (CSS 선택자)</summary>
          <span class="hint" id="selNote" style="display:none;font-size:11px;color:var(--ink-dim)"></span>
          <textarea id="selExclude" placeholder="한 줄에 하나 — 예: .sidebar, code.hljs, [data-no-font]" style="margin-top:6px"></textarea>
        </details>
      </section>

      <!-- PROTECTION -->
      <section>
        <div class="sec-h"><span class="t kr">보호 폰트</span><span class="rule"></span><span class="hint">이 페이지에서 사용 중</span></div>
        <div class="chips" id="pageFonts"></div>
        <details class="adv" open>
          <summary>수동 보호 목록</summary>
          <textarea id="protect" placeholder="family명 일부 — 자동 감지가 놓친 아이콘/기능성 폰트" style="margin-top:6px"></textarea>
        </details>
      </section>

      <div class="footer">
        <button class="btn-reset" id="reset">기본값으로 초기화</button>
      </div>

    </div>

    <!-- ===== sticky actions ===== -->
    <div class="actions">
      <button class="btn primary" id="save">저장</button>
      <button class="btn" id="export">내보내기</button>
      <button class="btn" id="import">가져오기</button>
      <button class="btn icon" id="full" title="전체 화면 옵션 탭으로 열기">⤢</button>
    </div>

  </div>`;

// Parse a trusted, static HTML string into a fragment without innerHTML.
// DOMParser doesn't execute scripts and isn't flagged by AMO static analysis;
// MARKUP is developer-authored (no interpolation), so this is purely to satisfy
// the "no innerHTML" lint while keeping the markup readable.
function htmlToFragment(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const frag = document.createDocumentFragment();
  frag.append(...doc.body.childNodes);
  return frag;
}

export function mountSettingsUI(root, ctx) {
  const settings = ctx.settings || DEFAULTS;
  const state = settingsToState(settings);
  document.body.classList.add(ctx.context === 'options' ? 'ctx-options' : 'ctx-popup');
  root.replaceChildren(htmlToFragment(MARKUP));

  // ---- live specimen preview + sliders + weight + axes (scoped to root) ----
  const $ = (id) => root.querySelector('#' + id);
  const baseKr = 23, baseEn = 16, baseNum = 12;
  // Reassigned to the real debounced page-applier near the end of mount;
  // change handlers call it so edits also reflect on the current tab.
  let ready = false;
  let scheduleLiveApply = () => {};

  function applyPreview() {
    const fam = "'" + state.family + "', system-ui, sans-serif";
    const w = String(state.weight || 400);
    const ls = state.letterSpacing ? state.letterSpacing + 'em' : '';
    const ws = state.wordSpacing > 0 ? state.wordSpacing + 'em' : '';
    const lh = state.lineHeight > 0 ? state.lineHeight : '';
    // Mirror the engine's split: registered axes → standard props, custom → FVS.
    const { std, custom } = splitTextAxes(state);
    const fvsStr = custom.join(', ');
    const stretch = state.width > 0 ? state.width + '%' : (std['font-stretch'] || '');
    const fstyle = std['font-style'] || '';
    const optical = state.opticalSizing === 'none' ? 'none' : '';
    const kr = $('sKr'), en = $('sEn'), num = $('sNum');
    for (const el of [kr, en, num]) {
      el.style.fontFamily = fam;
      el.style.fontWeight = w;
      el.style.fontStretch = stretch;
      el.style.fontStyle = fstyle;
      el.style.fontOpticalSizing = optical;
      el.style.letterSpacing = ls;
      el.style.wordSpacing = ws;
      el.style.lineHeight = lh;
      el.style.fontVariationSettings = fvsStr;
    }
    kr.style.fontSize = previewSize(baseKr, state.scale, state.minSize, baseEn) + 'px';
    en.style.fontSize = previewSize(baseEn, state.scale, state.minSize, baseEn) + 'px';
    num.style.fontSize = previewSize(baseNum, state.scale, state.minSize, baseEn) + 'px';
    drawReadout();
    scheduleLiveApply();
  }

  function drawReadout() {
    const r = $('readout');
    // {b:true} → <b>; plain → text. Built with DOM nodes so a custom font name
    // (user input in state.family) can never inject markup here.
    const parts = [
      { b: true, t: labelOf(state.family) },
      { b: true, t: state.scale.toFixed(2) + '×' },
      { b: true, t: String(state.weight) },
    ];
    if (state.width > 0) parts.push({ t: 'wdth ' + state.width + '%' });
    if (state.opticalSizing === 'none') parts.push({ t: 'opsz 끔' });
    if (state.minSize > 0) parts.push({ t: 'min ' + state.minSize + 'px' });
    if (state.lineHeight > 0) parts.push({ t: 'lh ' + state.lineHeight.toFixed(2) });
    if (state.letterSpacing != 0) parts.push({ t: 'ls ' + state.letterSpacing.toFixed(2) + 'em' });
    if (state.wordSpacing > 0) parts.push({ t: 'ws ' + state.wordSpacing.toFixed(2) + 'em' });
    parseAxes(state.axes).forEach((a) => parts.push({ t: a.tag + ' ' + a.val }));
    r.replaceChildren();
    parts.forEach((p, i) => {
      if (i) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '·'; r.append(' ', s, ' '); }
      if (p.b) { const b = document.createElement('b'); b.textContent = p.t; r.append(b); }
      else r.append(p.t);
    });
  }

  // ---- sliders ----
  function setP(el) {
    const min = +el.min, max = +el.max, v = +el.value;
    el.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
  }
  function wire(el, fn) {
    setP(el);
    el.addEventListener('input', () => { setP(el); fn(); applyPreview(); });
  }

  const rScale = $('rScale'), rMin = $('rMin'), rLh = $('rLh'), rLs = $('rLs'), rWs = $('rWs'), rWeight = $('rWeight'), rWidth = $('rWidth');

  // Named updaters so the value chips can also be synced on load (not just on input).
  const updScale = () => { state.scale = +rScale.value; $('vScale').textContent = state.scale.toFixed(2) + '×'; };
  const updMin = () => {
    state.minSize = +rMin.value;
    const v = $('vMin');
    if (state.minSize === 0) { v.textContent = '끔'; v.classList.add('off'); }
    else { v.textContent = state.minSize + 'px'; v.classList.remove('off'); }
  };
  const updLh = () => {
    state.lineHeight = +rLh.value;
    const v = $('vLh');
    if (state.lineHeight === 0) { v.textContent = '끔'; v.classList.add('off'); }
    else { v.textContent = state.lineHeight.toFixed(2); v.classList.remove('off'); }
  };
  const updLs = () => { state.letterSpacing = +rLs.value; $('vLs').textContent = state.letterSpacing.toFixed(2) + 'em'; };
  const updWs = () => {
    state.wordSpacing = +rWs.value;
    const v = $('vWs');
    if (state.wordSpacing === 0) { v.textContent = '끔'; v.classList.add('off'); }
    else { v.textContent = state.wordSpacing.toFixed(2) + 'em'; v.classList.remove('off'); }
  };
  const updWeight = () => { state.weight = +rWeight.value; $('vWeight').textContent = state.weight; markTicks(); };
  // 100% is the neutral width, so treat it as "off" (no font-stretch rule) — this
  // gives a local way back to 원본 after the slider has been touched (min is 50).
  const updWidth = () => {
    state.width = (+rWidth.value === 100) ? 0 : +rWidth.value;
    const v = $('vWidth');
    if (state.width === 0) { v.textContent = '원본'; v.classList.add('off'); }
    else { v.textContent = state.width + '%'; v.classList.remove('off'); }
  };
  wire(rScale, updScale);
  wire(rMin, updMin);
  wire(rLh, updLh);
  wire(rLs, updLs);
  wire(rWs, updWs);
  wire(rWeight, updWeight);
  wire(rWidth, updWidth);

  // ---- accessibility / reading preset: bump readability dials in one click.
  // Font-agnostic (works on Korean too); does NOT touch family/color.
  $('presetA11y').addEventListener('click', () => {
    rMin.value = 18; updMin(); setP(rMin);
    rLh.value = 1.7; updLh(); setP(rLh);          // WCAG 1.4.12: line-height ≥ 1.5
    rLs.value = 0.12; updLs(); setP(rLs);         // WCAG 1.4.12: letter-spacing ≥ 0.12em
    rWs.value = 0.16; updWs(); setP(rWs);         // WCAG 1.4.12: word-spacing ≥ 0.16em
    applyPreview();
  });

  // ---- weight ticks ----
  const ticksWrap = $('ticks');
  for (let w = 100; w <= 900; w += 200) {
    const s = document.createElement('span');
    s.textContent = w;
    s.dataset.w = w;
    ticksWrap.appendChild(s);
  }
  function markTicks() {
    [...ticksWrap.children].forEach((s) => s.classList.toggle('hot', Math.abs(+s.dataset.w - state.weight) <= 50));
  }

  // ---- inline checks ----
  function toggleCheck(el, onChange) {
    el.addEventListener('click', () => {
      const on = el.getAttribute('aria-checked') !== 'true';
      el.setAttribute('aria-checked', on);
      el.classList.toggle('on', on);
      onChange(on);
    });
  }
  toggleCheck($('ckPreserve'), (on) => { state.preserveBold = on; scheduleLiveApply(); });
  toggleCheck($('ckFine'), (on) => {
    state.weightFine = on;
    rWeight.step = on ? 1 : 100;
    if (!on) {
      rWeight.value = Math.round(rWeight.value / 100) * 100;
      state.weight = +rWeight.value;
      $('vWeight').textContent = state.weight;
      setP(rWeight);
    }
    markTicks();
    applyPreview();
  });

  toggleCheck($('ckOptical'), (on) => { state.opticalSizing = on ? 'auto' : 'none'; applyPreview(); });

  $('axes').addEventListener('input', (e) => { state.axes = e.target.value; applyPreview(); });

  // ---- initialize controls from state (before first applyPreview) ----
  rScale.value = state.scale;
  rMin.value = state.minSize;
  rLh.value = state.lineHeight;
  rLs.value = state.letterSpacing;
  rWs.value = state.wordSpacing;
  // weight:0 (원본/keep) → position slider at 400 but keep state.weight at 0 for saving.
  rWeight.value = state.weight || 400;
  rWeight.step = state.weightFine ? 1 : 100;
  $('vWeight').textContent = state.weight === 0 ? '원본' : state.weight;
  // width:0 (원본/keep) → position slider at 100% but keep state.width at 0 for saving.
  rWidth.value = state.width || 100;
  const vWidth = $('vWidth');
  if (state.width === 0) { vWidth.textContent = '원본'; vWidth.classList.add('off'); }
  else { vWidth.textContent = state.width + '%'; vWidth.classList.remove('off'); }
  $('axes').value = state.axes;
  // Sync the size/rhythm value chips to the loaded settings (weight chip handled above).
  updScale(); updMin(); updLh(); updLs(); updWs();

  // sync check controls to state (markup defaults: ckPreserve on, ckFine off).
  const ckPreserve = $('ckPreserve');
  ckPreserve.setAttribute('aria-checked', String(!!state.preserveBold));
  ckPreserve.classList.toggle('on', !!state.preserveBold);
  const ckFine = $('ckFine');
  ckFine.setAttribute('aria-checked', String(!!state.weightFine));
  ckFine.classList.toggle('on', !!state.weightFine);
  const ckOptical = $('ckOptical');
  const opticalOn = state.opticalSizing !== 'none';
  ckOptical.setAttribute('aria-checked', String(opticalOn));
  ckOptical.classList.toggle('on', opticalOn);

  [rScale, rMin, rLh, rLs, rWs, rWeight, rWidth].forEach(setP);
  markTicks();
  applyPreview();

  // ---- font pickers (body + code) ----
  function pushRecent(kind, fam) {
    const arr = state.recentFonts[kind];
    const i = arr.indexOf(fam);
    if (i >= 0) arr.splice(i, 1);
    arr.unshift(fam);
    if (arr.length > 5) arr.length = 5;
  }
  function updateCodePrev(f) {
    root.querySelectorAll('#codePrev .ln').forEach((l) => { l.style.fontFamily = "'" + f + "', ui-monospace, monospace"; });
  }

  // Picker lists start from the heuristic-detected sets; the Local Font Access
  // button (Chromium only) can enrich the body list with the exact installed
  // names. bp/cp are rebuilt in place when that happens.
  let bodyFams = (ctx.installedFonts || []).slice();
  const monoFams = (ctx.monoFonts || []).slice();
  let bp, cp;
  function buildPickers() {
    bp = makeFontPicker($('bodyPicker'), {
      fonts: toOptions(bodyFams),
      value: state.family || 'Pretendard Variable',
      sample: 'Aa가',
      recent: () => state.recentFonts.body,
      onChange: (f) => { state.family = f; pushRecent('body', f); applyPreview(); scheduleLiveApply(); },
    });
    cp = makeFontPicker($('codePicker'), {
      fonts: toOptions(monoFams),
      value: state.codeFamily || 'Consolas',
      sample: '{ }',
      recent: () => state.recentFonts.code,
      onChange: (f) => { state.codeFamily = f; pushRecent('code', f); updateCodePrev(f); scheduleLiveApply(); },
    });
  }
  buildPickers();
  updateCodePrev(state.codeFamily || 'Consolas');

  // Local Font Access: exact installed-font enumeration (Chromium/Edge desktop
  // only; needs the user gesture below + the 'local-fonts' permission). Hidden
  // where unsupported (Firefox/Safari/mobile) — those keep the heuristic list.
  const loadLocalBtn = $('loadLocal');
  if (loadLocalBtn && localFontsSupported()) {
    loadLocalBtn.hidden = false;
    loadLocalBtn.addEventListener('click', async () => {
      const orig = loadLocalBtn.textContent;
      try {
        const fams = await queryInstalledFamilies();
        const have = new Set(bodyFams);
        let added = 0;
        for (const f of fams) if (!have.has(f)) { bodyFams.push(f); have.add(f); added += 1; }
        buildPickers();
        loadLocalBtn.textContent = `✓ ${added}개 추가됨`;
      } catch {
        loadLocalBtn.textContent = '권한 거부됨';
      }
      setTimeout(() => { loadLocalBtn.textContent = orig; }, 1600);
    });
  }

  // ---- source segmented control ----
  function reflectSource(source) {
    [...$('srcSeg').querySelectorAll('button')].forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.src === source));
    });
    $('srcSystem').hidden = (source !== 'system');
    $('srcWeb').hidden = (source === 'system');
  }
  $('srcSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.source = b.dataset.src;
    reflectSource(state.source);
    scheduleLiveApply();
  });
  reflectSource(state.source);

  // ---- web-type segmented control ----
  function reflectWebType(urlType) {
    [...$('webTypeSeg').querySelectorAll('button')].forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.wt === urlType));
    });
    $('webFamilyWrap').hidden = (urlType !== 'file');
    $('webUrl').placeholder = (urlType === 'file')
      ? 'https://example.com/font.woff2'
      : 'https://fonts.googleapis.com/css2?family=…';
  }
  $('webTypeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.urlType = b.dataset.wt;
    reflectWebType(state.urlType);
  });
  reflectWebType(state.urlType);

  // ---- web inputs ----
  $('webUrl').value = state.url;
  $('webUrl').addEventListener('input', (e) => { state.url = e.target.value; });
  $('webFamily').value = (state.source === 'weburl') ? state.family : '';
  $('webFamily').addEventListener('input', (e) => { state.family = e.target.value; });

  // font-display: optional (file URL only) — minimizes layout shift on swap.
  const ckOptional = $('ckOptional');
  toggleCheck(ckOptional, (on) => { state.webfontDisplay = on ? 'optional' : 'swap'; scheduleLiveApply(); });
  ckOptional.setAttribute('aria-checked', String(state.webfontDisplay === 'optional'));
  ckOptional.classList.toggle('on', state.webfontDisplay === 'optional');

  // ---- code check ----
  toggleCheck($('ckCode'), (on) => { state.codeEnabled = on; $('codeWrap').hidden = !on; scheduleLiveApply(); });
  const ckCode = $('ckCode');
  ckCode.setAttribute('aria-checked', String(!!state.codeEnabled));
  ckCode.classList.toggle('on', !!state.codeEnabled);
  $('codeWrap').hidden = !state.codeEnabled;

  // ---- late web-font repaint (fonts may load after mount) ----
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      bp.refresh && bp.refresh();
      cp.refresh && cp.refresh();
    });
  }

  // ---- scope (blocklist + current site) + protection (page fonts) ----
  const blocklistEl = $('blocklist');
  blocklistEl.value = state.blocklist.join('\n');
  blocklistEl.addEventListener('input', () => {
    state.blocklist = blocklistEl.value.split('\n').map((s) => s.trim()).filter(Boolean);
    scheduleLiveApply();
  });
  const protectEl = $('protect');
  protectEl.value = state.protectExtra.join('\n');
  protectEl.addEventListener('input', () => {
    state.protectExtra = protectEl.value.split('\n').map((s) => s.trim()).filter(Boolean);
    scheduleLiveApply();
  });

  const host = ctx.currentHost || '';
  const curHost = $('curHost');
  const addHost = $('addHost');
  if (ctx.context === 'options' || !host) {
    curHost.textContent = '현재 사이트 없음 — 팝업에서 사이트별로 설정';
    addHost.disabled = true;
  } else {
    curHost.textContent = host;
    addHost.addEventListener('click', () => {
      const lines = blocklistEl.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (!lines.includes(host)) { lines.push(host); }
      blocklistEl.value = lines.join('\n');
      state.blocklist = lines.slice();
      scheduleLiveApply();
      const orig = addHost.textContent;
      addHost.textContent = '✓ 추가됨';
      setTimeout(() => { addHost.textContent = orig; }, 1200);
    });
  }

  // per-site element exclusions (manualExclusions[host] = [css selectors])
  const selEl = $('selExclude');
  const selNote = $('selNote');
  if (ctx.context === 'options' || !host) {
    selEl.style.display = 'none';
    selNote.style.display = '';
    selNote.textContent = '팝업에서 사이트별로 설정하세요.';
  } else {
    selEl.value = (state.manualExclusions[host] || []).join('\n');
    selEl.addEventListener('input', () => {
      const list = selEl.value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (list.length) state.manualExclusions[host] = list;
      else delete state.manualExclusions[host];
      scheduleLiveApply();
    });
  }

  const pageFonts = ctx.pageFonts || [];
  const chips = $('pageFonts');
  chips.replaceChildren();
  if (!pageFonts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = (ctx.context === 'options')
      ? '팝업에서 페이지별로 확인'
      : '이 페이지에서 감지된 폰트 없음';
    chips.appendChild(empty);
  } else {
    for (const pf of pageFonts) {
      const c = document.createElement('div');
      c.className = 'chip';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.style.fontFamily = "'" + pf.name + "', sans-serif";
      nm.textContent = pf.name;
      const tag = document.createElement('span');
      tag.className = 'tag ' + (pf.protected ? 'prot' : 'body');
      tag.textContent = pf.protected ? '기능성' : '본문';
      const plus = document.createElement('button');
      plus.className = 'plus';
      plus.title = '보호 목록에 추가';
      plus.textContent = '+';
      plus.addEventListener('click', () => {
        const lines = protectEl.value.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!lines.includes(pf.name)) { lines.push(pf.name); }
        protectEl.value = lines.join('\n');
        state.protectExtra = lines.slice();
        c.classList.add('added');
        plus.textContent = '✓';
      });
      c.appendChild(nm); c.appendChild(tag); c.appendChild(plus);
      chips.appendChild(c);
    }
  }

  // ---- actions ----
  const send = ctx.send || ((m) => browser.runtime.sendMessage(m));

  // Save
  const saveBtn = $('save');
  saveBtn.addEventListener('click', () => {
    send({ type: MSG.SAVE_SETTINGS, payload: stateToSettings(state) });
    const orig = saveBtn.textContent;
    saveBtn.textContent = '✓ 저장됨';
    saveBtn.classList.add('saved');
    setTimeout(() => { saveBtn.textContent = orig; saveBtn.classList.remove('saved'); }, 1200);
  });

  // Export
  $('export').addEventListener('click', () => {
    const json = serializeSettings({ ...DEFAULTS, ...stateToSettings(state) });
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'refont-settings.json';
    a.click();
  });

  // Import (hidden file input created dynamically)
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.style.display = 'none';
  root.appendChild(fileInput);
  $('import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const payload = parseSettings(await file.text());
      await send({ type: MSG.SAVE_SETTINGS, payload });
      location.reload();
    } catch {
      const orig = saveBtn.textContent;
      saveBtn.textContent = '잘못된 파일';
      setTimeout(() => { saveBtn.textContent = orig; }, 1500);
    }
  });

  // Full-screen (popup only)
  const fullBtn = $('full');
  if (ctx.context === 'popup') {
    fullBtn.addEventListener('click', () => { browser.runtime.openOptionsPage(); window.close(); });
  } else {
    fullBtn.hidden = true;
  }

  // ---- power toggle ----
  const toggle = $('toggle');
  const toggleLbl = $('toggleLbl');
  const popupEl = $('popup');
  function setToggle(on) {
    toggle.setAttribute('aria-checked', String(on));
    toggle.classList.toggle('on', on);
    popupEl.classList.toggle('off', !on);
  }
  if (ctx.context === 'popup') {
    const host = ctx.currentHost || '';
    let on = !ctx.blocked;
    setToggle(on);
    toggleLbl.textContent = on ? '이 사이트 켜짐' : '이 사이트 꺼짐';
    toggle.addEventListener('click', () => {
      on = !on;
      setToggle(on);
      toggleLbl.textContent = on ? '이 사이트 켜짐' : '이 사이트 꺼짐';
      // keep state.blocklist in sync (off => host present)
      const set = new Set(state.blocklist);
      if (on) set.delete(host); else if (host) set.add(host);
      state.blocklist = [...set];
      const blEl = $('blocklist'); if (blEl) blEl.value = state.blocklist.join('\n');
      send({ type: MSG.TOGGLE_SITE, url: ctx.currentUrl || host });
    });
  } else {
    let on = state.enabled !== false;
    setToggle(on);
    toggleLbl.textContent = on ? '전체 켜짐' : '전체 꺼짐';
    toggle.addEventListener('click', () => {
      on = !on;
      state.enabled = on;
      setToggle(on);
      toggleLbl.textContent = on ? '전체 켜짐' : '전체 꺼짐';
    });
  }

  // ---- reset to defaults (two-click confirm; resets the form, live-applies, persists on Save) ----
  const resetBtn = $('reset');
  let resetArmed = false; let resetTimer;
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = '한번 더 눌러 초기화';
      resetBtn.classList.add('confirm');
      resetTimer = setTimeout(() => {
        resetArmed = false; resetBtn.textContent = '기본값으로 초기화'; resetBtn.classList.remove('confirm');
      }, 3000);
      return;
    }
    clearTimeout(resetTimer);
    root.replaceChildren();
    const fresh = mountSettingsUI(root, { ...ctx, settings: DEFAULTS });
    fresh.scheduleLiveApply();
  });

  // ---- live apply to the current tab (debounced; popup only, transient until Save) ----
  const previewTab = ctx.previewSend
    || ((s) => { try { browser.tabs.sendMessage(ctx.tabId, { type: MSG.PREVIEW_SETTINGS, settings: s }); } catch {} });
  let liveTimer;
  scheduleLiveApply = () => {
    if (!ready || ctx.context !== 'popup' || ctx.tabId == null) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => previewTab(stateToSettings(state)), 300);
  };
  if (ctx.context === 'popup' && ctx.tabId != null && typeof window !== 'undefined' && window.addEventListener) {
    // Best-effort revert of an unsaved live preview when the popup closes.
    window.addEventListener('pagehide', () => { try { browser.tabs.sendMessage(ctx.tabId, { type: MSG.REAPPLY }); } catch {} });
  }

  ready = true; // gate live-apply so the initial mount doesn't fire it
  const api = { root, ctx, state, applyPreview, scheduleLiveApply };
  return api;
}
