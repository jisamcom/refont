import { describe, it, expect, vi } from 'vitest';
vi.mock('webextension-polyfill', () => ({ default: { runtime: {} } }));
import browserMock from 'webextension-polyfill';
import { settingsToState, stateToSettings, previewSize, mountSettingsUI, familyFromCssUrl } from '../src/ui/settings-ui.js';
import { DEFAULTS } from '../src/lib/storage.js';
import { MSG } from '../src/lib/messaging.js';

// Existing assertions expect Korean; DEFAULTS.language is 'auto', so pin the
// jsdom browser language to Korean for these tests.
Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });

describe('settingsToState / stateToSettings', () => {
  it('round-trips the core fields', () => {
    const s = { ...DEFAULTS, scale: 1.2, weight: 700, axes: 'opsz 14',
      bodyFont: { source: 'system', name: 'Batang', url: null, urlType: 'css' },
      codeFont: { source: 'system', name: 'Consolas', url: null, urlType: 'css' },
      blocklist: ['a.com'], protectionDenylistExtra: ['my-icons'] };
    const st = settingsToState(s);
    expect(st.systemFamily).toBe('Batang');
    expect(st.codeEnabled).toBe(true);
    expect(st.codeFamily).toBe('Consolas');
    expect(st.blocklist).toEqual(['a.com']);
    const back = stateToSettings(st);
    expect(back.scale).toBe(1.2);
    expect(back.bodyFont.name).toBe('Batang');
    expect(back.codeFont.name).toBe('Consolas');
    expect(back.protectionDenylistExtra).toEqual(['my-icons']);
  });
  it('codeFont is null when codeEnabled false', () => {
    const st = settingsToState({ ...DEFAULTS, codeFont: null });
    expect(st.codeEnabled).toBe(false);
    expect(stateToSettings(st).codeFont).toBeNull();
  });
  it('round-trips width and opticalSizing', () => {
    const st = settingsToState({ ...DEFAULTS, width: 90, opticalSizing: 'none' });
    expect(st.width).toBe(90);
    expect(st.opticalSizing).toBe('none');
    const back = stateToSettings(st);
    expect(back.width).toBe(90);
    expect(back.opticalSizing).toBe('none');
  });
  it('round-trips wordSpacing', () => {
    const st = settingsToState({ ...DEFAULTS, wordSpacing: 2 });
    expect(st.wordSpacing).toBe(2);
    expect(stateToSettings(st).wordSpacing).toBe(2);
  });
});

describe('previewSize', () => {
  it('scales and applies the min floor proportionally to the EN base', () => {
    expect(previewSize(16, 1.5, 0, 16)).toBe(24);
    expect(previewSize(16, 1, 20, 16)).toBe(20);
  });
});

describe('mountSettingsUI', () => {
  it('renders the popup frame with all sections', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'news.example.com', tabId: 1, settings: { ...DEFAULTS } });
    expect(root.querySelector('.popup')).toBeTruthy();
    expect(root.querySelector('#srcSeg')).toBeTruthy();
    expect(root.querySelector('#rWeight')).toBeTruthy();
    expect(root.querySelector('#save')).toBeTruthy();
    expect(document.body.classList.contains('ctx-popup')).toBe(true);
  });

  it('renders English when settings.language is en', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, language: 'en' } });
    const krTitles = [...root.querySelectorAll('.sec-h .t.kr')].map((e) => e.textContent);
    expect(krTitles).toContain('Exclude this site');
    expect(krTitles).toContain('Protected fonts');
    expect(root.querySelector('#save').textContent).toBe('Save');
    expect(root.querySelector('#vWidth').textContent).toBe('Original');
  });

  it('persists the language and reloads when the selector changes (options only)', async () => {
    const root = document.createElement('div');
    const sent = [];
    const reload = vi.fn();
    mountSettingsUI(root, { context: 'options', currentHost: null, reload,
      settings: { ...DEFAULTS }, send: (m) => { sent.push(m); return Promise.resolve({}); } });
    const sel = root.querySelector('#langSel');
    expect(root.querySelector('#langRow').hidden).toBe(false); // shown on options
    sel.value = 'en';
    sel.dispatchEvent(new Event('change'));
    await Promise.resolve(); await Promise.resolve();
    expect(sent).toContainEqual({ type: MSG.SAVE_SETTINGS, payload: { language: 'en' } });
    expect(reload).toHaveBeenCalled();
  });

  it('hides the language selector in the popup', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS } });
    expect(root.querySelector('#langRow').hidden).toBe(true);
  });
});

