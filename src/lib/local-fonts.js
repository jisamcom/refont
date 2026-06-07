// src/lib/local-fonts.js
// Local Font Access API — exact installed-font enumeration via
// window.queryLocalFonts(). Chromium/Edge desktop only (NOT Baseline; absent in
// Firefox, Safari, and all mobile), requires a secure context, the 'local-fonts'
// permission, AND transient user activation, and is restricted to the top/self
// frame. So it can only run from the extension page (popup/options) behind a user
// gesture — never silently on page load or in cross-origin subframes. Everywhere
// it's unavailable, callers fall back to the canvas-heuristic list (font-detect).

export function localFontsSupported() {
  return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
}

// Pure: collapse a FontData[] (each exposes only family/fullName/postscriptName/
// style) to a sorted, unique list of family names — what the picker consumes.
export function dedupeFamilies(fontData) {
  const seen = new Set();
  const out = [];
  for (const fd of fontData || []) {
    const fam = fd && fd.family;
    if (fam && !seen.has(fam)) { seen.add(fam); out.push(fam); }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// Must be called from a user gesture in the extension page. Resolves to a family
// list, or rejects (permission denied / unsupported / not a user gesture) — the
// caller is expected to catch and fall back to the heuristic list.
export async function queryInstalledFamilies() {
  if (!localFontsSupported()) throw new Error('Local Font Access API unavailable');
  const data = await window.queryLocalFonts();
  return dedupeFamilies(data);
}
