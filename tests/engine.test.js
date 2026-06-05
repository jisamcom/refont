// tests/engine.test.js
import { describe, it, expect } from 'vitest';
import { sanitizeFamilyName, fontStack, buildCss, computeElementInline, parseAxes } from '../src/lib/engine.js';

describe('sanitizeFamilyName', () => {
  it('strips double-quote, backslash, semicolon, braces, and angle brackets', () => {
    expect(sanitizeFamilyName('"Evil\\;{}<>')).not.toMatch(/["\\;{}<>]/);
  });
  it('trims surrounding whitespace', () => {
    expect(sanitizeFamilyName('  Pretendard  ')).toBe('Pretendard');
  });
  it('returns empty string for null/undefined', () => {
    expect(sanitizeFamilyName(null)).toBe('');
    expect(sanitizeFamilyName(undefined)).toBe('');
  });
  it('leaves a clean name unchanged', () => {
    expect(sanitizeFamilyName('My Font')).toBe('My Font');
  });
});

describe('fontStack', () => {
  it('puts the chosen font first, then emoji fonts, then generic', () => {
    const s = fontStack('Pretendard');
    expect(s.startsWith('"Pretendard"')).toBe(true);
    expect(s).toContain('Apple Color Emoji');
    expect(s).toContain('Segoe UI Emoji');
    expect(s.endsWith('sans-serif')).toBe(true);
  });
  it('uses the provided generic for code', () => {
    expect(fontStack('D2Coding', 'monospace').endsWith('monospace')).toBe(true);
  });
  it('strips dangerous characters from the name', () => {
    expect(fontStack('Evil";}body{x')).not.toContain(';');
    expect(fontStack('Evil";}body{x')).not.toContain('}');
  });
  it('falls back to emoji+generic when name empty', () => {
    expect(fontStack('')).toContain('Apple Color Emoji');
  });
});

describe('buildCss', () => {
  it('emits a [data-fc] body rule with !important', () => {
    const css = buildCss({ bodyFont: { name: 'Pretendard' } });
    expect(css).toMatch(/\[data-fc\]\s*\{[^}]*font-family:[^}]*!important/);
  });
  it('emits a [data-fc-code] rule only when codeFont set', () => {
    expect(buildCss({ bodyFont: { name: 'A' }, codeFont: null })).not.toContain('data-fc-code');
    expect(buildCss({ bodyFont: { name: 'A' }, codeFont: { name: 'D2Coding' } })).toContain('[data-fc-code]');
  });
  it('emits line-height / letter-spacing only when nonzero', () => {
    expect(buildCss({ bodyFont: { name: 'A' }, lineHeight: 0, letterSpacing: 0 })).not.toContain('line-height');
    const css = buildCss({ bodyFont: { name: 'A' }, lineHeight: 1.6, letterSpacing: 0.5 });
    expect(css).toContain('line-height:1.6');
    expect(css).toContain('letter-spacing:0.5px');
  });
});

describe('computeElementInline', () => {
  it('scales font-size by the multiplier', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { scale: 1.5 }).fontSize).toBe('24px');
  });
  it('applies the minimum-size floor', () => {
    expect(computeElementInline({ fontSize: 10, fontWeight: 400 }, { scale: 1, minSize: 14 }).fontSize).toBe('14px');
  });
  it('returns no fontSize when unchanged', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { scale: 1, minSize: 0 }).fontSize).toBeUndefined();
  });
  it('sets weight only on normal-weight elements when preserveBold', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { weight: 300, preserveBold: true }).fontWeight).toBe('300');
    expect(computeElementInline({ fontSize: 16, fontWeight: 700 }, { weight: 300, preserveBold: true }).fontWeight).toBeUndefined();
  });
  it('sets weight on all elements when preserveBold false', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 700 }, { weight: 300, preserveBold: false }).fontWeight).toBe('300');
  });
  it('never sets weight when weight is 0', () => {
    expect(computeElementInline({ fontSize: 16, fontWeight: 400 }, { weight: 0 }).fontWeight).toBeUndefined();
  });
});

describe('parseAxes', () => {
  it('parses comma-separated tag/value pairs', () => {
    expect(parseAxes('opsz 14, wdth 80')).toEqual([
      { tag: 'opsz', val: '14' }, { tag: 'wdth', val: '80' },
    ]);
  });
  it('keeps negative and decimal values', () => {
    expect(parseAxes('slnt -6, GRAD 0.5')).toEqual([
      { tag: 'slnt', val: '-6' }, { tag: 'GRAD', val: '0.5' },
    ]);
  });
  it('drops malformed fragments and handles empty', () => {
    expect(parseAxes('opsz, wdth 80, , junk')).toEqual([{ tag: 'wdth', val: '80' }]);
    expect(parseAxes('')).toEqual([]);
    expect(parseAxes(undefined)).toEqual([]);
  });
});

describe('buildCss font-variation-settings', () => {
  it('omits the rule when no axes', () => {
    expect(buildCss({ bodyFont: { name: 'A' }, axes: '' })).not.toContain('font-variation-settings');
  });
  it('emits parsed axes with !important when present', () => {
    const css = buildCss({ bodyFont: { name: 'A' }, axes: 'opsz 14, wdth 80' });
    expect(css).toMatch(/\[data-fc\]\{font-variation-settings:'opsz' 14,'wdth' 80 !important;\}/);
  });
});
