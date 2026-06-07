import { describe, it, expect, vi } from 'vitest';
vi.mock('webextension-polyfill', () => ({ default: { runtime: {} } }));
import { settingsToState, stateToSettings, previewSize, mountSettingsUI } from '../src/ui/settings-ui.js';
import { DEFAULTS } from '../src/lib/storage.js';

describe('settingsToState / stateToSettings', () => {
  it('round-trips the core fields', () => {
    const s = { ...DEFAULTS, scale: 1.2, weight: 700, axes: 'opsz 14',
      bodyFont: { source: 'system', name: 'Batang', url: null, urlType: 'css' },
      codeFont: { source: 'system', name: 'Consolas', url: null, urlType: 'css' },
      blocklist: ['a.com'], protectionDenylistExtra: ['my-icons'] };
    const st = settingsToState(s);
    expect(st.family).toBe('Batang');
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

  it('syncs the value chips to loaded settings on mount (not just on input)', () => {
    const root = document.createElement('div');
    mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, scale: 1.5, minSize: 18, lineHeight: 1.8, letterSpacing: 0.5, weight: 0 } });
    expect(root.querySelector('#vScale').textContent).toBe('1.50×');
    expect(root.querySelector('#vMin').textContent).toBe('18px');
    expect(root.querySelector('#vMin').classList.contains('off')).toBe(false);
    expect(root.querySelector('#vLh').textContent).toBe('1.80');
    expect(root.querySelector('#vLs').textContent).toBe('0.5px');
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
  it('mounts body + code pickers and updates state.family on pick', () => {
    const root = document.createElement('div');
    const api = mountSettingsUI(root, { context: 'popup', currentHost: 'x.com', tabId: 1,
      settings: { ...DEFAULTS, bodyFont: { source: 'system', name: 'Georgia', url: null, urlType: 'css' } },
      installedFonts: ['Georgia', 'Batang'], monoFonts: ['Consolas'] });
    expect(root.querySelector('#bodyPicker .fp-btn')).toBeTruthy();
    expect(root.querySelector('#bodyPicker .fp-name').textContent).toBe('Georgia');
    root.querySelector('#bodyPicker .fp-btn').click();
    const batang = [...root.querySelectorAll('#bodyPicker .o-name')].find((n) => n.textContent === '바탕');
    batang.closest('.fp-opt').click();
    expect(api.state.family).toBe('Batang');
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
});
