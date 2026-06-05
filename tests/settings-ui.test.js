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
});
