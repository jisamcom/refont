import { describe, it, expect } from 'vitest';
import { firstFamilyToken, dedupeClassify } from '../src/lib/page-fonts.js';

describe('firstFamilyToken', () => {
  it('takes the first family and strips quotes', () => {
    expect(firstFamilyToken('"Font Awesome 6 Free", sans-serif')).toBe('Font Awesome 6 Free');
    expect(firstFamilyToken("'KaTeX_Main', serif")).toBe('KaTeX_Main');
  });
  it('returns empty for blank input', () => {
    expect(firstFamilyToken('')).toBe('');
    expect(firstFamilyToken(undefined)).toBe('');
  });
});

describe('dedupeClassify', () => {
  const isProt = (n) => /awesome|katex/i.test(n);
  it('dedupes case-insensitively and classifies via the injected fn', () => {
    const out = dedupeClassify(
      ['Pretendard, sans-serif', 'pretendard', '"Font Awesome 6 Free"', 'KaTeX_Main'],
      isProt,
    );
    expect(out).toEqual([
      { name: 'Pretendard', protected: false },
      { name: 'Font Awesome 6 Free', protected: true },
      { name: 'KaTeX_Main', protected: true },
    ]);
  });
  it('skips empties and caps the list', () => {
    const raw = Array.from({ length: 50 }, (_, i) => `Font${i}`);
    expect(dedupeClassify(['', '  ', ...raw], () => false, 40)).toHaveLength(40);
  });
  it('excludes the applied body/code fonts (case-insensitive, quote-tolerant)', () => {
    const out = dedupeClassify(
      ['"Pretendard Variable", sans-serif', 'Consolas', '"Font Awesome 6 Free"'],
      isProt,
      40,
      ['Pretendard Variable', '"Consolas"'],
    );
    expect(out).toEqual([{ name: 'Font Awesome 6 Free', protected: true }]);
  });
});
