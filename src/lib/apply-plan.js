// src/lib/apply-plan.js
// Decide whether a settings change needs a full DOM rescan or just a cheap
// value update on the already-tagged elements.
//
// A full rescan re-walks the document calling getComputedStyle per text element
// — O(page DOM). Doing that on every debounced live-preview keystroke is the
// P1 cost. Most preview edits (scale, weight, line-height, spacing, axes, a
// system family swap) change only *values*, not *which* elements get tagged, so
// they can reuse the cached tag set instead of re-scanning.
//
// A full rescan is needed only when the set of tagged elements can change:
//   - enabled / blocklist        → whether we run at all
//   - protection denylist        → shouldProtect() verdict per element
//   - manual per-site exclusions → matchesManualExclusion() verdict
//   - code-font on/off           → whether <code> etc. get tagged
//   - web-font identity          → @font-face must be (re)injected

const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// A web font is only (re)fetched/injected when its source identity changes.
// A *system* family swap is just a stylesheet edit, so it collapses to 'system'.
// font-display rides along: it's baked into the @font-face, so changing it must
// re-inject the web-font <style> (only the file path emits it, but a no-op for
// the css/@import path is harmless).
export function webfontSig(s) {
  const bf = (s && s.bodyFont) || {};
  if (bf.source !== 'weburl') return 'system';
  return `weburl|${bf.url || ''}|${bf.urlType || ''}|${bf.name || ''}|${(s && s.webfontDisplay) || ''}`;
}

export function needsFullRescan(prev, next) {
  if (!prev || !next) return true;
  if (prev.enabled !== next.enabled) return true;
  if (!eq(prev.blocklist, next.blocklist)) return true;
  if (!eq(prev.protectionDenylistExtra, next.protectionDenylistExtra)) return true;
  if (!eq(prev.manualExclusions, next.manualExclusions)) return true;
  const codeOn = (s) => Boolean(s.codeFont && s.codeFont.name);
  if (codeOn(prev) !== codeOn(next)) return true;
  if (webfontSig(prev) !== webfontSig(next)) return true;
  return false;
}
