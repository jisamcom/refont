// tests/dom-utils.test.js
import { describe, it, expect } from 'vitest';
import { directText, isCodeElement } from '../src/lib/dom-utils.js';

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild;
}

describe('directText', () => {
  it('returns only direct text, not descendant text', () => {
    const node = el('<p>Hello <span>world</span>!</p>');
    expect(directText(node).trim()).toBe('Hello !');
  });
  it('returns empty string for element with no direct text', () => {
    const node = el('<div><span>x</span></div>');
    expect(directText(node).trim()).toBe('');
  });
});

describe('isCodeElement', () => {
  it('true for code/pre/kbd/samp tags', () => {
    expect(isCodeElement(el('<code>x</code>'), 'Arial')).toBe(true);
    expect(isCodeElement(el('<pre>x</pre>'), 'Arial')).toBe(true);
  });
  it('true when computed family is monospace', () => {
    expect(isCodeElement(el('<span>x</span>'), 'Consolas, monospace')).toBe(true);
  });
  it('false for normal element + family', () => {
    expect(isCodeElement(el('<span>x</span>'), 'Arial')).toBe(false);
  });
});
