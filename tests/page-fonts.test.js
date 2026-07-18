import { describe, it, expect } from 'vitest';
import { firstFamilyToken, dedupeClassify, rememberFamily } from '../src/lib/page-fonts.js';

describe('rememberFamily (LRU page-font cache)', () => {
  it('keeps the most-recently-seen families and evicts the oldest past the cap', () => {
    const m = new Map();
    rememberFamily(m, 'a', 'A', 2);
    rememberFamily(m, 'b', 'B', 2);
    rememberFamily(m, 'c', 'C', 2); // over cap → evict 'a' (least recent)
    expect([...m.keys()]).toEqual(['b', 'c']);
    expect(m.size).toBe(2);
  });
  it('does not starve: a new family is always inserted (oldest leaves instead)', () => {
    const m = new Map();
    for (const k of ['a', 'b', 'c', 'd']) rememberFamily(m, k, k.toUpperCase(), 2);
    expect(m.has('d')).toBe(true);      // newest kept
    expect(m.has('a')).toBe(false);     // oldest evicted, not the newcomer dropped
  });
  it('re-seeing a family refreshes its recency so it is not evicted next', () => {
    const m = new Map();
    rememberFamily(m, 'a', 'A', 2);
    rememberFamily(m, 'b', 'B', 2);
    rememberFamily(m, 'a', 'A2', 2);    // touch 'a' → now most-recent, value updated
    rememberFamily(m, 'c', 'C', 2);     // evict least-recent, which is now 'b'
    expect([...m.keys()]).toEqual(['a', 'c']);
    expect(m.get('a')).toBe('A2');
  });
});

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
