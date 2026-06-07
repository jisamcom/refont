// src/lib/engine.js
// Pure font-replacement math. No DOM/browser access.

const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

export function sanitizeFamilyName(name) {
  return String(name || '').replace(/["\\;{}<>]/g, '').trim();
}

export function fontStack(name, generic = 'sans-serif') {
  const safe = sanitizeFamilyName(name);
  if (!safe) return `${EMOJI_FONTS}, ${generic}`;
  return `"${safe}", ${EMOJI_FONTS}, ${generic}`;
}

// Allowed @font-face font-display keywords. Refont only surfaces 'swap' (default;
// no FOIT) and 'optional' (minimize layout shift — the browser uses the custom
// font only if it's ready almost immediately, else keeps the fallback for the
// page's lifetime; with our inlined data: URL it's effectively always ready, so
// 'optional' buys near-zero CLS), but the others are accepted if ever passed in.
export const WEBFONT_DISPLAY_VALUES = ['swap', 'optional', 'auto', 'block', 'fallback'];

export function sanitizeFontDisplay(v) {
  return WEBFONT_DISPLAY_VALUES.includes(v) ? v : 'swap';
}

// Parse "opsz 14, wdth 80, slnt -6" -> [{tag:'opsz', val:'14'}, ...]. Drops malformed pairs.
export function parseAxes(str) {
  return String(str || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^([A-Za-z]{2,4})\s+(-?\d+(?:\.\d+)?)$/);
      return m ? { tag: m[1], val: m[2] } : null;
    })
    .filter(Boolean);
}

// Split the free-text variable-axis field into standard CSS properties vs
// font-variation-settings. MDN guidance: drive *registered* axes through their
// standard property (font-weight/font-stretch/font-style), and reserve
// font-variation-settings for *custom* (uppercase-tagged) axes — it's a
// low-level override that otherwise bypasses the cascade.
//
//   wght → font-weight        wdth → font-stretch (%)
//   slnt → font-style: oblique <angle>   (CSS oblique angle is the negative of
//                                          the OpenType slnt value)
//   ital → font-style: italic|normal
//   opsz → no numeric standard property exists, so a *numeric* opsz stays in
//          font-variation-settings (the auto/none switch is font-optical-sizing,
//          surfaced separately as a toggle, not here).
//
// wght/wdth are owned by the dedicated weight/width dials; a value typed in the
// text field is honored only when that dial is OFF (weight 0 / width 0), so the
// dial stays the single source of truth and the two never emit a conflicting
// rule for the same property.
export function splitTextAxes(settings) {
  const s = settings || {};
  const std = {};      // { 'font-weight': '600', 'font-stretch': '80%', ... }
  const custom = [];   // ["'GRAD' 50", "'opsz' 14"]  → font-variation-settings
  for (const a of parseAxes(s.axes)) {
    const lower = a.tag.toLowerCase();
    if (lower === 'wght') { if (!(s.weight > 0)) std['font-weight'] = a.val; }
    else if (lower === 'wdth') { if (!(s.width > 0)) std['font-stretch'] = `${a.val}%`; }
    else if (lower === 'slnt') { std['font-style'] = `oblique ${-Number(a.val)}deg`; }
    else if (lower === 'ital') { std['font-style'] = Number(a.val) >= 1 ? 'italic' : 'normal'; }
    else custom.push(`'${a.tag}' ${a.val}`);
  }
  return { std, custom };
}

// ---- CSS-variable engine ----
// Scaling is per-element (newSize = originalSize × scale), but the *value* of
// scale/weight/family is global. So we tag each element once and drive the
// actual values through CSS custom properties: a live-preview edit then sets one
// variable instead of re-walking the DOM. Crucially we never overwrite the
// author's own inline font props — we read a Refont-only `--fc-base-size` and a
// stylesheet rule, so removal is automatic and lossless.

// The constant rule skeleton — just font-family, which every active state wants.
// Values come from variables set on documentElement (--refont-*).
export function buildSkeletonCss() {
  return [
    '[data-fc]{font-family:var(--refont-body-stack) !important;}',
    '[data-fc-code]{font-family:var(--refont-code-stack,monospace) !important;}',
  ].join('\n');
}

