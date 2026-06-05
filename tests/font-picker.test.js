import { describe, it, expect, vi } from 'vitest';
import { filterFonts, makeFontPicker } from '../src/ui/font-picker.js';

const FONTS = [{ f: 'Pretendard Variable' }, { f: 'Batang', ko: '바탕' }, { f: 'Georgia' }];

describe('filterFonts', () => {
  it('matches family and Korean name, case-insensitively', () => {
    expect(filterFonts(FONTS, 'geo').map((o) => o.f)).toEqual(['Georgia']);
    expect(filterFonts(FONTS, '바').map((o) => o.f)).toEqual(['Batang']);
    expect(filterFonts(FONTS, '').length).toBe(3);
  });
});

describe('makeFontPicker', () => {
  it('renders a button showing the current value label and calls onChange on pick', () => {
    const mount = document.createElement('div');
    const onChange = vi.fn();
    const api = makeFontPicker(mount, { fonts: FONTS, value: 'Batang', onChange });
    expect(mount.querySelector('.fp-name').textContent).toBe('바탕');
    // open + pick Georgia
    mount.querySelector('.fp-btn').click();
    const georgia = [...mount.querySelectorAll('.fp-opt .o-name')].find((n) => n.textContent === 'Georgia');
    georgia.closest('.fp-opt').click();
    expect(onChange).toHaveBeenCalledWith('Georgia');
    expect(api.value).toBe('Georgia');
  });
});
