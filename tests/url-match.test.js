import { describe, it, expect } from 'vitest';
import { effectivePageUrl, isBlocked, matchesList, computeSiteToggle } from '../src/lib/url-match.js';

describe('computeSiteToggle', () => {
  it('blocks an unblocked site by adding an exact-host entry', () => {
    expect(computeSiteToggle('https://a.com/x', false, [], [])).toEqual({ blocklist: ['a.com'], allowlist: [] });
  });
  it('unblocks an exact-host block by removing it', () => {
    expect(computeSiteToggle('https://a.com/x', true, ['a.com'], [])).toEqual({ blocklist: [], allowlist: [] });
  });
  it('re-enables a site blocked by a PARENT rule via an allow exception, not by widening the block', () => {
    expect(computeSiteToggle('https://sub.example.com/', true, ['example.com'], []))
      .toEqual({ blocklist: ['example.com'], allowlist: ['sub.example.com'] });
  });
  it('re-blocking a parent-covered site removes its allow exception without duplicating the block', () => {
    expect(computeSiteToggle('https://sub.example.com/', false, ['example.com'], ['sub.example.com']))
      .toEqual({ blocklist: ['example.com'], allowlist: [] });
  });
  it('does not add a redundant block when a parent rule already covers the site', () => {
    expect(computeSiteToggle('https://sub.example.com/', false, ['example.com'], []))
      .toEqual({ blocklist: ['example.com'], allowlist: [] });
  });
  it('is a no-op for an unparseable URL', () => {
    expect(computeSiteToggle('not a url', true, ['x.com'], [])).toEqual({ blocklist: ['x.com'], allowlist: [] });
  });
  it('turns OFF a sub-host under an allowed parent by adding a more-specific block', () => {
    // block+allow both on example.com → whole domain currently re-enabled.
    const next = computeSiteToggle('https://sub.example.com/', false, ['example.com'], ['example.com']);
    expect(next.blocklist).toContain('sub.example.com'); // exact block beats the parent allow
    expect(next.allowlist).toEqual(['example.com']);     // parent re-enable untouched
    expect(isBlocked('https://sub.example.com/', next.blocklist, next.allowlist)).toBe(true);
    expect(isBlocked('https://example.com/', next.blocklist, next.allowlist)).toBe(false);
    expect(isBlocked('https://other.example.com/', next.blocklist, next.allowlist)).toBe(false);
  });
});

describe('isBlocked specificity (longest match wins)', () => {
  it('lets a more-specific block override a parent allow', () => {
    expect(isBlocked('https://sub.example.com/', ['sub.example.com', 'example.com'], ['example.com'])).toBe(true);
    expect(isBlocked('https://example.com/', ['sub.example.com', 'example.com'], ['example.com'])).toBe(false);
  });
  it('lets a more-specific path block override a broader-path allow', () => {
    expect(isBlocked('https://example.com/a/b', ['example.com/a'], ['example.com'])).toBe(true);
    expect(isBlocked('https://example.com/a/b', ['example.com'], ['example.com/a'])).toBe(false);
  });
  it('allow wins on an exact same-target tie', () => {
    expect(isBlocked('https://example.com/', ['example.com'], ['example.com'])).toBe(false);
  });
});

describe('isBlocked with allowlist override', () => {
  it('re-enables a site blocked by a parent-domain rule', () => {
    expect(isBlocked('https://sub.example.com/', ['example.com'])).toBe(true);
    expect(isBlocked('https://sub.example.com/', ['example.com'], ['sub.example.com'])).toBe(false);
  });
  it('exempts only matching hosts, not siblings', () => {
    expect(isBlocked('https://other.example.com/', ['example.com'], ['sub.example.com'])).toBe(true);
  });
  it('supports path scope in the allowlist like the blocklist', () => {
    expect(isBlocked('https://example.com/admin/x', ['example.com'], ['example.com/admin'])).toBe(false);
    expect(isBlocked('https://example.com/other', ['example.com'], ['example.com/admin'])).toBe(true);
  });
  it('is backward compatible with a 2-arg call (no allowlist)', () => {
    expect(isBlocked('https://example.com/', ['example.com'])).toBe(true);
  });
  it('exposes matchesList (raw block match, no allowlist)', () => {
    expect(matchesList('https://sub.example.com/', ['example.com'])).toBe(true);
    expect(matchesList('https://example.com/', [])).toBe(false);
  });
});

