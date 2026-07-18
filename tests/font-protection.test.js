// tests/font-protection.test.js
import { describe, it, expect } from 'vitest';
import {
  isProtectedFamily, isPuaText, hasIconClassHint, shouldProtect,
  FONT_FAMILY_DENYLIST,
} from '../src/lib/font-protection.js';

describe('isProtectedFamily', () => {
  it('matches icon fonts case-insensitively as substrings', () => {
    expect(isProtectedFamily('"Font Awesome 6 Free", sans-serif')).toBe(true);
    expect(isProtectedFamily('FontAwesome')).toBe(true);
    expect(isProtectedFamily('Material Icons')).toBe(true);
    expect(isProtectedFamily('codicon')).toBe(true);
  });
  it('honours the user extra denylist, compiled once per extra array', () => {
    const extra = ['MyIcons', 'Corp-Symbols'];
    // Same array reference used repeatedly (the compiled-per-reference cache path).
    expect(isProtectedFamily('MyIcons Regular', extra)).toBe(true);
    expect(isProtectedFamily('corp-symbols', extra)).toBe(true); // case-insensitive
    expect(isProtectedFamily('Helvetica', extra)).toBe(false);
    expect(isProtectedFamily('Helvetica', [])).toBe(false);      // empty extra → built-in only
  });
  it('matches math/music/barcode/dingbat/display families', () => {
    expect(isProtectedFamily('KaTeX_Main')).toBe(true);
    expect(isProtectedFamily('MJXTEX-I')).toBe(true);
    expect(isProtectedFamily('Bravura Text')).toBe(true);
    expect(isProtectedFamily('Libre Barcode 128 Text')).toBe(true);
    expect(isProtectedFamily('Wingdings')).toBe(true);
    expect(isProtectedFamily('DSEG7 Classic')).toBe(true);
    expect(isProtectedFamily('Adobe Blank')).toBe(true);
  });
  it('does not match ordinary text fonts', () => {
    expect(isProtectedFamily('Pretendard, sans-serif')).toBe(false);
    expect(isProtectedFamily('Arial')).toBe(false);
    expect(isProtectedFamily('"Noto Sans KR"')).toBe(false);
  });
  it('matches risky tokens only as a whole family token, not substring', () => {
    expect(isProtectedFamily('Symbol')).toBe(true);             // exact token
    expect(isProtectedFamily('"Symbol", sans-serif')).toBe(true);
    expect(isProtectedFamily('My Symbolic Font')).toBe(false);   // substring must NOT match
  });
  it('honors user-supplied extra denylist entries', () => {
    expect(isProtectedFamily('weird-custom-icons', ['weird-custom-icons'])).toBe(true);
  });
});

describe('isPuaText', () => {
  it('true when text is substantially Private Use Area', () => {
    expect(isPuaText('')).toBe(true);          // BMP PUA
    expect(isPuaText('')).toBe(true);                 // legacy symbol PUA
    expect(isPuaText('\u{1F3B5}'.normalize())).toBe(false); // emoji (not PUA)
  });
  it('true for musical symbols block', () => {
    expect(isPuaText('\u{1D11E}')).toBe(true); // U+1D11E G clef
  });
  it('false for normal text and empty', () => {
    expect(isPuaText('hello')).toBe(false);
    expect(isPuaText('   ')).toBe(false);
    expect(isPuaText('')).toBe(false);
  });
});

describe('hasIconClassHint', () => {
  it('matches common icon class tokens', () => {
    expect(hasIconClassHint('fa fa-home')).toBe(true);
    expect(hasIconClassHint('material-icons')).toBe(true);
    expect(hasIconClassHint('codicon codicon-add')).toBe(true);
  });
  it('does not match arbitrary classes', () => {
    expect(hasIconClassHint('header main-nav')).toBe(false);
    expect(hasIconClassHint('fabulous')).toBe(false); // word-boundary, not substring
  });
});

describe('shouldProtect', () => {
  it('protects when computed family is on denylist', () => {
    expect(shouldProtect({ fontFamily: 'Material Icons', className: '', text: 'home' })).toBe(true);
  });
  it('protects when pseudo-element family is an icon font', () => {
    expect(shouldProtect({ fontFamily: 'Arial', pseudoFontFamily: '"Font Awesome 6 Free"', className: '', text: '' })).toBe(true);
  });
  it('protects PUA content even with unknown family', () => {
    expect(shouldProtect({ fontFamily: 'SomeRandomHashFont', className: '', text: '' })).toBe(true);
  });
  it('protects class-hint + short text', () => {
    expect(shouldProtect({ fontFamily: 'Arial', className: 'fa fa-star', text: '' })).toBe(true);
  });
  it('does NOT protect class-hint with long real text', () => {
    expect(shouldProtect({ fontFamily: 'Arial', className: 'icon-wrapper', text: 'Add to favorites' })).toBe(false);
  });
  it('does NOT protect ordinary text', () => {
    expect(shouldProtect({ fontFamily: 'Pretendard', className: 'para', text: 'Hello world' })).toBe(false);
  });
});

describe('FONT_FAMILY_DENYLIST', () => {
  it('is a non-trivial lowercase list', () => {
    expect(FONT_FAMILY_DENYLIST.length).toBeGreaterThan(30);
    expect(FONT_FAMILY_DENYLIST.every((s) => s === s.toLowerCase())).toBe(true);
  });
});
