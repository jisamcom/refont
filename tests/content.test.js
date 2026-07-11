import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// content.js is the DOM glue: it runs apply() on import and registers an
// onMessage listener. We import it ONCE (re-importing would leak a second live
// MutationObserver onto the shared jsdom document) and drive it through the
// captured listener + a mocked getSettings.
//
// jsdom doesn't resolve var()/calc() in getComputedStyle, so we assert the
// engine *wiring* — Refont attributes, the per-element --fc-base-size, the global
// --refont-* variables, and the injected rule sheet — plus the key guarantee
// that the author's own inline font props are never modified.

let messageListener = null;
let navigateListener = null; // captured from the mocked Navigation API at import
const fakeBrowser = {
  runtime: {
    onMessage: { addListener: (fn) => { messageListener = fn; } },
    sendMessage: vi.fn(async () => ({})),
  },
};

let currentSettings = null;
vi.mock('webextension-polyfill', () => ({ default: fakeBrowser }));
vi.mock('../src/lib/storage.js', () => ({ getSettings: vi.fn(async () => currentSettings) }));

// messaging.js is pure constants (no polyfill import) — use the real ones so the
// content listener actually matches.
import { MSG } from '../src/lib/messaging.js';

function makeSettings(over = {}) {
  return {
    enabled: true,
    bodyFont: { source: 'system', name: 'Test Sans', url: null, urlType: 'css' },
    codeFont: null,
    scale: 2, minSize: 0, weight: 0, preserveBold: true,
    lineHeight: 0, letterSpacing: 0, axes: '',
    blocklist: [], manualExclusions: {}, protectionDenylistExtra: [],
    recentFonts: { body: [], code: [] },
    ...over,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const reapply = async (settings) => { currentSettings = settings; await messageListener({ type: MSG.REAPPLY }); await tick(); };
const preview = async (settings) => { await messageListener({ type: MSG.PREVIEW_SETTINGS, settings }); await tick(); };
// Observer is off before each test (see beforeEach), so a single enabled apply
// is a clean full scan of the freshly-built fixture.
const freshApply = (settings) => reapply(settings);

const rootVar = (name) => document.documentElement.style.getPropertyValue(name);
const sheetText = () => (document.getElementById('__refont_style') || {}).textContent || '';

beforeAll(async () => {
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
  // Present a Navigation API so content.js takes the Chromium event path (and
  // skips the Firefox href-poll interval, which would dangle in the test env).
  try {
    window.navigation = { addEventListener: (type, fn) => { if (type === 'navigate') navigateListener = fn; } };
  } catch {}
  currentSettings = makeSettings();
  await import('../src/content.js');
  await tick();
});

beforeEach(async () => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  await reapply({ ...makeSettings(), enabled: false }); // tear down prior observer/marks
  fakeBrowser.runtime.sendMessage.mockClear();
});

describe('content var-engine', () => {
  it('tags a text element and records its base size without touching author styles', async () => {
    document.body.innerHTML = '<p id="t" style="font-size:12px">hello</p>';
    await freshApply(makeSettings({ scale: 2 }));
    const p = document.getElementById('t');
    expect(p.hasAttribute('data-fc')).toBe(true);
    expect(p.hasAttribute('data-fc-size')).toBe(true);
    expect(p.hasAttribute('data-fc-wlight')).toBe(true);
    expect(p.style.getPropertyValue('--fc-base-size')).toBe('12px');
    // The author's own font-size is left exactly as written.
    expect(p.style.getPropertyValue('font-size')).toBe('12px');
    // Scale lives in a global variable.
    expect(rootVar('--refont-scale')).toBe('2');
  });

  it('drives a value-only preview through a single variable, not a DOM rewalk (P1 perf)', async () => {
    document.body.innerHTML = '<p id="t" style="font-size:10px">hi</p>';
    await freshApply(makeSettings({ scale: 2 }));
    const p = document.getElementById('t');
    expect(rootVar('--refont-scale')).toBe('2');

    await preview(makeSettings({ scale: 3 }));
    expect(rootVar('--refont-scale')).toBe('3');
    // The element is untouched by the preview — only the variable changed.
    expect(p.style.getPropertyValue('--fc-base-size')).toBe('10px');
    expect(p.style.getPropertyValue('font-size')).toBe('10px'); // author still intact
  });

  it('reverts losslessly when disabled — author font-size survives (P1)', async () => {
    document.body.innerHTML = '<p id="t" style="font-size:12px">hello</p>';
    await freshApply(makeSettings({ scale: 2 }));
    const p = document.getElementById('t');

    await reapply(makeSettings({ scale: 2, enabled: false }));
    expect(p.hasAttribute('data-fc')).toBe(false);
    expect(p.hasAttribute('data-fc-size')).toBe(false);
    expect(p.style.getPropertyValue('--fc-base-size')).toBe('');
    expect(p.style.getPropertyValue('font-size')).toBe('12px'); // never destroyed
    expect(rootVar('--refont-scale')).toBe(''); // variables cleared
  });

  it('buckets weight by original boldness and toggles preserveBold via the sheet shape', async () => {
    document.body.innerHTML = '<p id="n" style="font-weight:400">n</p><p id="b" style="font-weight:700">b</p>';
    await freshApply(makeSettings({ weight: 600, preserveBold: true }));
    expect(document.getElementById('n').hasAttribute('data-fc-wlight')).toBe(true);
    expect(document.getElementById('b').hasAttribute('data-fc-wbold')).toBe(true);
    expect(rootVar('--refont-weight')).toBe('600');
    // preserveBold ON → only light elements weighted.
    expect(sheetText()).toContain('[data-fc-wlight]{font-weight:var(--refont-weight)');
    expect(sheetText()).not.toContain('[data-fc-wbold]');

    // Toggling preserveBold off is an O(1) sheet-shape swap (no re-tagging).
    await preview(makeSettings({ weight: 600, preserveBold: false }));
    expect(sheetText()).toContain('[data-fc-wbold]{font-weight:var(--refont-weight)');
  });

  it('injects the web-font @font-face with the chosen font-display (file URL)', async () => {
    fakeBrowser.runtime.sendMessage.mockImplementation(async (m) => {
      if (m && m.type === MSG.FETCH_FONT) return 'data:font/woff2;base64,AAAA';
      return {};
    });
    const weburl = makeSettings({
      bodyFont: { source: 'weburl', name: 'Pretendard', url: 'https://x/p.woff2', urlType: 'file' },
      webfontDisplay: 'optional',
    });
    await freshApply(weburl);
    await tick();
    const ff = document.getElementById('__refont_webfont');
    expect(ff).not.toBeNull();
    expect(ff.textContent).toContain('font-display:optional');
    expect(ff.textContent).toContain('@font-face');
    fakeBrowser.runtime.sendMessage.mockImplementation(async () => ({}));
  });

  it('tags an element whose text is added AFTER it is inserted (dynamic textContent — ExtJS/jQuery)', async () => {
    await freshApply(makeSettings());
    const d = document.createElement('div');
    document.body.appendChild(d); // inserted empty → scanned + skipped (no direct text)
    await tick();
    expect(d.hasAttribute('data-fc')).toBe(false);
    d.textContent = 'filled later'; // text node added to an existing element (childList, not characterData)
    await tick();
    expect(d.hasAttribute('data-fc')).toBe(true);
  });

  it('leaves a protected (icon-font) element untouched', async () => {
    document.body.innerHTML = '<span id="ic" style="font-family:FontAwesome;font-size:12px">icon</span>';
    await freshApply(makeSettings({ scale: 2 }));
    const ic = document.getElementById('ic');
    expect(ic.hasAttribute('data-fc')).toBe(false);
    expect(ic.style.getPropertyValue('font-size')).toBe('12px');
  });

  it('tags nested eligible elements (two-pass read-then-write covers the whole subtree)', async () => {
    document.body.innerHTML = '<div id="o" style="font-size:16px">outer <span id="i" style="font-size:12px">inner</span></div>';
    await freshApply(makeSettings({ scale: 2 }));
    // Both the parent (direct text "outer ") and the child are tagged from their
    // own original base — the write pass doesn't perturb the read pass.
    expect(document.getElementById('o').getAttribute('data-fc')).toBe('');
    expect(document.getElementById('o').style.getPropertyValue('--fc-base-size')).toBe('16px');
    expect(document.getElementById('i').getAttribute('data-fc')).toBe('');
    expect(document.getElementById('i').style.getPropertyValue('--fc-base-size')).toBe('12px');
  });

  it('reclassifies a tagged SPA element when it becomes an icon', async () => {
    document.body.innerHTML = '<span id="mutable">normal text</span>';
    await freshApply(makeSettings());
    const el = document.getElementById('mutable');
    expect(el.hasAttribute('data-fc')).toBe(true);

    el.className = 'new-icon-role';
    el.style.fontFamily = 'Material Icons';
    el.textContent = 'menu';
    await tick();
    await tick();
    expect(el.hasAttribute('data-fc')).toBe(false);
  });

  it('ignores observer records caused only by Refont custom properties', async () => {
    document.body.innerHTML = '<p id="t">hello</p>';
    await freshApply(makeSettings());
    const el = document.getElementById('t');
    expect(el.hasAttribute('data-fc')).toBe(true);
    await tick();
    expect(el.hasAttribute('data-fc')).toBe(true);
  });

  it('does not append a stale web font after a newer apply wins', async () => {
    let resolveOld;
    let fetchCount = 0;
    fakeBrowser.runtime.sendMessage.mockImplementation(async (m) => {
      if (!m || m.type !== MSG.FETCH_FONT) return {};
      fetchCount += 1;
      if (fetchCount === 1) return new Promise((resolve) => { resolveOld = resolve; });
      return 'data:font/woff2;base64,NEW';
    });
    const oldSettings = makeSettings({
      bodyFont: { source: 'weburl', name: 'Race Font', url: 'https://x/old.woff2', urlType: 'file' },
    });
    const newSettings = makeSettings({
      bodyFont: { source: 'weburl', name: 'Race Font', url: 'https://x/new.woff2', urlType: 'file' },
    });

    await freshApply(oldSettings);
    await preview(newSettings);
    await tick();
    expect(document.querySelectorAll('#__refont_webfont')).toHaveLength(1);
    expect(document.getElementById('__refont_webfont').textContent).toContain('base64,NEW');

    resolveOld('data:font/woff2;base64,OLD');
    await tick();
    expect(document.querySelectorAll('#__refont_webfont')).toHaveLength(1);
    expect(document.getElementById('__refont_webfont').textContent).not.toContain('base64,OLD');
    fakeBrowser.runtime.sendMessage.mockImplementation(async () => ({}));
  });

  it('serves page-font metadata from the classification cache', async () => {
    document.body.innerHTML = '<p style="font-family:Georgia">body</p><span style="font-family:FontAwesome">icon</span>';
    await freshApply(makeSettings());
    const fonts = await messageListener({ type: MSG.GET_PAGE_FONTS });
    expect(fonts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Georgia', protected: false }),
      expect.objectContaining({ name: 'FontAwesome', protected: true }),
    ]));
  });

  it('still lists page fonts when Refont is inactive (disabled) via a live DOM fallback', async () => {
    document.body.innerHTML = '<p style="font-family:Georgia">body</p>';
    // Disabled → no classification pass runs, so the cache is empty. The popup
    // must still be able to show the page's fonts.
    await reapply(makeSettings({ enabled: false }));
    const fonts = await messageListener({ type: MSG.GET_PAGE_FONTS });
    expect(fonts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Georgia' }),
    ]));
  });

  it('re-evaluates text-bearing descendants when a container attribute changes (descendant-selector safety)', async () => {
    // A descendant selector like `.dark #child { font-family: "Material Icons" }`
    // restyles the child through the PARENT's class alone — no mutation fires on
    // the child. Refont must re-read the child so a child that becomes an icon
    // isn't left tagged (and clobbered by the !important body-font rule).
    document.body.innerHTML = '<div id="c"><span id="child" style="font-size:12px">text</span></div>';
    await freshApply(makeSettings());
    expect(document.getElementById('child').hasAttribute('data-fc')).toBe(true);

    const spy = vi.spyOn(globalThis, 'getComputedStyle');
    document.getElementById('c').className = 'dark'; // parent attr change only
    await tick();
    await tick();
    const readChild = spy.mock.calls.some((c) => c[0] && c[0].id === 'child');
    expect(readChild).toBe(true);
    spy.mockRestore();
  });

  it('re-evaluates the blocklist against the current URL on reapply (SPA navigation)', async () => {
    document.body.innerHTML = '<p id="t">hi</p>';
    history.replaceState({}, '', '/');
    await freshApply(makeSettings({ blocklist: [] }));
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(true);

    // SPA route change to a path that a new blocklist entry covers.
    history.replaceState({}, '', '/app/blocked');
    await reapply(makeSettings({ blocklist: ['localhost/app/blocked'] }));
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(false);
    history.replaceState({}, '', '/');
  });

  it('reverts on a Chromium Navigation API navigate event (pushState, no popstate)', async () => {
    expect(typeof navigateListener).toBe('function'); // wired at import from window.navigation
    document.body.innerHTML = '<p id="t">hi</p>';
    history.replaceState({}, '', '/');
    await freshApply(makeSettings({ blocklist: ['localhost/admin'] }));
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(true);

    // pushState-style navigation fires `navigate`, not popstate.
    history.replaceState({}, '', '/admin');
    navigateListener();
    await tick();
    await tick();
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(false);
    history.replaceState({}, '', '/');
  });

  it('reverts on a real SPA navigation into a blocked path (popstate, no settings change)', async () => {
    document.body.innerHTML = '<p id="t">hi</p>';
    history.replaceState({}, '', '/');
    await freshApply(makeSettings({ blocklist: ['localhost/members'] }));
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(true);

    // Route change with NO save/preview/reload — only a navigation event fires.
    history.replaceState({}, '', '/members');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await tick();
    await tick();
    expect(document.getElementById('t').hasAttribute('data-fc')).toBe(false);
    history.replaceState({}, '', '/');
  });

  it('does not return a response promise for REAPPLY (no dangling message channel)', async () => {
    currentSettings = makeSettings();
    const ret = messageListener({ type: MSG.REAPPLY });
    expect(ret).toBeUndefined();
    await tick();
  });
});
