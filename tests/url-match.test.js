import { describe, it, expect } from 'vitest';
import { effectivePageUrl, isBlocked } from '../src/lib/url-match.js';

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
