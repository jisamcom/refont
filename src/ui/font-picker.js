// src/ui/font-picker.js
import { labelOf } from './font-names.js';

// Pure: filter option objects by query against family + Korean name.
export function filterFonts(fonts, q) {
  const ql = String(q || '').trim().toLowerCase();
  if (!ql) return fonts.slice();
  return fonts.filter((o) => o.f.toLowerCase().includes(ql) || (o.ko && o.ko.toLowerCase().includes(ql)));
}

// fonts: [{f, ko?}]; value: css family string; sample: swatch text; onChange(family)
// recent: optional array of family strings (or a function returning one) shown in a "최근" group.
export function makeFontPicker(mount, { fonts, value, sample = 'Aa가', onChange, recent }) {
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
  const optFor = (fam) => fonts.find((x) => x.f === fam) || { f: fam };
  const labOf = (o) => (o.ko || o.f).replace(' Variable', '');
  function addRow(o) {
    const f = o.f; const lab = labOf(o);
    const row = document.createElement('div');
    row.className = 'fp-opt' + (f === val ? ' sel' : '');
    row.innerHTML = `<span class="o-check">✓</span><span class="o-name" style="font-family:'${f}',sans-serif">${lab}</span><span class="o-spec" style="font-family:'${f}',sans-serif">${sample} 012</span>`;
    row.onclick = () => pick(f, false);
    list.appendChild(row);
  }
  function group(label) {
    const g = document.createElement('div'); g.className = 'fp-group'; g.textContent = label; list.appendChild(g);
  }
  function render(q = '') {
    list.innerHTML = '';
    const typed = String(q || '').trim();
    if (!typed) {
      const rec = (typeof recent === 'function' ? recent() : recent) || [];
      if (rec.length) {
        group('최근');
        for (const fam of rec) addRow(optFor(fam));
        group('전체');
      }
    }
    for (const o of filterFonts(fonts, q)) addRow(o);
    if (typed && !fonts.some((o) => o.f.toLowerCase() === typed.toLowerCase() || (o.ko && o.ko.toLowerCase() === typed.toLowerCase()))) {
      const row = document.createElement('div');
      row.className = 'fp-opt mk';
      row.innerHTML = `<span class="o-check">✓</span><span class="o-name">직접 사용: "${typed}"</span><span class="badge">custom</span>`;
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
