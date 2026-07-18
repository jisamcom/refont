// src/ui/font-names.js
// Display-only Korean names for known font families. The stored/applied value is
// always the real CSS family; this only changes what the picker shows.
export const FONT_KO_NAMES = {
  'Malgun Gothic': '맑은 고딕',
  'Batang': '바탕',
  'Gulim': '굴림',
  'Dotum': '돋움',
  'Gungsuh': '궁서',
  'Gungsuhche': '궁서체',
  'Nanum Gothic': '나눔고딕',
  'Nanum Myeongjo': '나눔명조',
  'Nanum Barun Gothic': '나눔바른고딕',
  'NanumSquare': '나눔스퀘어',
  'Nanum Pen Script': '나눔손글씨 펜',
  'Spoqa Han Sans Neo': '스포카 한 산스 네오',
  'Noto Sans KR': '노토 산스 KR',
  'Noto Serif KR': '노토 세리프 KR',
  'Apple SD Gothic Neo': '애플 SD 산돌고딕 Neo',
  'Gowun Dodum': '고운돋움',
};

// Alias family names that resolve to the same physical font as a canonical
// family. Korean Windows exposes e.g. both "Malgun Gothic" and "맑은 고딕", so
// detection finds both — we collapse them to one picker row. (Detection keeps
// both names on purpose, for systems that expose only the localized name.)
export const FONT_ALIASES = {
  '맑은 고딕': 'Malgun Gothic',
  '굴림': 'Gulim',
  '바탕': 'Batang',
  '돋움': 'Dotum',
  '궁서': 'Gungsuh',
  '나눔고딕': 'Nanum Gothic',
  'Apple SD 산돌고딕 Neo': 'Apple SD Gothic Neo',
};

// Display label for a family, locale-aware: the Korean alias only under the Korean
// UI, otherwise the real family name (so an English UI shows "Batang", not "바탕").
// Always strips " Variable". Defaults to 'ko' so locale-agnostic callers (e.g. the
// toOptions dedup key) keep their previous behaviour.
export function labelOf(family, locale = 'ko') {
  const f = String(family || '');
  const base = locale === 'ko' ? (FONT_KO_NAMES[f] || f) : f;
  return base.replace(' Variable', '');
}

// Map a family-name array to picker option objects ({f} or {f, ko}), de-duped by
// what the user actually sees. Two entries collapse when they share a display
// label after alias resolution (맑은 고딕 ≡ Malgun Gothic) or " Variable"
// stripping (Pretendard ≡ Pretendard Variable). The first detected name wins, so
// the canonical/base form (listed first in the candidates) is what gets applied.
export function toOptions(families) {
  const seen = new Set();
  const out = [];
  for (const f of families || []) {
    const key = labelOf(FONT_ALIASES[f] || f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(FONT_KO_NAMES[f] ? { f, ko: FONT_KO_NAMES[f] } : { f });
  }
  return out;
}
