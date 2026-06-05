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

import { DEFAULTS, SCHEMA_VERSION, migrate, getSettings, saveSettings } from '../src/lib/storage.js';

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
