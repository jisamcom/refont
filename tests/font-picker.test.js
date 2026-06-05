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

  it('renders a 최근 group from recent (with Korean labels) above the full list', () => {
    const mount = document.createElement('div');
    makeFontPicker(mount, { fonts: FONTS, value: 'Georgia', recent: ['Batang'] });
    mount.querySelector('.fp-btn').click();
    expect([...mount.querySelectorAll('.fp-group')].map((e) => e.textContent)).toEqual(['최근', '전체']);
    const names = [...mount.querySelectorAll('.o-name')].map((n) => n.textContent);
    expect(names.filter((n) => n === '바탕').length).toBe(2); // recent + full list
  });

  it('omits the 최근 group when a search query is active', () => {
    const mount = document.createElement('div');
    makeFontPicker(mount, { fonts: FONTS, value: 'Georgia', recent: ['Batang'] });
    mount.querySelector('.fp-btn').click();
    const search = mount.querySelector('.fp-search');
    search.value = 'geo'; search.dispatchEvent(new Event('input'));
    expect(mount.querySelectorAll('.fp-group').length).toBe(0);
  });
});