// True when the user is actually resizing text. When off we must NOT emit a
// font-size rule: pinning every element to a fixed px with !important would
// break the page's own responsive/fluid sizing (the default is scale 1 / min 0).
export function sizingActive(settings) {
  const s = settings || {};
  return (s.scale && s.scale !== 1) || (s.minSize && s.minSize > 0);
}

// Rules that depend on *which* features are on (not their numeric values, which
// are variables). Rebuilt only when sizing turns on/off, weight on/off,
// preserveBold, line-height, letter-spacing, or axes change — each an O(1)
// stylesheet swap, no DOM walk. Weight respects preserveBold by selecting
// buckets: light always, bold only when not preserving. size/line-height/
// letter-spacing/axes skip code or follow the original behaviour.
export function buildDynamicCss(settings) {
  const s = settings || {};
  const rules = [];
  if (sizingActive(s)) {
    // base × scale, floored at min (min acts as an absolute floor; 0 is a no-op).
    rules.push('[data-fc-size]{font-size:max(calc(var(--fc-base-size) * var(--refont-scale,1)), var(--refont-min,0px)) !important;}');
  }
  if ((s.weight || 0) > 0) {
    rules.push('[data-fc-wlight]{font-weight:var(--refont-weight) !important;}');
    if (s.preserveBold === false) rules.push('[data-fc-wbold]{font-weight:var(--refont-weight) !important;}');
  }
  if (s.lineHeight && s.lineHeight > 0) {
    rules.push(`[data-fc]:not([data-fc-code]){line-height:${s.lineHeight} !important;}`);
  }
  if (s.letterSpacing && s.letterSpacing !== 0) {
    rules.push(`[data-fc]:not([data-fc-code]){letter-spacing:${s.letterSpacing}px !important;}`);
  }
  if (s.wordSpacing && s.wordSpacing > 0) {
    rules.push(`[data-fc]:not([data-fc-code]){word-spacing:${s.wordSpacing}px !important;}`);
  }
  // Width dial → font-stretch via a variable (cheap to drag, like weight).
  if ((s.width || 0) > 0) {
    rules.push('[data-fc]:not([data-fc-code]){font-stretch:var(--refont-width) !important;}');
  }
  // Optical-sizing toggle. 'auto' is the browser default → emit nothing; only
  // 'none' needs a rule to switch automatic optical sizing off.
  if (s.opticalSizing === 'none') {
    rules.push('[data-fc]:not([data-fc-code]){font-optical-sizing:none !important;}');
  }
  // Free-text axes: registered axes as standard properties, custom as FVS.
  const { std, custom } = splitTextAxes(s);
  const stdDecls = Object.entries(std).map(([prop, val]) => `${prop}:${val} !important`);
  if (stdDecls.length) {
    rules.push(`[data-fc]:not([data-fc-code]){${stdDecls.join(';')};}`);
  }
  if (custom.length) {
    rules.push(`[data-fc]:not([data-fc-code]){font-variation-settings:${custom.join(',')} !important;}`);
  }
  return rules.join('\n');
}

// The global variables to set on documentElement. A value-only preview edit just
// re-sets these. --refont-weight is omitted when weight is 0 (keep original).
export function engineVars(settings) {
  const s = settings || {};
  const vars = {
    '--refont-body-stack': fontStack(s.bodyFont && s.bodyFont.name),
    '--refont-code-stack': fontStack((s.codeFont && s.codeFont.name) || '', 'monospace'),
    '--refont-scale': String(s.scale || 1),
    '--refont-min': `${s.minSize || 0}px`,
  };
  if ((s.weight || 0) > 0) vars['--refont-weight'] = String(s.weight);
  if ((s.width || 0) > 0) vars['--refont-width'] = `${s.width}%`;
  return vars;
}

export const ENGINE_VAR_NAMES = ['--refont-body-stack', '--refont-code-stack', '--refont-scale', '--refont-min', '--refont-weight', '--refont-width'];

// Classify a tagged element from its *original* computed font props. sizePx>0
// → the element carries --fc-base-size and the scaling rule applies. The weight
// bucket lets preserveBold be a stylesheet toggle rather than a per-element
// recompute. Pure: computed = { fontSize:number(px), fontWeight:number }.
export function elementBase(computed) {
  const c = computed || {};
  const sizePx = c.fontSize > 0 ? c.fontSize : 0;
  const weightBucket = (c.fontWeight || 400) <= 400 ? 'light' : 'bold';
  return { sizePx, weightBucket };
}
