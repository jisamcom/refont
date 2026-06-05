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

const MARKUP = `<div class="popup" id="popup">

    <!-- ===== sticky top ===== -->
    <div class="top">
      <div class="brandrow">
        <div class="brand"><span class="mark">Refont<span class="dot">.</span></span><span class="ver">v0.1</span></div>
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
          </div>
        </div>
      </section>

      <!-- SIZE & RHYTHM -->
      <section>
        <div class="sec-h"><span class="t">Size &amp; rhythm</span><span class="rule"></span></div>

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
          <div class="row"><span class="name">자간</span><span class="val" id="vLs">0.0px</span></div>
          <input type="range" id="rLs" min="-1" max="4" step="0.1" value="0" />
        </div>
      </section>

      <!-- WEIGHT -->
      <section>
        <div class="sec-h"><span class="t">Weight</span><span class="rule"></span></div>
        <div class="ctl">
          <div class="row"><span class="name">두께</span><span class="val" id="vWeight">700</span></div>
          <input type="range" id="rWeight" min="100" max="900" step="100" value="700" />
          <div class="ticks" id="ticks"></div>
        </div>
        <div class="minirow">
          <span class="check on" id="ckPreserve" role="checkbox" aria-checked="true" tabindex="0"><span class="box"></span>볼드 위계 보존</span>
          <span class="check" id="ckFine" role="checkbox" aria-checked="false" tabindex="0"><span class="box"></span>미세조정 (variable)</span>
        </div>
        <details class="adv">
          <summary>추가 가변 축 (variable axes)</summary>
          <input type="text" id="axes" placeholder="예: opsz 14, wdth 80, slnt -6" style="margin-top:6px" />
          <div class="sec-h" style="margin:8px 0 0"><span class="hint" style="font-size:11px;color:var(--ink-dim)"><code>tag value</code> 쌍을 쉼표로. 폰트가 지원하는 축만 적용됩니다.</span></div>
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
        <div class="sec-h"><span class="t">이 사이트 제외</span><span class="rule"></span></div>
        <div class="site">
          <span class="host" id="curHost"><span class="scheme">https://</span>news.example.com<span class="scheme">/article/2026</span></span>
          <button class="btn-add" id="addHost">+ 추가</button>
        </div>
        <label class="field">블록리스트 (한 줄에 하나)</label>
        <textarea id="blocklist">docs.google.com/spreadsheets</textarea>
      </section>

      <!-- PROTECTION -->
      <section>
        <div class="sec-h"><span class="t">보호 폰트</span><span class="rule"></span><span class="hint">이 페이지에서 사용 중</span></div>
        <div class="chips" id="pageFonts"></div>
        <details class="adv" open>
          <summary>수동 보호 목록</summary>
          <textarea id="protect" placeholder="family명 일부 — 자동 감지가 놓친 아이콘/기능성 폰트" style="margin-top:6px"></textarea>
        </details>
      </section>

    </div>

    <!-- ===== sticky actions ===== -->
    <div class="actions">
      <button class="btn primary" id="save">저장</button>
      <button class="btn" id="export">내보내기</button>
      <button class="btn" id="import">가져오기</button>
      <button class="btn icon" id="full" title="전체 화면 옵션 탭으로 열기">⤢</button>
    </div>

  </div>`;

export function mountSettingsUI(root, ctx) {
  const settings = ctx.settings || DEFAULTS;
  const state = settingsToState(settings);
  document.body.classList.add(ctx.context === 'options' ? 'ctx-options' : 'ctx-popup');
  root.innerHTML = MARKUP;
  // Wiring is added in later tasks. Expose for those tasks/tests:
  const api = { root, ctx, state };
  return api;
}