describe('live preview wiring', () => {
  it('updates the specimen font-size and weight when sliders change', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS, scale: 1, weight: 0 } });
    const rWeight = root.querySelector('#rWeight');
    rWeight.value = '800'; rWeight.dispatchEvent(new Event('input'));
    expect(root.querySelector('#sKr').style.fontWeight).toBe('800');
    const rScale = root.querySelector('#rScale');
    rScale.value = '2'; rScale.dispatchEvent(new Event('input'));
    expect(parseFloat(root.querySelector('#sEn').style.fontSize)).toBeGreaterThan(20);
  });

  it('the accessibility preset bumps min-size/line-height/letter+word-spacing in one click', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS } });
    root.querySelector('#presetA11y').click();
    expect(api.state.minSize).toBe(18);
    expect(api.state.lineHeight).toBe(1.7);
    expect(api.state.letterSpacing).toBe(0.12); // WCAG 1.4.12 em values
    expect(api.state.wordSpacing).toBe(0.16);
    // chips + specimen reflect it
    expect(root.querySelector('#vMin').textContent).toBe('18px');
    expect(root.querySelector('#sKr').style.wordSpacing).toBe('0.16em');
  });

  it('drives specimen font-stretch from the width dial and font-optical-sizing from the toggle', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS } });
    const rWidth = root.querySelector('#rWidth');
    rWidth.value = '80'; rWidth.dispatchEvent(new Event('input'));
    expect(api.state.width).toBe(80);
    expect(root.querySelector('#sKr').style.fontStretch).toBe('80%');
    const ckOptical = root.querySelector('#ckOptical');
    ckOptical.click(); // auto → none
    expect(api.state.opticalSizing).toBe('none');
    expect(root.querySelector('#sKr').style.fontOpticalSizing).toBe('none');
  });

  it('treats width 100% as 원본/off — a local way back after the slider is touched', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS } });
    const rWidth = root.querySelector('#rWidth');
    rWidth.value = '80'; rWidth.dispatchEvent(new Event('input'));
    expect(api.state.width).toBe(80);
    rWidth.value = '100'; rWidth.dispatchEvent(new Event('input')); // back to neutral
    expect(api.state.width).toBe(0);
    expect(root.querySelector('#vWidth').textContent).toBe('원본');
  });

  it('syncs the value chips to loaded settings on mount (not just on input)', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, scale: 1.5, minSize: 18, lineHeight: 1.8, letterSpacing: 0.12, weight: 0 } });
    expect(root.querySelector('#vScale').textContent).toBe('1.50×');
    expect(root.querySelector('#vMin').textContent).toBe('18px');
    expect(root.querySelector('#vMin').classList.contains('off')).toBe(false);
    expect(root.querySelector('#vLh').textContent).toBe('1.80');
    expect(root.querySelector('#vLs').textContent).toBe('0.12em');
    expect(root.querySelector('#vWeight').textContent).toBe('원본'); // weight:0 preserved
  });

  it('marks the Korean section titles with the .kr class for readable Pretendard', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS } });
    const krTitles = [...root.querySelectorAll('.sec-h .t.kr')].map((e) => e.textContent);
    expect(krTitles).toContain('이 사이트 제외');
    expect(krTitles).toContain('보호 폰트');
  });
});

describe('font pickers', () => {
  it('mounts body + code pickers and updates state.systemFamily on pick', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, bodyFont: { source: 'system', name: 'Georgia', url: null, urlType: 'css' } },
      installedFonts: ['Georgia', 'Batang'], monoFonts: ['Consolas'] });
    expect(root.querySelector('#bodyPicker .fp-btn')).toBeTruthy();
    expect(root.querySelector('#bodyPicker .fp-name').textContent).toBe('Georgia');
    root.querySelector('#bodyPicker .fp-btn').click();
    const batang = [...root.querySelectorAll('#bodyPicker .o-name')].find((n) => n.textContent === '바탕');
    batang.closest('.fp-opt').click();
    expect(api.state.systemFamily).toBe('Batang');
  });
});

