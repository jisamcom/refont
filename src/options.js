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
    a.download = 'refont-settings.json';
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
