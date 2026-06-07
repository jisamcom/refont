// tests/background.test.js
import { describe, it, expect, vi } from 'vitest';

// webextension-polyfill throws at import outside an extension; mock it.
// (Hoisted by vitest; kept first for clarity.) The empty default makes the
// browser-wiring guard in background.js false, so only pure exports load.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import { guessFontMime, arrayBufferToBase64, fetchFontAsDataUrl, cssTarget } from '../src/background.js';

describe('cssTarget', () => {
  it('targets the sender frame so CSS reaches iframes (e.g. Naver Cafe #cafe_main)', () => {
    // top frame
    expect(cssTarget(7, 0)).toEqual({ tabId: 7, frameIds: [0] });
    // a child iframe
    expect(cssTarget(7, 3)).toEqual({ tabId: 7, frameIds: [3] });
  });
  it('falls back to the whole tab (top frame) when frameId is unknown', () => {
    expect(cssTarget(7, undefined)).toEqual({ tabId: 7 });
    expect(cssTarget(7, null)).toEqual({ tabId: 7 });
  });
});

describe('guessFontMime', () => {
  it('maps extensions to mime types', () => {
    expect(guessFontMime('https://x/a.woff2')).toBe('font/woff2');
    expect(guessFontMime('https://x/a.woff')).toBe('font/woff');
    expect(guessFontMime('https://x/a.ttf')).toBe('font/ttf');
    expect(guessFontMime('https://x/a.otf')).toBe('font/otf');
    expect(guessFontMime('https://x/a.xyz')).toBe('application/octet-stream');
  });
});

describe('arrayBufferToBase64', () => {
  it('round-trips simple bytes', () => {
    const buf = new Uint8Array([72, 105]).buffer; // "Hi"
    expect(arrayBufferToBase64(buf)).toBe('SGk=');
  });
});

describe('fetchFontAsDataUrl', () => {
  it('returns a data: URL on success', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    const url = await fetchFontAsDataUrl('https://x/a.woff2', fakeFetch);
    expect(url.startsWith('data:font/woff2;base64,')).toBe(true);
  });
  it('throws on http error', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404 });
    await expect(fetchFontAsDataUrl('https://x/a.woff2', fakeFetch)).rejects.toThrow(/404/);
  });
});
