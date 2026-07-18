import { describe, it, expect } from 'vitest';
import { LOCALES, messages, resolveLocale, createT } from '../src/lib/i18n.js';

describe('resolveLocale', () => {
  it('passes an explicit locale through', () => {
    expect(resolveLocale('ko', 'en-US')).toBe('ko');
    expect(resolveLocale('en', 'ko-KR')).toBe('en');
  });
  it('auto-detects from the browser language', () => {
    expect(resolveLocale('auto', 'ko-KR')).toBe('ko');
    expect(resolveLocale('auto', 'ko')).toBe('ko');
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('auto', 'fr')).toBe('en');
  });
  it('treats unknown/missing settings as auto and missing navLang as en', () => {
    expect(resolveLocale(undefined, 'ko-KR')).toBe('ko');
    expect(resolveLocale('auto', '')).toBe('en');
    expect(resolveLocale('auto', 'de-DE')).toBe('en');
  });
});

describe('createT', () => {
  it('looks up a key in the requested locale', () => {
    expect(createT('en')('action.save')).toBe(messages.en['action.save']);
    expect(createT('ko')('action.save')).toBe('저장');
  });
  it('falls back locale -> ko -> key', () => {
    const t = createT('en');
    expect(t('__missing__')).toBe('__missing__'); // no such key anywhere -> key itself
  });
  it('interpolates {n}-style placeholders', () => {
    expect(createT('en')('loadLocal.added', { n: 3 })).toBe('✓ 3 added');
    expect(createT('ko')('loadLocal.added', { n: 3 })).toBe('✓ 3개 추가됨');
    expect(createT('en')('loadLocal.added', {})).toBe('✓ {n} added');
  });
});

describe('dictionary parity', () => {
  it('every ko key exists in en and vice-versa', () => {
    const ko = Object.keys(messages.ko).sort();
    const en = Object.keys(messages.en).sort();
    expect(en).toEqual(ko);
  });
  it('exports both locales', () => {
    expect(LOCALES).toEqual(['ko', 'en']);
  });
});