describe('web font family (system vs web split)', () => {
  it('familyFromCssUrl extracts a Google Fonts family (axes stripped, + → space)', () => {
    expect(familyFromCssUrl('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap')).toBe('Open Sans');
    expect(familyFromCssUrl('https://fonts.googleapis.com/css?family=Roboto')).toBe('Roboto');
    expect(familyFromCssUrl('https://example.com/style.css')).toBe(''); // non-Google → no family param
    expect(familyFromCssUrl('not a url')).toBe('');
  });
  it('a CSS-link source saves the URL-derived family, not the system picker family', () => {
    const st = settingsToState({ ...DEFAULTS,
      bodyFont: { source: 'weburl', name: 'Roboto', url: 'https://fonts.googleapis.com/css2?family=Roboto', urlType: 'css' } });
    expect(st.systemFamily).toBe(DEFAULTS.bodyFont.name); // system family untouched
    expect(st.webFamily).toBe('Roboto');
    // Even if a leftover systemFamily is present, the saved body name is the web font.
    st.systemFamily = 'Pretendard Variable';
    expect(stateToSettings(st).bodyFont.name).toBe('Roboto');
  });
  it('effectiveFamily falls back to the URL when the web family field is empty', () => {
    const st = settingsToState({ ...DEFAULTS,
      bodyFont: { source: 'weburl', name: '', url: 'https://fonts.googleapis.com/css2?family=Lora', urlType: 'css' } });
    expect(stateToSettings(st).bodyFont.name).toBe('Lora');
  });
  it('auto-fills the web family field from a pasted Google Fonts URL (options)', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'options', currentHost: null,
      settings: { ...DEFAULTS, bodyFont: { source: 'weburl', name: '', url: '', urlType: 'css' } } });
    const webUrl = root.querySelector('#webUrl');
    webUrl.value = 'https://fonts.googleapis.com/css2?family=Nanum+Gothic';
    webUrl.dispatchEvent(new Event('input'));
    expect(root.querySelector('#webFamily').value).toBe('Nanum Gothic');
    expect(api.state.webFamily).toBe('Nanum Gothic');
  });
});

describe('Local Font Access picker', () => {
  it('hides the load-local button where queryLocalFonts is unavailable', () => {
    delete globalThis.window.queryLocalFonts;
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS },
      installedFonts: ['Georgia'], monoFonts: ['Consolas'] });
    expect(root.querySelector('#loadLocal').hidden).toBe(true);
  });
  it('shows the button and adds queried families to the body picker (Chromium path)', async () => {
    globalThis.window.queryLocalFonts = async () => ([{ family: 'Wingaroo Sans' }, { family: 'Georgia' }]);
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS },
      installedFonts: ['Georgia'], monoFonts: ['Consolas'] });
    const btn = root.querySelector('#loadLocal');
    expect(btn.hidden).toBe(false);
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    root.querySelector('#bodyPicker .fp-btn').click();
    const names = [...root.querySelectorAll('#bodyPicker .o-name')].map((n) => n.textContent);
    expect(names).toContain('Wingaroo Sans'); // newly enumerated family is now pickable
    delete globalThis.window.queryLocalFonts;
  });
});

describe('scope + protection', () => {
  it('renders the current host and adds it to the blocklist textarea', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'news.example.com', tabId: 1, settings: { ...DEFAULTS } });
    expect(root.querySelector('#curHost').textContent).toContain('news.example.com');
    root.querySelector('#addHost').click();
    expect(root.querySelector('#blocklist').value).toContain('news.example.com');
  });
  it('renders page fonts and adds one to the protect list on +', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS },
      pageFonts: [{ name: 'Font Awesome 6 Free', protected: true }, { name: 'Pretendard', protected: false }] });
    const rows = root.querySelectorAll('#pageFonts .chip');
    expect(rows.length).toBe(2);
    rows[0].querySelector('.plus').click();
    expect(root.querySelector('#protect').value).toContain('Font Awesome 6 Free');
  });
  it('popup toggle sends the desired enable state and mirrors an allow-exception for a parent-blocked site', () => {
    const root = document.createElement('div');
    const sent = [];
    mountSettingsUI(root, {
      context: 'popup', currentHost: 'sub.example.com', currentUrl: 'https://sub.example.com/', tabId: 1,
      blocked: true, settings: { ...DEFAULTS, blocklist: ['example.com'] },
      send: (m) => { sent.push(m); return Promise.resolve({}); },
    });
    root.querySelector('#toggle').click(); // currently blocked by the parent rule → turn ON
    expect(sent).toContainEqual({ type: MSG.TOGGLE_SITE, url: 'https://sub.example.com/', enable: true });
    expect(root.querySelector('#allowlist').value).toBe('sub.example.com'); // exception added...
    expect(root.querySelector('#blocklist').value).toBe('example.com');     // ...parent rule untouched
  });
  it('round-trips the allowlist through the options editor', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'options', currentHost: null,
      settings: { ...DEFAULTS, allowlist: ['keep.example.com'] } });
    const alEl = root.querySelector('#allowlist');
    expect(alEl.value).toBe('keep.example.com');
    alEl.value = 'keep.example.com\nalso.example.com';
    alEl.dispatchEvent(new Event('input'));
    expect(api.state.allowlist).toEqual(['keep.example.com', 'also.example.com']);
  });
});

