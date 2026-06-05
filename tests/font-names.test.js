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
});

describe('toOptions', () => {
  it('maps families to {f} / {f,ko} option objects', () => {
    expect(toOptions(['Georgia', 'Batang'])).toEqual([
      { f: 'Georgia' }, { f: 'Batang', ko: '바탕' },
    ]);
  });
  it('FONT_KO_NAMES is a non-empty map', () => {
    expect(Object.keys(FONT_KO_NAMES).length).toBeGreaterThan(5);
  });
});
