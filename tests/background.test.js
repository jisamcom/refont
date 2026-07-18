// tests/background.test.js
import { describe, it, expect, vi } from 'vitest';

// webextension-polyfill throws at import outside an extension; mock it.
// (Hoisted by vitest; kept first for clarity.) The empty default makes the
// browser-wiring guard in background.js false, so only pure exports load.
vi.mock('webextension-polyfill', () => ({ default: {} }));

import {
  guessFontMime, arrayBufferToBase64, fetchFontAsDataUrl, cssTarget,
  replaceCssSerialized, registerCssOwner, purgeTabCss, __cssStateSize,
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

describe('replaceCssSerialized', () => {
  const okScripting = () => ({ insertCSS: vi.fn(() => Promise.resolve()), removeCSS: vi.fn(() => Promise.resolve()) });

  it('serializes per-frame swaps, inserting the new sheet before removing the old', async () => {
    const order = [];
    let releaseFirst;
    const scripting = {
      insertCSS: vi.fn(({ css }) => {
        order.push(`insert:${css}`);
        if (css === 'A') return new Promise((r) => { releaseFirst = r; }); // hang the first insert
        return Promise.resolve();
      }),
      removeCSS: vi.fn(({ css }) => { order.push(`remove:${css}`); return Promise.resolve(); }),
    };
    const p1 = replaceCssSerialized(10, 0, 'A', 'd', scripting); // install A (hangs)
    const p2 = replaceCssSerialized(10, 0, 'B', 'd', scripting); // same doc: A -> B, queued behind
    await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual(['insert:A']); // p2 hasn't started - serialized behind p1

    releaseFirst();
    await p1; await p2;
    expect(order).toEqual(['insert:A', 'insert:B', 'remove:A']); // new inserted before old removed
  });

  it('reinstalls identical css for a new document (navigation drops the old sheet)', async () => {
    const inserted = [];
    const scripting = { insertCSS: vi.fn(({ css }) => { inserted.push(css); return Promise.resolve(); }), removeCSS: vi.fn(() => Promise.resolve()) };
    await replaceCssSerialized(20, 0, 'S', 'docA', scripting); // document A installs S
    await replaceCssSerialized(20, 0, 'S', 'docB', scripting); // NEW document, same settings css
    expect(inserted).toEqual(['S', 'S']);                      // reinstalled - not skipped as a no-op
  });

  it('discards an op from a document that no longer owns the frame (registration wins over timing)', async () => {
    const inserted = [];
    const scripting = { insertCSS: vi.fn(({ css }) => { inserted.push(css); return Promise.resolve(); }), removeCSS: vi.fn(() => Promise.resolve()) };
    registerCssOwner(21, 0, 'docB');                              // new document registers as owner
    await replaceCssSerialized(21, 0, 'STALE', 'docA', scripting); // straggler from the OLD document
    expect(inserted).toEqual([]);                                // discarded - docA is not the owner
    await replaceCssSerialized(21, 0, 'NEW', 'docB', scripting);   // the owner installs
    expect(inserted).toEqual(['NEW']);
  });

  it('lets a BFCache-restored document reclaim its frame after re-registering', async () => {
    const inserted = [];
    const scripting = { insertCSS: vi.fn(({ css }) => { inserted.push(css); return Promise.resolve(); }), removeCSS: vi.fn(() => Promise.resolve()) };
    registerCssOwner(28, 0, 'A'); await replaceCssSerialized(28, 0, 'a', 'A', scripting); // A active
    registerCssOwner(28, 0, 'B'); await replaceCssSerialized(28, 0, 'b', 'B', scripting); // navigate to B
    registerCssOwner(28, 0, 'A'); await replaceCssSerialized(28, 0, 'a', 'A', scripting); // BFCache-restore A
    expect(inserted).toEqual(['a', 'b', 'a']);                   // A reclaims ownership and reinstalls
  });

  it('is a no-op only within one document when the css is unchanged', async () => {
    const scripting = okScripting();
    await replaceCssSerialized(22, 1, 'X', 'doc', scripting);
    scripting.insertCSS.mockClear(); scripting.removeCSS.mockClear();
    await replaceCssSerialized(22, 1, 'X', 'doc', scripting); // same document + same css -> skip
    expect(scripting.insertCSS).not.toHaveBeenCalled();
    expect(scripting.removeCSS).not.toHaveBeenCalled();
  });

  it('does not record a failed insert, so the next apply retries instead of a phantom install', async () => {
    let failNext = true;
    const scripting = {
      insertCSS: vi.fn(() => { if (failNext) { failNext = false; return Promise.reject(new Error('busy')); } return Promise.resolve(); }),
      removeCSS: vi.fn(() => Promise.resolve()),
    };
    await replaceCssSerialized(23, 0, 'X', 'd', scripting); // insert fails
    await replaceCssSerialized(23, 0, 'X', 'd', scripting); // same css must retry, not dedupe
    expect(scripting.insertCSS).toHaveBeenCalledTimes(2);
  });

  it('an op superseded mid-insert strips its own sheet and records no ownership (P2)', async () => {
    // A new document can register as the frame's owner WHILE our insertCSS is in
    // flight; our sheet then lands in that document. We must undo it and commit
    // nothing, so the incoming owner starts clean.
    let releaseInsert;
    const inserted = [], removed = [];
    const scripting = {
      insertCSS: vi.fn(({ css }) => {
        inserted.push(css);
        if (inserted.length === 1) return new Promise((r) => { releaseInsert = r; }); // hang A's insert only
        return Promise.resolve();
      }),
      removeCSS: vi.fn(({ css }) => { removed.push(css); return Promise.resolve(); }),
    };
    registerCssOwner(30, 0, 'A');
    const pA = replaceCssSerialized(30, 0, 'SHEET', 'A', scripting); // insert hangs
    while (!releaseInsert) await Promise.resolve(); // let the chain reach (and hang at) insertCSS
    registerCssOwner(30, 0, 'B');           // a new document takes the frame mid-insert
    releaseInsert();
    await pA;
    expect(removed).toContain('SHEET');     // A undid the sheet it put in B's now-live doc
    const pB = replaceCssSerialized(30, 0, 'SHEET', 'B', scripting); // B installs cleanly
    await pB;
    expect(inserted).toEqual(['SHEET', 'SHEET']); // A's (undone) + B's — nothing was deduped away
  });

  it('does not re-insert the still-installed committed sheet after a failed preview (P2)', async () => {
    // dirty used to be a global flag: a failed preview insert set it, and the next
    // revert to the (still-installed) committed sheet re-inserted a duplicate.
    let failB = true;
    const inserted = [];
    const scripting = {
      insertCSS: vi.fn(({ css }) => {
        inserted.push(css);
        if (css === 'B' && failB) { failB = false; return Promise.reject(new Error('preview busy')); }
        return Promise.resolve();
      }),
      removeCSS: vi.fn(() => Promise.resolve()),
    };
    registerCssOwner(31, 0, 'd');
    await replaceCssSerialized(31, 0, 'A', 'd', scripting); // commit A: installed = A
    await replaceCssSerialized(31, 0, 'B', 'd', scripting); // preview B: insert fails, A still installed
    await replaceCssSerialized(31, 0, 'A', 'd', scripting); // revert to the committed (already installed) A
    expect(inserted.filter((c) => c === 'A')).toEqual(['A']); // inserted once — no duplicate USER sheet
  });

  it('retries a failed removal without reinserting the current sheet to do so', async () => {
    let failRemove = true;
    const removed = [];
    const scripting = {
      insertCSS: vi.fn(() => Promise.resolve()),
      removeCSS: vi.fn(({ css }) => { removed.push(css); if (failRemove && css === 'A') { failRemove = false; return Promise.reject(new Error('x')); } return Promise.resolve(); }),
    };
    await replaceCssSerialized(24, 0, 'A', 'd', scripting); // install A
    await replaceCssSerialized(24, 0, 'B', 'd', scripting); // A->B, remove(A) fails -> A kept stale
    expect(scripting.insertCSS).toHaveBeenCalledTimes(2);
    await replaceCssSerialized(24, 0, 'B', 'd', scripting); // same B, stale={A}: cleanup only
    expect(scripting.insertCSS).toHaveBeenCalledTimes(2);  // B NOT reinserted just to retry cleanup
    expect(removed.filter((c) => c === 'A')).toHaveLength(2); // A removal retried
  });

  it('removes a stale sheet the content script reports as prev after a worker restart', async () => {
    // MV3 terminates the worker; the in-memory cssState is lost but the content
    // script's appliedCss survives. On the next shape change it reports the old
    // sheet as `prev`, and the background (fresh, installed='') must remove it so
    // the now-off rules don't keep applying.
    const removed = [];
    const scripting = {
      insertCSS: vi.fn(() => Promise.resolve()),
      removeCSS: vi.fn(({ css }) => { removed.push(css); return Promise.resolve(); }),
    };
    // Fresh key (simulates a restarted worker): install B, content reports prev=A.
    await replaceCssSerialized(40, 0, 'B', 'doc', scripting, 'A');
    expect(scripting.insertCSS).toHaveBeenCalledWith(expect.objectContaining({ css: 'B' }));
    expect(removed).toContain('A');                 // old sheet cleaned up via content-supplied prev
  });

  it('does not double-remove when prev equals the css being installed', async () => {
    const removed = [];
    const scripting = {
      insertCSS: vi.fn(() => Promise.resolve()),
      removeCSS: vi.fn(({ css }) => { removed.push(css); return Promise.resolve(); }),
    };
    await replaceCssSerialized(41, 0, 'S', 'doc', scripting, 'S'); // prev === css
    expect(removed).toEqual([]);                     // nothing to clean; S is what we just installed
  });

  it('drops the per-frame entry once torn down, and purges a closed tab', async () => {
    const scripting = okScripting();
    const before = __cssStateSize();
    await replaceCssSerialized(25, 0, 'S', 'd', scripting);
    expect(__cssStateSize()).toBe(before + 1);
    await replaceCssSerialized(25, 0, '', 'd', scripting); // teardown -> nothing installed
    expect(__cssStateSize()).toBe(before);

    await replaceCssSerialized(26, 0, 'A', 'd', scripting); // an active (still-installed) frame
    await replaceCssSerialized(26, 1, 'B', 'e', scripting);
    expect(__cssStateSize()).toBe(before + 2);
    purgeTabCss(26);                                        // tab closed
    expect(__cssStateSize()).toBe(before);
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
