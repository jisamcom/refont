// src/lib/storage.js
import browser from 'webextension-polyfill';

export const SCHEMA_VERSION = 4;

// Nominal font-size used to convert the legacy px letter/word-spacing values to
// the em units schema 4 stores (WCAG 1.4.12 is em-relative). Approximate — the
// old px value applied uniformly regardless of element size anyway.
const PX_TO_EM_BASE = 16;

export const DEFAULTS = {
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  bodyFont: { source: 'system', name: 'Pretendard Variable', url: null, urlType: 'css' },
  webfontDisplay: 'swap', // @font-face font-display for a fetched file URL: 'swap' | 'optional'
  codeFont: null, // null = leave code/monospace untouched
  scale: 1,
  minSize: 0,
  weight: 0,
  width: 0,              // font-stretch %; 0 = keep original (off)
  opticalSizing: 'auto', // 'auto' (browser default) | 'none' (disable optical sizing)
  preserveBold: true,
  lineHeight: 0,
  letterSpacing: 0,  // em (relative to font-size); 0 = off. WCAG 1.4.12 ≥ 0.12em
  wordSpacing: 0,    // em; 0 = off. WCAG 1.4.12 ≥ 0.16em
  axes: '',          // raw variable-axis string, e.g. "opsz 14, wdth 80"
  weightFine: false, // weight slider continuous (variable) vs 100-step
  blocklist: [],
  manualExclusions: {},
  protectionDenylistExtra: [],
  recentFonts: { body: [], code: [] }, // recently picked fonts, per picker kind
};

// Merge stored settings over DEFAULTS (forward-compatible). Future schema
// bumps add `if (prevVer < N) { ...transform... }` branches here.
export function migrate(stored) {
  const base = { ...DEFAULTS };
  const prevVer = (stored && typeof stored.schemaVersion === 'number') ? stored.schemaVersion : 0;
  if (stored && typeof stored === 'object') {
    for (const k of Object.keys(DEFAULTS)) {
      if (k in stored && stored[k] !== undefined) base[k] = stored[k];
    }
  }
  // schema 4: letter/word-spacing moved from px to em (WCAG 1.4.12 is em-relative).
  // Convert legacy px values; only touch settings actually saved before v4.
  if (prevVer > 0 && prevVer < 4) {
    if (typeof base.letterSpacing === 'number' && base.letterSpacing !== 0) {
      base.letterSpacing = +(base.letterSpacing / PX_TO_EM_BASE).toFixed(3);
    }
    if (typeof base.wordSpacing === 'number' && base.wordSpacing !== 0) {
      base.wordSpacing = +(base.wordSpacing / PX_TO_EM_BASE).toFixed(3);
    }
  }
  // Self-heal a missing system body-font name. An empty name made fontStack('')
  // resolve to generic sans-serif, so it was silently FORCING sans-serif on the
  // whole page (looked like "not applying"). This happened to anyone who saved
  // without explicitly picking a font, or after a reset. Fall back to the same
  // default the picker shows. (weburl sources keep their own — empty there is a
  // separate incomplete-config case.)
  if (base.bodyFont && base.bodyFont.source !== 'weburl' && !base.bodyFont.name) {
    base.bodyFont = { ...base.bodyFont, name: DEFAULTS.bodyFont.name };
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
