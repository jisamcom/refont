import { describe, it, expect, vi } from 'vitest';

// storage.js (pulled in transitively for a realistic settings shape) imports the
// polyfill, which throws outside an extension; mock it.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { needsFullRescan, webfontSig } from '../src/lib/apply-plan.js';
import { DEFAULTS } from '../src/lib/storage.js';

const base = () => JSON.parse(JSON.stringify(DEFAULTS));

describe('webfontSig', () => {
  it('collapses system source (and family swaps) to a single signature', () => {
    const a = base(); a.bodyFont = { source: 'system', name: 'Pretendard' };
    const b = base(); b.bodyFont = { source: 'system', name: 'Georgia' };
    expect(webfontSig(a)).toBe('system');
    expect(webfontSig(a)).toBe(webfontSig(b));
  });
  it('changes when a web-font url/type/name changes', () => {
    const a = base(); a.bodyFont = { source: 'weburl', url: 'https://x/a.css', urlType: 'css', name: 'A' };
    const b = base(); b.bodyFont = { source: 'weburl', url: 'https://x/b.css', urlType: 'css', name: 'A' };
    expect(webfontSig(a)).not.toBe(webfontSig(b));
  });
});

describe('needsFullRescan', () => {
  it('treats a missing prev/next as needing a full rescan', () => {
    expect(needsFullRescan(null, base())).toBe(true);
    expect(needsFullRescan(base(), null)).toBe(true);
  });

  it('is false for value-only edits (scale/weight/spacing/axes/system family)', () => {
    const prev = base();
    const next = base();
    next.scale = 1.4; next.weight = 700; next.minSize = 14;
    next.lineHeight = 1.6; next.letterSpacing = 0.5; next.axes = 'opsz 14';
    next.bodyFont = { source: 'system', name: 'Georgia' };
    expect(needsFullRescan(prev, next)).toBe(false);
  });

  it('is true when enabled toggles', () => {
    const prev = base(); const next = base(); next.enabled = !prev.enabled;
    expect(needsFullRescan(prev, next)).toBe(true);
  });

  it('is true when the blocklist changes', () => {
    const prev = base(); const next = base(); next.blocklist = ['example.com'];
    expect(needsFullRescan(prev, next)).toBe(true);
  });

  it('is true when protection or manual exclusions change', () => {
    const p1 = base(); const n1 = base(); n1.protectionDenylistExtra = ['Foo'];
    expect(needsFullRescan(p1, n1)).toBe(true);
    const p2 = base(); const n2 = base(); n2.manualExclusions = { 'x.com': ['.sidebar'] };
    expect(needsFullRescan(p2, n2)).toBe(true);
  });

  it('is true when the code font is enabled or disabled (changes tagging)', () => {
    const prev = base(); prev.codeFont = null;
    const next = base(); next.codeFont = { source: 'system', name: 'Consolas' };
    expect(needsFullRescan(prev, next)).toBe(true);
  });

  it('is false when only the code font *name* changes (both enabled)', () => {
    const prev = base(); prev.codeFont = { source: 'system', name: 'Consolas' };
    const next = base(); next.codeFont = { source: 'system', name: 'Menlo' };
    expect(needsFullRescan(prev, next)).toBe(false);
  });

  it('is true when switching to a web font', () => {
    const prev = base(); prev.bodyFont = { source: 'system', name: 'Georgia' };
    const next = base(); next.bodyFont = { source: 'weburl', url: 'https://x/a.woff2', urlType: 'file', name: 'A' };
    expect(needsFullRescan(prev, next)).toBe(true);
  });
});
