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

  it('wires combobox aria-controls/activedescendant and keeps selection separate from the keyboard highlight', () => {
    const mount = document.createElement('div');
    makeFontPicker(mount, { fonts: FONTS, value: 'Batang' }); // Batang is the selected value
    const search = mount.querySelector('.fp-search');
    const list = mount.querySelector('.fp-list');
    expect(list.id).toBeTruthy();
    expect(search.getAttribute('aria-controls')).toBe(list.id); // combobox points at the listbox
    mount.querySelector('.fp-btn').click();
    // The selected row is aria-selected=true and stays so as the highlight moves.
    const selected = [...mount.querySelectorAll('.fp-opt')].find((r) => r.getAttribute('aria-selected') === 'true');
    expect(selected.querySelector('.o-name').textContent).toBe('바탕');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    const active = mount.querySelector('.fp-opt.active');
    expect(active.id).toBeTruthy();
    expect(search.getAttribute('aria-activedescendant')).toBe(active.id); // tracks the highlight
    // Selection is untouched by highlighting: exactly one aria-selected=true, still 바탕.
    const stillSelected = [...mount.querySelectorAll('.fp-opt')].filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(stillSelected.length).toBe(1);
    expect(stillSelected[0].querySelector('.o-name').textContent).toBe('바탕');
  });

  it('marks only one aria-selected row when the chosen font also appears in 최근', () => {
    const mount = document.createElement('div');
    makeFontPicker(mount, { fonts: FONTS, value: 'Georgia', recent: ['Georgia'] });
    mount.querySelector('.fp-btn').click();
    // Georgia is rendered in both 최근 and 전체, but a single-select listbox may
    // carry only one aria-selected=true.
    const selected = [...mount.querySelectorAll('.fp-opt')].filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(selected.length).toBe(1);
    expect(selected[0].querySelector('.o-name').textContent).toBe('Georgia');
  });

  it('does not inject markup from a malicious family name (imported/custom)', () => {
    const evil = 'x"><img src=q onerror="window.__pwned=1">';
    const mount = document.createElement('div');
    // A crafted family can arrive as the current value (e.g. from imported settings).
    makeFontPicker(mount, { fonts: [{ f: evil }], value: evil });
    mount.querySelector('.fp-btn').click();
    // No element node smuggled in via the family string.
    expect(mount.querySelector('img')).toBe(null);
    // The name is rendered verbatim as text, not parsed as HTML.
    expect(mount.querySelector('.o-name').textContent).toBe(evil);
  });

  it('does not inject markup from a malicious custom-search entry', () => {
    const evil = '"><img src=q onerror=1>';
    const mount = document.createElement('div');
    makeFontPicker(mount, { fonts: FONTS, value: 'Georgia' });
    mount.querySelector('.fp-btn').click();
    const search = mount.querySelector('.fp-search');
    search.value = evil; search.dispatchEvent(new Event('input'));
    expect(mount.querySelector('img')).toBe(null);
    const mk = mount.querySelector('.fp-opt.mk .o-name');
    expect(mk.textContent).toContain(evil);
  });
});