describe('reset to defaults', () => {
  it('arms on first click, restores defaults on second click', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, scale: 2 }, previewSend: () => {} });
    expect(root.querySelector('#vScale').textContent).toBe('2.00×');
    const reset = root.querySelector('#reset');
    reset.click();
    expect(reset.textContent).toContain('한번 더');
    reset.click();
    expect(root.querySelector('#vScale').textContent).toBe('1.00×');
  });
});

describe('live apply to current tab', () => {
  it('debounce-sends PREVIEW_SETTINGS to the tab on edit (popup)', () => {
    vi.useFakeTimers();
    const previews = [];
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 7, settings: { ...DEFAULTS, scale: 1 },
      previewSend: (s) => previews.push(s) });
    const rScale = root.querySelector('#rScale');
    rScale.value = '1.6'; rScale.dispatchEvent(new Event('input'));
    expect(previews.length).toBe(0); // debounced, not yet
    vi.advanceTimersByTime(300);
    expect(previews.length).toBe(1);
    expect(previews[0].scale).toBe(1.6);
    vi.useRealTimers();
  });
  it('attaches a rejection handler to the default tab send (receiver-less tab)', () => {
    vi.useFakeTimers();
    // The tab has no content script: tabs.sendMessage rejects asynchronously.
    const rejected = { catch: vi.fn(() => rejected) };
    browserMock.tabs = { sendMessage: vi.fn(() => rejected) };
    const root = document.createElement('div');
    // No previewSend → the built-in default (which calls browser.tabs.sendMessage) runs.
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 9, settings: { ...DEFAULTS, scale: 1 } });
    const rScale = root.querySelector('#rScale');
    rScale.value = '1.4'; rScale.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(300);
    expect(browserMock.tabs.sendMessage).toHaveBeenCalled();
    expect(rejected.catch).toHaveBeenCalled(); // rejection swallowed, not left unhandled
    delete browserMock.tabs;
    vi.useRealTimers();
  });
  it('does not live-apply in options context', () => {
    vi.useFakeTimers();
    const previews = [];
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'options', currentHost: null, settings: { ...DEFAULTS },
      previewSend: (s) => previews.push(s) });
    const rScale = root.querySelector('#rScale');
    rScale.value = '1.6'; rScale.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(500);
    expect(previews.length).toBe(0);
    vi.useRealTimers();
  });
});

describe('recent fonts', () => {
  it('records a body pick into state.recentFonts.body (most-recent first, deduped)', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, recentFonts: { body: ['Georgia'], code: [] } },
      installedFonts: ['Georgia', 'Batang', 'Verdana'], monoFonts: ['Consolas'] });
    root.querySelector('#bodyPicker .fp-btn').click();
    const batang = [...root.querySelectorAll('#bodyPicker .o-name')].find((n) => n.textContent === '바탕');
    batang.closest('.fp-opt').click();
    expect(api.state.recentFonts.body[0]).toBe('Batang');
    expect(api.state.recentFonts.body).toContain('Georgia');
  });
});

describe('per-site element exclusions', () => {
  it('loads + edits manualExclusions for the current host (popup)', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'shop.example.com', tabId: 1,
      settings: { ...DEFAULTS, manualExclusions: { 'shop.example.com': ['.price'] } } });
    const sel = root.querySelector('#selExclude');
    expect(sel.value).toBe('.price');
    sel.value = '.price\n.sku'; sel.dispatchEvent(new Event('input'));
    expect(api.state.manualExclusions['shop.example.com']).toEqual(['.price', '.sku']);
    sel.value = ''; sel.dispatchEvent(new Event('input'));
    expect('shop.example.com' in api.state.manualExclusions).toBe(false);
  });
  it('hides the editor and shows a note in options context', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'options', currentHost: null, settings: { ...DEFAULTS } });
    expect(root.querySelector('#selExclude').style.display).toBe('none');
    expect(root.querySelector('#selNote').style.display).not.toBe('none');
  });
});

describe('actions', () => {
  it('saves the current state via SAVE_SETTINGS', async () => {
    const sent = [];
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS },
      send: (m) => { sent.push(m); return Promise.resolve({}); } });
    api.state.scale = 1.4;
    root.querySelector('#save').click();
    await Promise.resolve();
    const saveMsg = sent.find((m) => m.type === 'SAVE_SETTINGS');
    expect(saveMsg).toBeTruthy();
    expect(saveMsg.payload.scale).toBe(1.4);
  });
  it('shows a failure state when saving rejects', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1, settings: { ...DEFAULTS },
      send: () => Promise.reject(new Error('storage unavailable')) });
    const save = root.querySelector('#save');
    save.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(save.textContent).toBe('저장 실패');
    expect(save.disabled).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(save.textContent).toBe('저장');
    expect(save.disabled).toBe(false);
    vi.useRealTimers();
  });
});
