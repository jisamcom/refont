// tests/background.test.js
import { describe, it, expect, vi } from 'vitest';

// webextension-polyfill throws at import outside an extension; mock it.
// (Hoisted by vitest; kept first for clarity.) The empty default makes the
// browser-wiring guard in background.js false, so only pure exports load.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  guessFontMime, arrayBufferToBase64, fetchFontAsDataUrl, cssTarget,
  classifyFontResponse, fetchFontCached, MAX_FONT_BYTES, MAX_FONT_CACHE_ENTRIES,
} from '../src/background.js';

function fontRes(bytes, { contentType, contentLength } = {}) {
  const headers = new Map();
  if (contentType != null) headers.set('content-type', contentType);
  if (contentLength != null) headers.set('content-length', String(contentLength));
  return { ok: true, status: 200, headers, arrayBuffer: async () => new Uint8Array(bytes).buffer };
}

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
    expect(guessFontMime('https://x/a.woff2?v=2')).toBe('font/woff2');
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
  it('rejects an HTML response (hotlink-protection / error page)', async () => {
    const fakeFetch = async () => fontRes([60, 33], { contentType: 'text/html; charset=utf-8' });
    await expect(fetchFontAsDataUrl('https://x/a.woff2', fakeFetch)).rejects.toThrow(/not-font|rejected/);
  });
  it('rejects an oversized font by declared Content-Length before downloading', async () => {
    let downloaded = false;
    const fakeFetch = async () => ({
      ok: true, status: 200,
      headers: new Map([['content-length', String(MAX_FONT_BYTES + 1)], ['content-type', 'font/woff2']]),
      arrayBuffer: async () => { downloaded = true; return new Uint8Array([1]).buffer; },
    });
    await expect(fetchFontAsDataUrl('https://x/a.woff2', fakeFetch)).rejects.toThrow(/large/);
    expect(downloaded).toBe(false);
  });
  it('cancels a streaming response as soon as the actual size exceeds the cap', async () => {
    let reads = 0;
    let cancelled = false;
    const chunk = new Uint8Array(Math.ceil(MAX_FONT_BYTES / 2) + 1);
    const reader = {
      read: async () => { reads += 1; return reads <= 2 ? { done: false, value: chunk } : { done: true }; },
      cancel: async () => { cancelled = true; },
      releaseLock: () => {},
    };
    const fakeFetch = async () => ({
      ok: true, status: 200,
      headers: new Map([['content-type', 'font/woff2']]),
      body: { getReader: () => reader },
      arrayBuffer: async () => { throw new Error('must stream'); },
    });
    await expect(fetchFontAsDataUrl('https://x/stream.woff2', fakeFetch)).rejects.toThrow(/large/);
    expect(cancelled).toBe(true);
    expect(reads).toBe(2);
  });
});

describe('classifyFontResponse', () => {
  it('accepts font content-types, octet-stream, and font extensions', () => {
    expect(classifyFontResponse({ url: 'https://x/a.woff2', contentType: 'font/woff2', byteLength: 10 })).toBe('ok');
    expect(classifyFontResponse({ url: 'https://x/a', contentType: 'application/octet-stream', byteLength: 10 })).toBe('ok');
    expect(classifyFontResponse({ url: 'https://x/a.ttf', contentType: '', byteLength: 10 })).toBe('ok');
  });
  it('rejects HTML/JSON error pages', () => {
    expect(classifyFontResponse({ url: 'https://x/a.woff2', contentType: 'text/html', byteLength: 10 })).toBe('not-font');
    expect(classifyFontResponse({ url: 'https://x/a', contentType: 'application/json', byteLength: 10 })).toBe('not-font');
  });
  it('rejects oversized payloads', () => {
    expect(classifyFontResponse({ url: 'https://x/a.woff2', contentType: 'font/woff2', byteLength: MAX_FONT_BYTES + 1 })).toBe('too-large');
  });
});

describe('fetchFontCached', () => {
  it('fetches a URL once and serves repeats from cache (all_frames amplification)', async () => {
    let calls = 0;
    const fakeFetch = async () => { calls += 1; return fontRes([1, 2, 3], { contentType: 'font/woff2' }); };
    const url = 'https://x/cached-once.woff2';
    const a = await fetchFontCached(url, fakeFetch);
    const b = await fetchFontCached(url, fakeFetch);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
  it('does not cache failures (lets a later retry succeed)', async () => {
    let calls = 0;
    const flaky = async () => { calls += 1; if (calls === 1) throw new Error('boom'); return fontRes([9], { contentType: 'font/woff2' }); };
    const url = 'https://x/flaky.woff2';
    await expect(fetchFontCached(url, flaky)).rejects.toThrow(/boom/);
    await expect(fetchFontCached(url, flaky)).resolves.toMatch(/^data:font\/woff2/);
    expect(calls).toBe(2);
  });
  it('evicts least-recently-used URLs instead of retaining fonts without bound', async () => {
    const calls = new Map();
    const fakeFetch = async (url) => {
      calls.set(url, (calls.get(url) || 0) + 1);
      return fontRes([1], { contentType: 'font/woff2' });
    };
    const urls = Array.from({ length: MAX_FONT_CACHE_ENTRIES + 1 }, (_, i) => `https://lru.test/${i}.woff2`);
    for (const url of urls) await fetchFontCached(url, fakeFetch);
    await fetchFontCached(urls[0], fakeFetch);
    expect(calls.get(urls[0])).toBe(2);
  });
});
