// src/lib/dom-utils.js
// Small DOM helpers, isolated so they can be unit-tested in jsdom.

export function directText(el) {
  let s = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3 /* TEXT_NODE */) s += node.nodeValue;
  }
  return s;
}

// Drop any node that is contained by another node in the same batch: scanning
// the outermost node already walks its descendants, so scanning a descendant
// too is redundant work. Used to coalesce a MutationObserver burst.
export function dedupeRoots(nodes) {
  return nodes.filter((n) => !nodes.some((o) => o !== n && o.contains && o.contains(n)));
}

const CODE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'TT']);

export function isCodeElement(el, computedFamily) {
  if (CODE_TAGS.has(el.tagName)) return true;
  return /monospace/i.test(computedFamily || '');
}
