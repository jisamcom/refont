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
  it('uses the parent origin/referrer for inherited-origin blank frames', () => {
    expect(effectivePageUrl({ href: 'about:blank', ancestorOrigins: ['https://parent.example'] }, {}))
      .toBe('https://parent.example');
    expect(effectivePageUrl({ href: 'about:srcdoc' }, { referrer: 'https://parent.example/page' }))
      .toBe('https://parent.example/page');
  });
  it('extracts the creator origin from blob URLs', () => {
    expect(effectivePageUrl({ href: 'blob:https://example.com/id' }, {})).toBe('https://example.com');
  });
});
