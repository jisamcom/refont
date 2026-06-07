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
  const axes = parseAxes(s.axes);
  if (axes.length) {
    const decl = axes.map((a) => `'${a.tag}' ${a.val}`).join(',');
    rules.push(`[data-fc]:not([data-fc-code]){font-variation-settings:${decl} !important;}`);
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
  return vars;
}

export const ENGINE_VAR_NAMES = ['--refont-body-stack', '--refont-code-stack', '--refont-scale', '--refont-min', '--refont-weight'];

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
