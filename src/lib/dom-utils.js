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
//
// A streaming page (e.g. a huge namu.wiki article) makes the observer report
// every parsed element as its own added node — thousands per flush. The naive
// `nodes.some(o => o.contains(n))` is O(n^2) *DOM* containment calls (~19M for
// ~7.5k nodes ⇒ multi-second main-thread block). Instead, put the batch in a
// Set and walk each node's ancestor chain: a node is redundant iff any ancestor
// is also queued. That's O(n · depth) with O(1) Set lookups and zero contains().
export function dedupeRoots(nodes) {
  const queued = new Set(nodes);
  return nodes.filter((n) => {
    for (let p = n.parentNode; p; p = p.parentNode) {
      if (queued.has(p)) return false;
    }
    return true;
  });
}

const CODE_TAGS = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'TT']);

export function isCodeElement(el, computedFamily) {
  if (CODE_TAGS.has(el.tagName)) return true;
  return /monospace/i.test(computedFamily || '');
}