describe('isBlocked', () => {
  it('returns false for empty blocklist', () => {
    expect(isBlocked('https://example.com/', [])).toBe(false);
  });
  it('matches a bare domain entry', () => {
    expect(isBlocked('https://mail.google.com/x', ['google.com'])).toBe(true);
  });
  it('matches a host+path entry', () => {
    expect(isBlocked('https://docs.google.com/spreadsheets/d/1', ['docs.google.com/spreadsheets'])).toBe(true);
  });
  it('does not match an unrelated path', () => {
    expect(isBlocked('https://docs.google.com/document/d/1', ['docs.google.com/spreadsheets'])).toBe(false);
  });
  it('is case-insensitive', () => {
    expect(isBlocked('https://Example.COM/', ['example.com'])).toBe(true);
  });
  it('returns false for an unparseable url', () => {
    expect(isBlocked('not a url', ['example.com'])).toBe(false);
  });
  it('ignores blank entries', () => {
    expect(isBlocked('https://example.com/', ['  ', ''])).toBe(false);
  });
  it('does not match a domain as an arbitrary hostname substring', () => {
    expect(isBlocked('https://notexample.com/', ['example.com'])).toBe(false);
    expect(isBlocked('https://example.com.evil.test/', ['example.com'])).toBe(false);
  });
  it('matches only the requested path prefix', () => {
    expect(isBlocked('https://docs.google.com/spreadsheets-old', ['docs.google.com/spreadsheets'])).toBe(false);
    expect(isBlocked('https://docs.google.com/x/spreadsheets', ['docs.google.com/spreadsheets'])).toBe(false);
  });
  it('accepts a pasted URL and preserves an explicit port', () => {
    expect(isBlocked('https://example.com/path/x', ['https://example.com/path'])).toBe(true);
    expect(isBlocked('http://localhost:3001/', ['localhost:3000'])).toBe(false);
  });
});

describe('effectivePageUrl', () => {
  it('keeps normal web URLs', () => {
    expect(effectivePageUrl({ href: 'https://example.com/a' }, {})).toBe('https://example.com/a');
  });
  it('uses a same-origin ancestor full URL (with path) for inherited-origin blank frames', () => {
    const win = {}; win.parent = { location: { href: 'https://parent.example/admin/panel' } }; win.top = win.parent;
    expect(effectivePageUrl({ href: 'about:blank' }, {}, win)).toBe('https://parent.example/admin/panel');
    expect(effectivePageUrl({ href: 'about:srcdoc' }, {}, win)).toBe('https://parent.example/admin/panel');
  });
  it('falls back to parent origin/referrer when the ancestor is cross-origin', () => {
    const win = {}; win.parent = { get location() { throw new Error('cross-origin'); } }; win.top = win.parent;
    expect(effectivePageUrl({ href: 'about:blank', ancestorOrigins: ['https://parent.example'] }, {}, win))
      .toBe('https://parent.example');
    expect(effectivePageUrl({ href: 'about:srcdoc' }, { referrer: 'https://parent.example/page' }, win))
      .toBe('https://parent.example/page');
  });
  it('extracts the creator origin from blob URLs', () => {
    expect(effectivePageUrl({ href: 'blob:https://example.com/id' }, {})).toBe('https://example.com');
  });
  it('prefers a same-origin ancestor full URL over the blob creator origin', () => {
    const win = {}; win.parent = { location: { href: 'https://example.com/admin/panel' } }; win.top = win.parent;
    expect(effectivePageUrl({ href: 'blob:https://example.com/id' }, {}, win))
      .toBe('https://example.com/admin/panel');
  });
  it('falls back to the blob creator origin when no ancestor is reachable', () => {
    const win = {}; win.parent = { get location() { throw new Error('cross-origin'); } }; win.top = win.parent;
    expect(effectivePageUrl({ href: 'blob:https://example.com/id' }, {}, win)).toBe('https://example.com');
  });
});
