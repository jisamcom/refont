// src/lib/font-detect.js
// Detect locally-installed fonts via canvas text-width comparison (cross-browser,
// no permission). Works on Chrome + Firefox identically.

export const FONT_CANDIDATES = [
  // Korean (Windows/macOS common)
  'Malgun Gothic', '맑은 고딕', 'Gulim', '굴림', 'Batang', '바탕', 'Dotum', '돋움',
  'Nanum Gothic', '나눔고딕', 'Nanum Myeongjo', 'NanumSquare', 'Nanum Barun Gothic',
  'Pretendard', 'Pretendard Variable', 'Spoqa Han Sans Neo', 'Noto Sans KR', 'Noto Serif KR',
  'Apple SD Gothic Neo', 'AppleGothic', 'Apple SD 산돌고딕 Neo', 'Spoqa Han Sans',
  // Latin (common)
  'Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Georgia', 'Verdana',
  'Tahoma', 'Trebuchet MS', 'Calibri', 'Cambria', 'Segoe UI', 'Roboto', 'Open Sans',
  'Inter', 'Lato', 'Montserrat', 'Source Sans Pro', 'Courier New', 'Consolas',
  // Monospace
  'D2Coding', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Menlo', 'Monaco',
];

export const MONO_CANDIDATES = [
  'D2Coding', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Cascadia Mono',
  'Source Code Pro', 'IBM Plex Mono', 'Consolas', 'Courier New', 'Lucida Console',
  'SF Mono', 'Menlo', 'Monaco',
];

const BASELINES = ['monospace', 'serif', 'sans-serif'];
const TEST_STRING = 'mmmmmmmmmwwwwwww가나다라ABCabc0123';

// measure: (familyExpr:string) => number  (width of TEST_STRING in that family expr)
export function detectFonts(candidates, measure) {
  const baseWidths = BASELINES.map((b) => measure(b));
  const installed = [];
  for (const font of candidates) {
    const present = BASELINES.some((b, i) => measure(`"${font}", ${b}`) !== baseWidths[i]);
    if (present) installed.push(font);
  }
  return installed;
}

// Browser-only: build a real canvas-based measurer. Not unit-tested (jsdom canvas
// returns 0); covered by manual test.
export function makeMeasurer() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return (familyExpr) => {
    ctx.font = `72px ${familyExpr}`;
    return ctx.measureText(TEST_STRING).width;
  };
}
