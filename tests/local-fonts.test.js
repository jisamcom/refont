import { describe, it, expect, afterEach } from 'vitest';
import { localFontsSupported, dedupeFamilies, queryInstalledFamilies } from '../src/lib/local-fonts.js';

afterEach(() => { delete globalThis.window.queryLocalFonts; });

describe('dedupeFamilies', () => {
  it('collapses to unique family names, sorted', () => {
    expect(dedupeFamilies([
      { family: 'Pretendard', postscriptName: 'Pretendard-Regular' },
      { family: 'Pretendard', postscriptName: 'Pretendard-Bold' },
      { family: 'Arial' },
    ])).toEqual(['Arial', 'Pretendard']);
  });
  it('ignores entries without a family and handles empty', () => {
    expect(dedupeFamilies([{ postscriptName: 'x' }, null, { family: '' }])).toEqual([]);
    expect(dedupeFamilies()).toEqual([]);
  });
});

describe('localFontsSupported', () => {
  it('is false without window.queryLocalFonts, true with it', () => {
    expect(localFontsSupported()).toBe(false);
    globalThis.window.queryLocalFonts = () => Promise.resolve([]);
    expect(localFontsSupported()).toBe(true);
  });
});

describe('queryInstalledFamilies', () => {
  it('rejects when the API is unavailable', async () => {
    await expect(queryInstalledFamilies()).rejects.toThrow();
  });
  it('returns a deduped family list when supported', async () => {
    globalThis.window.queryLocalFonts = async () => ([
      { family: 'B Font' }, { family: 'A Font' }, { family: 'B Font' },
    ]);
    await expect(queryInstalledFamilies()).resolves.toEqual(['A Font', 'B Font']);
  });
});
