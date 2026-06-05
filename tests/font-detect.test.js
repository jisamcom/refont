// tests/font-detect.test.js
import { describe, it, expect } from 'vitest';
import { detectFonts, FONT_CANDIDATES } from '../src/lib/font-detect.js';

// Fake measurer: a font is "installed" if its name is in `installed`.
// Baselines (monospace/serif/sans-serif) return a fixed width; an installed
// candidate returns a different width for at least one baseline.
function fakeMeasure(installed) {
  const BASE = { monospace: 100, serif: 110, 'sans-serif': 120 };
  return (familyExpr) => {
    // familyExpr like: '"Candidate", monospace' OR a bare baseline 'monospace'
    const m = familyExpr.match(/^"([^"]+)",\s*(.+)$/);
    if (!m) return BASE[familyExpr]; // bare baseline
    const [, cand, base] = m;
    if (installed.includes(cand)) return BASE[base] + 7; // differs → installed
    return BASE[base]; // identical → falls back to baseline → not installed
  };
}

describe('detectFonts', () => {
  it('returns only installed candidates', () => {
    const out = detectFonts(['Pretendard', 'Ghost Font', 'D2Coding'], fakeMeasure(['Pretendard', 'D2Coding']));
    expect(out).toEqual(['Pretendard', 'D2Coding']);
  });
  it('returns empty when none installed', () => {
    expect(detectFonts(['A', 'B'], fakeMeasure([]))).toEqual([]);
  });
});

describe('FONT_CANDIDATES', () => {
  it('includes common Korean and Latin fonts', () => {
    expect(FONT_CANDIDATES).toContain('Malgun Gothic');
    expect(FONT_CANDIDATES).toContain('Arial');
    expect(FONT_CANDIDATES.length).toBeGreaterThan(20);
  });
});
