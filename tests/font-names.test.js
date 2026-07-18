import { describe, it, expect } from 'vitest';
import { FONT_KO_NAMES, labelOf, toOptions } from '../src/ui/font-names.js';

describe('labelOf', () => {
  it('returns the Korean name for a known family', () => {
    expect(labelOf('Malgun Gothic')).toBe('맑은 고딕');
    expect(labelOf('Nanum Myeongjo')).toBe('나눔명조');
  });
  it('strips " Variable" and passes unknown names through', () => {
    expect(labelOf('Pretendard Variable')).toBe('Pretendard');
    expect(labelOf('Georgia')).toBe('Georgia');
  });
  it('handles null/undefined', () => {
    expect(labelOf(null)).toBe('');
  });
  it('is locale-aware: Korean alias only under ko, family name otherwise', () => {
    expect(labelOf('Batang', 'ko')).toBe('바탕');
    expect(labelOf('Batang', 'en')).toBe('Batang');
    expect(labelOf('Malgun Gothic', 'en')).toBe('Malgun Gothic');
    expect(labelOf('Pretendard Variable', 'en')).toBe('Pretendard'); // still strips " Variable"
  });
});

describe('toOptions', () => {
  it('maps families to {f} / {f,ko} option objects', () => {
    expect(toOptions(['Georgia', 'Batang'])).toEqual([
      { f: 'Georgia' }, { f: 'Batang', ko: '바탕' },
    ]);
  });
  it('collapses English/Korean alias duplicates, keeping the first (canonical)', () => {
    // Korean Windows reports both names for the same font.
    expect(toOptions(['Malgun Gothic', '맑은 고딕'])).toEqual([{ f: 'Malgun Gothic', ko: '맑은 고딕' }]);
    expect(toOptions(['Gulim', '굴림', 'Batang', '바탕'])).toEqual([
      { f: 'Gulim', ko: '굴림' }, { f: 'Batang', ko: '바탕' },
    ]);
  });
  it('collapses a base/Variable pair to one row', () => {
    expect(toOptions(['Pretendard Variable', 'Pretendard'])).toEqual([{ f: 'Pretendard Variable' }]);
  });
  it('keeps the localized name when the canonical was not detected', () => {
    expect(toOptions(['맑은 고딕'])).toEqual([{ f: '맑은 고딕' }]);
  });
  it('does not merge genuinely different families', () => {
    expect(toOptions(['Gulim', 'Dotum'])).toEqual([
      { f: 'Gulim', ko: '굴림' }, { f: 'Dotum', ko: '돋움' },
    ]);
  });
  it('FONT_KO_NAMES is a non-empty map', () => {
    expect(Object.keys(FONT_KO_NAMES).length).toBeGreaterThan(5);
  });
});
