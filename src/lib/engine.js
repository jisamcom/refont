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

// Returns a user-origin stylesheet string. Targets only opted-in [data-fc]/[data-fc-code].
export function buildCss(settings) {
  const s = settings || {};
  const rules = [];
  const bodyName = s.bodyFont && s.bodyFont.name;
  rules.push(`[data-fc]{font-family:${fontStack(bodyName)} !important;}`);
  if (s.codeFont && s.codeFont.name) {
    rules.push(`[data-fc-code]{font-family:${fontStack(s.codeFont.name, 'monospace')} !important;}`);
  }
  if (s.lineHeight && s.lineHeight > 0) {
    rules.push(`[data-fc]{line-height:${s.lineHeight} !important;}`);
  }
  if (s.letterSpacing && s.letterSpacing !== 0) {
    rules.push(`[data-fc]{letter-spacing:${s.letterSpacing}px !important;}`);
  }
  const axes = parseAxes(s.axes);
  if (axes.length) {
    const decl = axes.map((a) => `'${a.tag}' ${a.val}`).join(',');
    rules.push(`[data-fc]{font-variation-settings:${decl} !important;}`);
  }
  return rules.join('\n');
}

// computed: { fontSize:number(px), fontWeight:number }
// Returns { fontSize?:string, fontWeight?:string } — only keys that should change.
export function computeElementInline(computed, settings) {
  const out = {};
  const s = settings || {};
  const scale = s.scale || 1;
  const minSize = s.minSize || 0;
  const weight = s.weight || 0;
  const preserveBold = s.preserveBold !== false;

  const base = computed && computed.fontSize;
  if (base && base > 0) {
    let target = base * scale;
    if (minSize > 0 && target < minSize) target = minSize;
    if (Math.abs(target - base) > 0.01) {
      out.fontSize = `${Math.round(target * 100) / 100}px`;
    }
  }
  if (weight > 0) {
    const cw = (computed && computed.fontWeight) || 400;
    if (!preserveBold || cw <= 400) out.fontWeight = String(weight);
  }
  return out;
}
