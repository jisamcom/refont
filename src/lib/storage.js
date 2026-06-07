// src/lib/storage.js
import browser from 'webextension-polyfill';

export const SCHEMA_VERSION = 3;

export const DEFAULTS = {
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  bodyFont: { source: 'system', name: '', url: null, urlType: 'css' },
  webfontDisplay: 'swap', // @font-face font-display for a fetched file URL: 'swap' | 'optional'
  codeFont: null, // null = leave code/monospace untouched
  scale: 1,
  minSize: 0,
  weight: 0,
  width: 0,              // font-stretch %; 0 = keep original (off)
  opticalSizing: 'auto', // 'auto' (browser default) | 'none' (disable optical sizing)
  preserveBold: true,
  lineHeight: 0,
  letterSpacing: 0,
  wordSpacing: 0,    // px; 0 = off (WCAG 1.4.12 text-spacing helper)
  axes: '',          // raw variable-axis string, e.g. "opsz 14, wdth 80"
  weightFine: false, // weight slider continuous (variable) vs 100-step
  blocklist: [],
  manualExclusions: {},
  protectionDenylistExtra: [],
  recentFonts: { body: [], code: [] }, // recently picked fonts, per picker kind
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
