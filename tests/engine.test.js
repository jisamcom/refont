// tests/engine.test.js
import { describe, it, expect } from 'vitest';
import {
  sanitizeFamilyName, sanitizeFontDisplay, fontStack, parseAxes, splitTextAxes,
  buildSkeletonCss, buildDynamicCss, buildRootVars, engineVars, elementBase,
} from '../src/lib/engine.js';

describe('sanitizeFontDisplay', () => {
  it('passes through allowed keywords', () => {
    for (const v of ['swap', 'optional', 'auto', 'block', 'fallback']) {
      expect(sanitizeFontDisplay(v)).toBe(v);
    }
  });
  it('falls back to swap for unknown/missing/injection-y values', () => {
    expect(sanitizeFontDisplay(undefined)).toBe('swap');
    expect(sanitizeFontDisplay('')).toBe('swap');
    expect(sanitizeFontDisplay('optional;}body{display:none')).toBe('swap');
    expect(sanitizeFontDisplay('SWAP')).toBe('swap');
  });
});

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

describe('buildSkeletonCss', () => {
  const css = buildSkeletonCss();
  it('drives font-family from the body-stack variable with !important', () => {
    expect(css).toMatch(/\[data-fc\]\{font-family:var\(--refont-body-stack\) !important;\}/);
  });
  it('does NOT pin font-size (that is gated in the dynamic sheet)', () => {
    expect(css).not.toContain('font-size');
  });
  it('is constant (no settings input) so it is never rebuilt', () => {
    expect(buildSkeletonCss()).toBe(css);
  });
});

