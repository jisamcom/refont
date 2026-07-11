import { describe, it, expect, vi, beforeAll } from 'vitest';

// Exercises the SPA-navigation fallback that runs when the Navigation API is
// absent (Firefox) or in an opaque child frame: a low-frequency effective-URL
// poll. content.test.js injects window.navigation and so only covers the
// Chromium event path; here we import content.js in a fresh module registry with
// NO Navigation API, under fake timers, so the setInterval poll is exercised.

let messageListener = null;
const fakeBrowser = {
  runtime: {
    onMessage: { addListener: (fn) => { messageListener = fn; } },
    sendMessage: vi.fn(async () => ({})),
  },
};
let currentSettings = null;
vi.mock('webextension-polyfill', () => ({ default: fakeBrowser }));
vi.mock('../src/lib/storage.js', () => ({ getSettings: vi.fn(async () => currentSettings) }));
import { MSG } from '../src/lib/messaging.js';

function makeSettings(over = {}) {
  return {
    enabled: true,
    bodyFont: { source: 'system', name: 'Test Sans', url: null, urlType: 'css' },
    codeFont: null, scale: 2, minSize: 0, weight: 0, preserveBold: true,
    lineHeight: 0, letterSpacing: 0, axes: '',
    blocklist: [], manualExclusions: {}, protectionDenylistExtra: [],
    recentFonts: { body: [], code: [] },
    ...over,
  };
}

beforeAll(async () => {
  // Fake only the timer functions so the poll's setInterval is captured; leave
  // requestAnimationFrame as an immediate stub so the flush/onNavigation schedule
  // runs synchronously.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
  try { delete window.navigation; } catch {} // no Navigation API → poll fallback
  currentSettings = makeSettings();
  await import('../src/content.js');
  await vi.advanceTimersByTimeAsync(0);
});

describe('SPA navigation poll fallback (no Navigation API)', () => {
  it('detects a pushState URL change within the poll interval and reverts on a blocked path', async () => {
    history.replaceState({}, '', '/');
    document.body.innerHTML = '<p id="t">hi</p>';
    currentSettings = makeSettings({ blocklist: ['localhost/admin'] });
    await messageListener({ type: MSG.REAPPLY });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(true);

    // Route change that fires neither popstate nor a Navigation API event.
    history.replaceState({}, '', '/admin');
    await vi.advanceTimersByTimeAsync(1000); // one poll tick
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(false);
  });
});
