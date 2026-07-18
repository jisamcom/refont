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
  language: 'auto',  // UI language: 'auto' (follow browser) | 'ko' | 'en'
};

const WEBFONT_DISPLAYS = new Set(['swap', 'optional', 'auto', 'block', 'fallback']);
const FONT_SOURCES = new Set(['system', 'weburl']);
const FONT_URL_TYPES = new Set(['css', 'file']);
const LANGUAGES = new Set(['auto', 'ko', 'en']);

const isRecord = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const finiteNumber = (v, fallback, min, max) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
};
const boundedString = (v, fallback = '', max = 2048) => (
  typeof v === 'string' ? v.slice(0, max) : fallback
);
const stringList = (v, maxItems, maxLength) => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => typeof x === 'string')
    .map((x) => x.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

function normalizeFont(v, fallback, { nullable = false } = {}) {
  if (nullable && v == null) return null;
  if (!isRecord(v)) return nullable ? null : { ...fallback };
  const source = FONT_SOURCES.has(v.source) ? v.source : fallback.source;
  return {
    source,
    name: boundedString(v.name, fallback.name, 200).trim(),
    url: source === 'weburl' ? boundedString(v.url, '', 4096).trim() || null : null,
    urlType: FONT_URL_TYPES.has(v.urlType) ? v.urlType : fallback.urlType,
  };
}

// Treat imported JSON, storage contents, and runtime save payloads as untrusted.
// This keeps malformed values out of CSS template literals and prevents a bad
// settings file from bricking the popup on its next load.
export function normalizeSettings(input) {
  const s = isRecord(input) ? input : {};
  const bodyFont = normalizeFont(s.bodyFont, DEFAULTS.bodyFont);
  if (bodyFont.source !== 'weburl' && !bodyFont.name) bodyFont.name = DEFAULTS.bodyFont.name;

  const manualExclusions = {};
  if (isRecord(s.manualExclusions)) {
    for (const [host, selectors] of Object.entries(s.manualExclusions).slice(0, 200)) {
      const safeHost = boundedString(host, '', 255).trim();
      const safeSelectors = stringList(selectors, 100, 500);
      if (safeHost && safeSelectors.length) manualExclusions[safeHost] = safeSelectors;
    }
  }

  const recent = isRecord(s.recentFonts) ? s.recentFonts : {};
  const weight = s.weight === 0 ? 0 : finiteNumber(s.weight, DEFAULTS.weight, 100, 900);
  const width = s.width === 0 ? 0 : finiteNumber(s.width, DEFAULTS.width, 50, 200);

  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULTS.enabled,
    bodyFont,
    webfontDisplay: WEBFONT_DISPLAYS.has(s.webfontDisplay) ? s.webfontDisplay : DEFAULTS.webfontDisplay,
    codeFont: normalizeFont(s.codeFont, { source: 'system', name: '', url: null, urlType: 'css' }, { nullable: true }),
    scale: finiteNumber(s.scale, DEFAULTS.scale, 0.5, 2.5),
    minSize: finiteNumber(s.minSize, DEFAULTS.minSize, 0, 24),
    weight,
    width,
    opticalSizing: s.opticalSizing === 'none' ? 'none' : 'auto',
    preserveBold: typeof s.preserveBold === 'boolean' ? s.preserveBold : DEFAULTS.preserveBold,
    lineHeight: finiteNumber(s.lineHeight, DEFAULTS.lineHeight, 0, 2.6),
    letterSpacing: finiteNumber(s.letterSpacing, DEFAULTS.letterSpacing, -0.05, 0.3),
    wordSpacing: finiteNumber(s.wordSpacing, DEFAULTS.wordSpacing, 0, 0.5),
    axes: boundedString(s.axes, DEFAULTS.axes, 500),
    weightFine: typeof s.weightFine === 'boolean' ? s.weightFine : DEFAULTS.weightFine,
    blocklist: stringList(s.blocklist, 500, 500),
    manualExclusions,
    protectionDenylistExtra: stringList(s.protectionDenylistExtra, 200, 200),
    recentFonts: {
      body: stringList(recent.body, 5, 200),
      code: stringList(recent.code, 5, 200),
    },
    language: LANGUAGES.has(s.language) ? s.language : DEFAULTS.language,
  };
}

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
  return normalizeSettings(base);
}

export async function getSettings() {
  const stored = await browser.storage.local.get(null);
  return migrate(stored);
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...(isRecord(partial) ? partial : {}) });
  await browser.storage.local.set(next);
  return next;
}