describe('buildRootVars', () => {
  it('emits a :root rule with the always-present vars, omitting weight/width when off', () => {
    const css = buildRootVars({ bodyFont: { name: 'Foo' }, scale: 1.2, minSize: 0, weight: 0, width: 0 });
    expect(css).toMatch(/^:root\{/);
    expect(css).toContain('--refont-body-stack:"Foo"');
    expect(css).toContain('--refont-scale:1.2');
    expect(css).not.toContain('--refont-weight');
    expect(css).not.toContain('--refont-width');
  });
  it('includes weight and width when the dials are on', () => {
    const css = buildRootVars({ bodyFont: { name: 'Foo' }, scale: 1, weight: 600, width: 90 });
    expect(css).toContain('--refont-weight:600');
    expect(css).toContain('--refont-width:90%');
  });
});

describe('buildDynamicCss size gating', () => {
  it('omits the font-size rule when sizing is off (scale 1, min 0) — keeps fluid text', () => {
    expect(buildDynamicCss({ scale: 1, minSize: 0 })).not.toContain('font-size');
  });
  it('emits the scale rule when scale != 1', () => {
    expect(buildDynamicCss({ scale: 1.2, minSize: 0 }))
      .toContain('[data-fc-size]{font-size:max(calc(var(--fc-base-size) * var(--refont-scale,1)), var(--refont-min,0px)) !important;}');
  });
  it('emits the rule when a min floor is set even at scale 1', () => {
    expect(buildDynamicCss({ scale: 1, minSize: 14 })).toContain('[data-fc-size]');
  });
  it('is identical for different scale *values* (value lives in the variable)', () => {
    expect(buildDynamicCss({ scale: 1.2 })).toBe(buildDynamicCss({ scale: 1.9 }));
  });
});

describe('buildDynamicCss', () => {
  it('emits no weight rule when weight is 0 (keep original)', () => {
    expect(buildDynamicCss({ weight: 0 })).not.toContain('font-weight');
  });
  it('weights only light elements when preserveBold, both when not', () => {
    const keep = buildDynamicCss({ weight: 700, preserveBold: true });
    expect(keep).toContain('[data-fc-wlight]{font-weight:var(--refont-weight) !important;}');
    expect(keep).not.toContain('[data-fc-wbold]');
    const all = buildDynamicCss({ weight: 700, preserveBold: false });
    expect(all).toContain('[data-fc-wlight]');
    expect(all).toContain('[data-fc-wbold]{font-weight:var(--refont-weight) !important;}');
  });
  it('is identical for different weight *values* (value lives in the variable)', () => {
    expect(buildDynamicCss({ weight: 300, preserveBold: true })).toBe(buildDynamicCss({ weight: 900, preserveBold: true }));
  });
  it('emits line-height / letter-spacing / word-spacing rules (value in a variable) only when nonzero', () => {
    expect(buildDynamicCss({ lineHeight: 0, letterSpacing: 0, wordSpacing: 0 })).toBe('');
    const css = buildDynamicCss({ lineHeight: 1.6, letterSpacing: 0.12, wordSpacing: 0.16 });
    expect(css).toContain('[data-fc]:not([data-fc-code]){line-height:var(--refont-line-height) !important;}');
    expect(css).toContain('letter-spacing:var(--refont-letter-spacing) !important;');
    expect(css).toContain('[data-fc]:not([data-fc-code]){word-spacing:var(--refont-word-spacing) !important;}');
  });
  it('is identical for different spacing *values* (value lives in the variable, not the rule)', () => {
    expect(buildDynamicCss({ letterSpacing: 0.12 })).toBe(buildDynamicCss({ letterSpacing: 0.13 }));
    expect(buildDynamicCss({ lineHeight: 1.5 })).toBe(buildDynamicCss({ lineHeight: 1.8 }));
  });
  it('routes registered axes to standard props and customs to font-variation-settings', () => {
    expect(buildDynamicCss({ axes: '' })).not.toContain('font-variation-settings');
    // opsz numeric stays in FVS (no numeric standard property); wdth → font-stretch.
    const css = buildDynamicCss({ axes: 'opsz 14, wdth 80, GRAD 50' });
    expect(css).toContain("font-variation-settings:'opsz' 14,'GRAD' 50 !important;");
    expect(css).toContain('font-stretch:80% !important');
    expect(css).not.toContain("'wdth'");
  });
  it('emits the width-dial font-stretch via the variable when width > 0', () => {
    expect(buildDynamicCss({ width: 0 })).not.toContain('font-stretch');
    expect(buildDynamicCss({ width: 90 }))
      .toContain('[data-fc]:not([data-fc-code]){font-stretch:var(--refont-width) !important;}');
  });
  it('the width dial owns wdth: a typed wdth is ignored while the dial is on', () => {
    const css = buildDynamicCss({ width: 120, axes: 'wdth 80' });
    expect(css).toContain('font-stretch:var(--refont-width) !important;');
    expect(css).not.toContain('font-stretch:80%');
  });

  // Refont's overrides can cascade into form controls via `font: inherit`. Only
  // the non-`font`-shorthand properties are safe to neutralize (see engine.js).
  it('leaves form controls alone when no neutralizable feature is on', () => {
    expect(buildDynamicCss({ weight: 0, letterSpacing: 0, wordSpacing: 0, width: 0, lineHeight: 0 }))
      .not.toContain(':where(');
  });
  it('never blanket-resets font-shorthand props (weight/line-height/stretch) on form controls', () => {
    // A reset strong enough to beat `font: inherit` would also clobber explicit
    // author form styling, so these emit NO form-control rule at all.
    expect(buildDynamicCss({ weight: 700, lineHeight: 1.6, width: 90 })).not.toContain(':where(');
  });
  it('cancels only inherited tracking/FVS via 0-specificity :where (never !important)', () => {
    const css = buildDynamicCss({ letterSpacing: 0.12, wordSpacing: 0.16 });
    const ls = css.split('\n').find((l) => l.startsWith(':where(') && l.includes('letter-spacing'));
    expect(ls).toContain('input');
    expect(ls).toContain('textarea');
    expect(ls).toContain('[contenteditable]:not([contenteditable="false"])');
    expect(ls).toContain('letter-spacing:normal;');
    expect(ls).not.toContain('!important'); // loses to any explicit author rule
    expect(css).toContain('word-spacing:normal;');
  });
  it('emits font-optical-sizing:none only when opticalSizing is none (auto = browser default)', () => {
    expect(buildDynamicCss({ opticalSizing: 'auto' })).not.toContain('font-optical-sizing');
    expect(buildDynamicCss({ opticalSizing: 'none' }))
      .toContain('[data-fc]:not([data-fc-code]){font-optical-sizing:none !important;}');
  });
  it('maps slnt to oblique (negated angle) and ital to font-style', () => {
    expect(buildDynamicCss({ axes: 'slnt -6' })).toContain('font-style:oblique 6deg !important');
    expect(buildDynamicCss({ axes: 'ital 1' })).toContain('font-style:italic !important');
  });
});

describe('splitTextAxes', () => {
  it('routes registered axes to standard props, customs to font-variation-settings', () => {
    const { std, custom } = splitTextAxes({ axes: 'wdth 80, slnt -6, GRAD 50' });
    expect(std['font-stretch']).toBe('80%');
    expect(std['font-style']).toBe('oblique 6deg');
    expect(custom).toEqual(["'GRAD' 50"]);
  });
  it('keeps numeric opsz in font-variation-settings (no numeric standard property)', () => {
    const { std, custom } = splitTextAxes({ axes: 'opsz 14' });
    expect(std).toEqual({});
    expect(custom).toEqual(["'opsz' 14"]);
  });
  it('honors a typed wght/wdth only when the matching dial is off', () => {
    expect(splitTextAxes({ axes: 'wght 600', weight: 0 }).std['font-weight']).toBe('600');
    expect('font-weight' in splitTextAxes({ axes: 'wght 600', weight: 700 }).std).toBe(false);
    expect(splitTextAxes({ axes: 'wdth 80', width: 0 }).std['font-stretch']).toBe('80%');
    expect('font-stretch' in splitTextAxes({ axes: 'wdth 80', width: 120 }).std).toBe(false);
  });
});

describe('engineVars', () => {
  it('maps scale/min and the font stacks to variables', () => {
    const v = engineVars({ bodyFont: { name: 'Pretendard' }, scale: 1.2, minSize: 14 });
    expect(v['--refont-scale']).toBe('1.2');
    expect(v['--refont-min']).toBe('14px');
    expect(v['--refont-body-stack'].startsWith('"Pretendard"')).toBe(true);
  });
  it('omits --refont-weight when weight is 0, includes it otherwise', () => {
    expect('--refont-weight' in engineVars({ weight: 0 })).toBe(false);
    expect(engineVars({ weight: 600 })['--refont-weight']).toBe('600');
  });
  it('omits --refont-width when width is 0, includes it as a percentage otherwise', () => {
    expect('--refont-width' in engineVars({ width: 0 })).toBe(false);
    expect(engineVars({ width: 90 })['--refont-width']).toBe('90%');
  });
  it('defaults scale to 1 and min to 0px', () => {
    const v = engineVars({});
    expect(v['--refont-scale']).toBe('1');
    expect(v['--refont-min']).toBe('0px');
  });
});

describe('elementBase', () => {
  it('reports a positive size and a light bucket for normal weight', () => {
    expect(elementBase({ fontSize: 16, fontWeight: 400 })).toEqual({ sizePx: 16, weightBucket: 'light' });
  });
  it('buckets weight > 400 as bold', () => {
    expect(elementBase({ fontSize: 16, fontWeight: 700 }).weightBucket).toBe('bold');
  });
  it('reports sizePx 0 when there is no usable size', () => {
    expect(elementBase({ fontSize: 0, fontWeight: 400 }).sizePx).toBe(0);
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
