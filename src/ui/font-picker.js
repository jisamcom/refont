// src/ui/font-picker.js
import { labelOf } from './font-names.js';
import { sanitizeFamilyName } from '../lib/engine.js';

// Family names can arrive from imported settings or free-text "직접 입력". Never
// interpolate them into innerHTML (a crafted name is a DOM-injection/XSS vector
// on this privileged extension page). Build a quoted, sanitized CSS family
// instead and assign it through the CSSOM, which cannot break out into markup.
function famStack(name, generic = 'sans-serif') {
  const safe = sanitizeFamilyName(name);
  return safe ? `'${safe}',${generic}` : generic;
}

// Pure: filter option objects by query against family + Korean name.
export function filterFonts(fonts, q) {
  const ql = String(q || '').trim().toLowerCase();
  if (!ql) return fonts.slice();
  return fonts.filter((o) => o.f.toLowerCase().includes(ql) || (o.ko && o.ko.toLowerCase().includes(ql)));
}

// Distinct id prefix per picker instance so aria-controls / aria-activedescendant
// (and the option ids they point at) are unique when several pickers coexist.
let pickerSeq = 0;

// fonts: [{f, ko?}]; value: css family string; sample: swatch text; onChange(family)
// recent: optional array of family strings (or a function returning one) shown in a "최근" group.
export function makeFontPicker(mount, { fonts, value, sample = 'Aa가', onChange, recent }) {
  const uid = `fp${pickerSeq++}`;
  let val = value;
  let custom = !fonts.some((o) => o.f === value);
  // Build via DOM APIs (no innerHTML) — keeps AMO's static-analysis happy and is
  // injection-proof by construction.
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const btn = el('button', 'fp-btn'); btn.type = 'button';
  const bSamp = el('span', 'fp-sample');
  const bName = el('span', 'fp-name');
  const cv = el('span', 'fp-cv'); cv.textContent = '⌄';
  btn.append(bSamp, bName, cv);
  const panel = el('div', 'fp-panel'); panel.hidden = true;
  const listId = `${uid}-list`;
  const search = el('input', 'fp-search'); search.placeholder = '검색 또는 직접 입력…';
  search.setAttribute('role', 'combobox'); search.setAttribute('aria-autocomplete', 'list'); search.setAttribute('aria-expanded', 'false');
  search.setAttribute('aria-controls', listId);
  const list = el('div', 'fp-list'); list.setAttribute('role', 'listbox'); list.id = listId;
  panel.append(search, list);
  mount.replaceChildren(btn, panel);
  const labFor = (fam) => { const o = fonts.find((x) => x.f === fam); return o ? (o.ko || o.f).replace(' Variable', '') : labelOf(fam); };
  const paintBtn = () => {
    bSamp.style.fontFamily = famStack(val); bSamp.textContent = sample;
    bName.textContent = labFor(val); bName.classList.toggle('custom', custom);
  };
  const optFor = (fam) => fonts.find((x) => x.f === fam) || { f: fam };
  const labOf = (o) => (o.ko || o.f).replace(' Variable', '');
  const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; if (text != null) s.textContent = text; return s; };
  function addRow(o) {
    const f = o.f; const lab = labOf(o);
    const row = document.createElement('div');
    row.className = 'fp-opt' + (f === val ? ' sel' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(f === val));
    const name = span('o-name', lab); name.style.fontFamily = famStack(f);
    const spec = span('o-spec', `${sample} 012`); spec.style.fontFamily = famStack(f);
    row.append(span('o-check', '✓'), name, spec);
    row.onclick = () => pick(f, false);
    list.appendChild(row);
  }
  function group(label) {
    const g = document.createElement('div'); g.className = 'fp-group'; g.textContent = label; list.appendChild(g);
  }
  function render(q = '') {
    list.replaceChildren();
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
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
      row.append(span('o-check', '✓'), span('o-name', `직접 사용: "${typed}"`), span('badge', 'custom'));
      row.onclick = () => pick(typed, true); list.appendChild(row);
    }
    if (!list.children.length) { list.textContent = ''; list.append(span('fp-empty', '결과 없음 — 입력해서 직접 지정하세요')); }
    // Give each option a stable id so aria-activedescendant can reference it, and
    // reset the keyboard highlight whenever the list is rebuilt.
    rows().forEach((r, i) => { r.id = `${uid}-opt-${i}`; });
    active = -1;
    search.removeAttribute('aria-activedescendant');
  }
  // Keyboard combobox: Arrow keys move a highlight over the option rows, Enter
  // picks it (or the first row), Escape closes. Options are click-only <div>s, so
  // without this they can't be reached by keyboard at all.
  let active = -1;
  const rows = () => [...list.querySelectorAll('.fp-opt')];
  function highlight(i) {
    const rs = rows();
    if (!rs.length) { active = -1; search.removeAttribute('aria-activedescendant'); return; }
    active = (i + rs.length) % rs.length;
    // `active` is the keyboard highlight, tracked via .active + aria-activedescendant.
    // aria-selected stays reserved for the CHOSEN value (set in addRow), so moving
    // the highlight never mislabels the current selection as unselected.
    rs.forEach((r, idx) => {
      const on = idx === active;
      r.classList.toggle('active', on);
      if (on) { try { r.scrollIntoView && r.scrollIntoView({ block: 'nearest' }); } catch {} }
    });
    search.setAttribute('aria-activedescendant', rs[active].id);
  }
  const open = () => { mount.classList.add('open'); panel.hidden = false; search.setAttribute('aria-expanded', 'true'); search.value = ''; render(''); search.focus(); };
  const close = () => { mount.classList.remove('open'); panel.hidden = true; search.setAttribute('aria-expanded', 'false'); search.removeAttribute('aria-activedescendant'); };
  function pick(f, isCustom) { val = f; custom = isCustom; paintBtn(); close(); onChange && onChange(f); }
  btn.onclick = () => (mount.classList.contains('open') ? close() : open());
  search.oninput = () => render(search.value);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const rs = rows(); (active >= 0 ? rs[active] : rs[0])?.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
  });
  document.addEventListener('click', (e) => { if (!mount.contains(e.target)) close(); });
  paintBtn();
  return { get value() { return val; }, refresh: paintBtn };
}
