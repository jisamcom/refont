// tests/dom-utils.test.js
import { describe, it, expect } from 'vitest';
import { directText, isCodeElement, dedupeRoots } from '../src/lib/dom-utils.js';

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

describe('dedupeRoots', () => {
  it('drops nodes contained by another queued node', () => {
    const root = el('<div><section><p>hi</p></section></div>');
    const section = root.firstElementChild;
    const p = section.firstElementChild;
    // Queueing root, section and p should collapse to just [root].
    expect(dedupeRoots([root, section, p])).toEqual([root]);
  });
  it('keeps independent sibling subtrees', () => {
    const wrap = el('<div><a>1</a><b>2</b></div>');
    const a = wrap.children[0]; const b = wrap.children[1];
    expect(dedupeRoots([a, b])).toEqual([a, b]);
  });
  // Regression: on a huge mutation burst (e.g. a streaming namu.wiki page the
  // observer reports as thousands of individual added nodes) the old O(n^2)
  // `nodes.some(o => o.contains(n))` did ~19M DOM containment calls for ~7.5k
  // nodes — multiple seconds of main-thread block. Dedup must stay ~O(n): walk
  // each node's ancestor chain against a Set instead of probing every other node.
  it('dedupes a large burst without O(n^2) DOM containment work', () => {
    const body = document.createElement('div');
    const nodes = [];
    for (let r = 0; r < 3; r++) {          // 3 top-level subtrees (the survivors)
      const top = document.createElement('div');
      body.appendChild(top); nodes.push(top);
      for (let i = 0; i < 700; i++) {       // each with many descendants
        const p = document.createElement('p');
        top.appendChild(p); nodes.push(p);
      }
    }
    let containsCalls = 0;
    const orig = Node.prototype.contains;
    Node.prototype.contains = function (...a) { containsCalls += 1; return orig.apply(this, a); };
    let out;
    try { out = dedupeRoots(nodes); } finally { Node.prototype.contains = orig; }

    expect(out).toHaveLength(3);                 // collapses to the 3 top subtrees
    expect(out).toEqual(nodes.filter((n) => n.parentNode === body));
    expect(containsCalls).toBeLessThanOrEqual(nodes.length); // O(n), not O(n^2)
  });
});
