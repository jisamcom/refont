// src/lib/font-protection.js
// Decide whether an element renders a "functional" font that must NOT be replaced.
// Identifiers sourced from docs/superpowers/specs/2026-06-05-functional-fonts-protection-research.md

export const FONT_FAMILY_DENYLIST = [
  // Icon (HIGH)
  'font awesome', 'fontawesome', 'material icons', 'material symbols', 'codicon',
  'icomoon', 'katfont', 'pcgamer', 'etmodules', 'etbuilder', 'cloudapp',
  // Icon (MED)
  'ionicons', 'bootstrap-icons', 'glyphicons', 'glyphicon', 'octicons',
  'phosphor', 'tabler', 'dashicons', 'remixicon', 'typicons', 'boxicons',
  'weather icons', 'segoe fluent icons', 'segoe mdl2 assets', 'iconfont',
  // Math (HIGH) — prefixes matched via substring
  'katex_', 'mjxtex', 'mjxzero', 'mathjax_',
  // Math (MED)
  'stix two math', 'stix two text', 'stixgeneral', 'latin modern math', 'xits', 'asana math',
  // Music / SMuFL
  'bravura', 'petaluma', 'leland', 'gonville', 'gootville', 'emmentaler', 'sebastian', 'finale maestro',
  // Barcode
  'libre barcode', 'code128', 'code 128', 'code39', 'code 39', 'code 3 of 9', 'barcode', 'idautomation',
  // Dingbat / symbol
  'wingdings', 'webdings', 'marlett', 'zapf dingbats', 'dingbats',
  // Display / 7-seg
  'dseg', '7 segment', 'seven segment', '14 segment', 'nixie',
  // Anti-scraping (site-specific; prefer PUA heuristic)
  'stonefont',
  // Legacy / minority PUA
  'doulos', 'charis sil', 'andika', 'gentium',
  // Blank / sentinel
  'adobe blank', 'adobeblank',
];

// Generic tokens too dangerous to substring-match — only match as a whole family token.
export const FONT_FAMILY_DENYLIST_RISKY = ['symbol', 'maestro'];

// Weak secondary hint only. Never use alone (FA class prefixes were refuted as reliable).
export const ICON_CLASS_HINT_RE =
  /\b(fa|fas|far|fab|fal|fad|fa-solid|fa-regular|fa-brands|fa-light|fa-duotone|fa-thin|fa-sharp|material-icons|material-symbols(?:-outlined|-rounded|-sharp)?|glyphicon|codicon|octicon|mdi|zmdi|ri|bi|ti|ph|typcn|dashicons|wi|bx|oi|el|ai|iconfont)\b/i;

export const PUA_RANGES = [
  [0xe000, 0xf8ff],     // BMP PUA
  [0xf0000, 0xffffd],   // Supplementary PUA-A
  [0x100000, 0x10fffd], // Supplementary PUA-B
];
const MUSICAL_SYMBOLS = [0x1d100, 0x1d1ff];

function inProtectedCodepoint(cp) {
  if (cp >= MUSICAL_SYMBOLS[0] && cp <= MUSICAL_SYMBOLS[1]) return true;
  return PUA_RANGES.some(([a, b]) => cp >= a && cp <= b);
}

function splitFamilies(familyStr) {
  return String(familyStr)
    .toLowerCase()
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export function isProtectedFamily(familyStr, extra = []) {
  if (!familyStr) return false;
  const lower = String(familyStr).toLowerCase();
  const list = FONT_FAMILY_DENYLIST.concat((extra || []).map((s) => String(s).toLowerCase()));
  if (list.some((d) => d && lower.includes(d))) return true;
  const tokens = splitFamilies(familyStr);
  if (tokens.some((t) => FONT_FAMILY_DENYLIST_RISKY.includes(t))) return true;
  return false;
}

export function isPuaText(text) {
  if (!text) return false;
  const t = String(text).replace(/\s+/g, '');
  if (!t) return false;
  let pua = 0;
  let total = 0;
  for (const ch of t) {
    total += 1;
    if (inProtectedCodepoint(ch.codePointAt(0))) pua += 1;
  }
  return total > 0 && pua / total >= 0.5;
}

export function hasIconClassHint(className) {
  if (!className) return false;
  return ICON_CLASS_HINT_RE.test(String(className));
}

// info: { fontFamily, pseudoFontFamily?, className, text }
export function shouldProtect(info, extra = []) {
  const { fontFamily, pseudoFontFamily, className, text } = info || {};
  if (isProtectedFamily(fontFamily, extra)) return true;
  if (isProtectedFamily(pseudoFontFamily, extra)) return true;
  if (isPuaText(text)) return true;
  if (hasIconClassHint(className) && (!text || text.trim().length <= 3)) return true;
  return false;
}
