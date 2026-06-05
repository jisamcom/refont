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

// Display label: Korean name if known, else family; always strip " Variable".
export function labelOf(family) {
  const f = String(family || '');
  return (FONT_KO_NAMES[f] || f).replace(' Variable', '');
}

// Map a family-name array to picker option objects ({f} or {f, ko}).
export function toOptions(families) {
  return (families || []).map((f) => (FONT_KO_NAMES[f] ? { f, ko: FONT_KO_NAMES[f] } : { f }));
}
