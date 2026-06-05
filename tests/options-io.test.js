// tests/options-io.test.js
import { describe, it, expect } from 'vitest';
import { serializeSettings, parseSettings } from '../src/options.js';
import { DEFAULTS } from '../src/lib/storage.js';

// options.js imports webextension-polyfill — mock it so the import resolves.
import { vi } from 'vitest';
vi.mock('webextension-polyfill', () => ({ default: { runtime: {} } }));

describe('settings import/export', () => {
  it('serializes to JSON and parses back', () => {
    const json = serializeSettings({ ...DEFAULTS, scale: 1.3 });
    const parsed = parseSettings(json);
    expect(parsed.scale).toBe(1.3);
    expect(parsed.enabled).toBe(true);
  });
  it('rejects invalid JSON', () => {
    expect(() => parseSettings('{not json')).toThrow();
  });
  it('drops unknown keys (keeps only schema keys)', () => {
    const parsed = parseSettings(JSON.stringify({ scale: 2, hackedKey: 1 }));
    expect(parsed.scale).toBe(2);
    expect('hackedKey' in parsed).toBe(false);
  });
});
