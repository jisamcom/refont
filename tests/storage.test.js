// tests/storage.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock webextension-polyfill before importing the module under test.
const store = { data: {} };
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async () => ({ ...store.data })),
        set: vi.fn(async (obj) => { Object.assign(store.data, obj); }),
      },
    },
  },
}));

import { DEFAULTS, SCHEMA_VERSION, migrate, normalizeSettings, getSettings, saveSettings } from '../src/lib/storage.js';

beforeEach(() => { store.data = {}; });

describe('DEFAULTS', () => {
  it('is enabled by default with sane values', () => {
    expect(DEFAULTS.enabled).toBe(true);
    expect(DEFAULTS.scale).toBe(1);
    expect(DEFAULTS.preserveBold).toBe(true);
    expect(Array.isArray(DEFAULTS.blocklist)).toBe(true);
    expect(DEFAULTS.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('migrate', () => {
  it('fills missing keys from DEFAULTS', () => {
    const m = migrate({ enabled: false });
    expect(m.enabled).toBe(false);
    expect(m.scale).toBe(1);
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
  });
  it('returns a full default object for empty input', () => {
    expect(migrate({})).toEqual(DEFAULTS);
    expect(migrate(undefined)).toEqual(DEFAULTS);
  });
});

describe('getSettings/saveSettings', () => {
  it('returns DEFAULTS when storage empty', async () => {
    expect(await getSettings()).toEqual(DEFAULTS);
  });
  it('persists a partial update merged over current', async () => {
    await saveSettings({ scale: 1.2 });
    const s = await getSettings();
    expect(s.scale).toBe(1.2);
    expect(s.enabled).toBe(true);
  });
});

describe('redesign fields', () => {
  it('defaults axes, weightFine, recentFonts; schema is current', () => {
    expect(DEFAULTS.axes).toBe('');
    expect(DEFAULTS.weightFine).toBe(false);
    expect(DEFAULTS.recentFonts).toEqual({ body: [], code: [] });
    expect(SCHEMA_VERSION).toBe(4);
  });
  it('migrate fills new fields for an older object and bumps version', () => {
    const m = migrate({ schemaVersion: 1, scale: 1.2 });
    expect(m.axes).toBe('');
    expect(m.weightFine).toBe(false);
    expect(m.recentFonts).toEqual({ body: [], code: [] });
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('schema 4: px → em spacing migration', () => {
  it('converts legacy px letter/word-spacing to em (÷16) for pre-v4 settings', () => {
    const m = migrate({ schemaVersion: 3, letterSpacing: 0.5, wordSpacing: 1.6 });
    expect(m.letterSpacing).toBe(0.031); // 0.5/16
    expect(m.wordSpacing).toBe(0.1); // 1.6/16
    expect(m.schemaVersion).toBe(4);
  });
  it('leaves zero spacing untouched and does not re-convert v4 settings', () => {
    expect(migrate({ schemaVersion: 3, letterSpacing: 0 }).letterSpacing).toBe(0);
    expect(migrate({ schemaVersion: 4, letterSpacing: 0.12 }).letterSpacing).toBe(0.12);
  });
});

describe('body-font self-heal', () => {
  it('default body font is a real family, not empty', () => {
    expect(DEFAULTS.bodyFont.name).toBeTruthy();
  });
  it('fills an empty system body-font name with the default (avoids forced sans-serif)', () => {
    const m = migrate({ schemaVersion: 4, bodyFont: { source: 'system', name: '', url: null, urlType: 'css' } });
    expect(m.bodyFont.name).toBe(DEFAULTS.bodyFont.name);
  });
  it('does not override a chosen system font or a web-font source', () => {
    expect(migrate({ bodyFont: { source: 'system', name: 'Georgia' } }).bodyFont.name).toBe('Georgia');
    const web = migrate({ bodyFont: { source: 'weburl', name: '', url: 'https://x/f.css', urlType: 'css' } });
    expect(web.bodyFont.name).toBe(''); // weburl empty left as-is
  });
});

describe('settings validation', () => {
  it('drops wrong types and clamps numeric controls to supported ranges', () => {
    const s = normalizeSettings({
      scale: 99,
      minSize: -4,
      letterSpacing: '0;} html{display:none}/*',
      blocklist: [' example.com ', 42],
      recentFonts: { body: 'not-an-array' },
    });
    expect(s.scale).toBe(2.5);
    expect(s.minSize).toBe(0);
    expect(s.letterSpacing).toBe(0);
    expect(s.blocklist).toEqual(['example.com']);
    expect(s.recentFonts.body).toEqual([]);
  });

  it('normalizes partial saves before persisting them', async () => {
    await saveSettings({ letterSpacing: 'bad-css', width: 999 });
    expect(store.data.letterSpacing).toBe(0);
    expect(store.data.width).toBe(200);
  });
});

describe('language setting', () => {
  it('defaults to auto', () => {
    expect(DEFAULTS.language).toBe('auto');
    expect(normalizeSettings({}).language).toBe('auto');
  });
  it('keeps valid values and clamps invalid ones to auto', () => {
    expect(normalizeSettings({ language: 'ko' }).language).toBe('ko');
    expect(normalizeSettings({ language: 'en' }).language).toBe('en');
    expect(normalizeSettings({ language: 'auto' }).language).toBe('auto');
    expect(normalizeSettings({ language: 'fr' }).language).toBe('auto');
    expect(normalizeSettings({ language: 42 }).language).toBe('auto');
  });
});
