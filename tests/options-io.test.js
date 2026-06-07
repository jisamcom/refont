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
  it('migrates an older (schema 3) export on import: px spacing → em', () => {
    const v3 = JSON.stringify({ schemaVersion: 3, letterSpacing: 0.5, wordSpacing: 1.6 });
    const parsed = parseSettings(v3);
    expect(parsed.letterSpacing).toBe(0.031); // 0.5 / 16
    expect(parsed.wordSpacing).toBe(0.1); // 1.6 / 16
    expect(parsed.schemaVersion).toBe(4);
  });
  it('rejects a non-object JSON payload', () => {
    expect(() => parseSettings('5')).toThrow();
    expect(() => parseSettings('[1,2]')).toThrow();
  });
});
