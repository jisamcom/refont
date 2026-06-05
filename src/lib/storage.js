// src/lib/storage.js
import browser from 'webextension-polyfill';

export const SCHEMA_VERSION = 2;

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
  axes: '',          // raw variable-axis string, e.g. "opsz 14, wdth 80"
  weightFine: false, // weight slider continuous (variable) vs 100-step
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
