// src/content.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';
import { buildCss, computeElementInline, sanitizeFamilyName } from './lib/engine.js';
import { shouldProtect, hasIconClassHint, isProtectedFamily } from './lib/font-protection.js';
import { directText, isCodeElement } from './lib/dom-utils.js';
import { dedupeClassify } from './lib/page-fonts.js';
import { getSettings } from './lib/storage.js';

let settings = null;
let observer = null;
let appliedCss = '';
const STATIC_STYLE_ID = '__refont_style';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE']);

function pseudoFamily(el, which) {
  try { return getComputedStyle(el, which).fontFamily; } catch { return ''; }
}

function processElement(el) {
  if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return;
  const text = directText(el);
  if (!text || !text.trim()) return; // only opt-in elements that hold real text

  const cs = getComputedStyle(el);
  const fontFamily = cs.fontFamily;
  const className = el.getAttribute('class') || '';
  const pseudoFontFamily = hasIconClassHint(className)
    ? `${pseudoFamily(el, '::before')} ${pseudoFamily(el, '::after')}`
    : '';
  const info = {
    fontFamily,
    pseudoFontFamily,
    className,
    text,
  };
  const extra = settings.protectionDenylistExtra || [];
  if (shouldProtect(info, extra) || matchesManualExclusion(el)) return;

  const isCode = isCodeElement(el, fontFamily);
  const useCode = settings.codeFont && settings.codeFont.name;
  if (isCode && !useCode) return; // no code font set → leave code untouched
  el.setAttribute(isCode ? 'data-fc-code' : 'data-fc', '');

  const inline = computeElementInline(
    { fontSize: parseFloat(cs.fontSize) || 0, fontWeight: parseInt(cs.fontWeight, 10) || 400 },
    settings,
  );
  if (inline.fontSize) el.style.setProperty('font-size', inline.fontSize, 'important');
  if (inline.fontWeight) el.style.setProperty('font-weight', inline.fontWeight, 'important');
}

function matchesManualExclusion(el) {
  const map = settings.manualExclusions || {};
  const host = location.host;
  const list = map[host] || [];
  for (const sel of list) {
    try { if (sel && el.matches(sel)) return true; } catch {}
  }
  return false;
}

function scan(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode.nodeType === 1 ? walker.currentNode : walker.nextNode();
  while (node) {
    processElement(node);
    node = walker.nextNode();
  }
}

function collectPageFonts() {
  const raw = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode.nodeType === 1 ? walker.currentNode : walker.nextNode();
  while (node) {
    if (!SKIP_TAGS.has(node.tagName)) {
      const t = directText(node);
      if (t && t.trim()) { try { raw.push(getComputedStyle(node).fontFamily); } catch {} }
    }
    node = walker.nextNode();
  }
  const extra = (settings && settings.protectionDenylistExtra) || [];
  // Don't list Refont's own applied fonts — after apply, every [data-fc] element
  // reports the chosen body font, which would otherwise dominate the list.
  const exclude = [];
  if (settings) {
    if (settings.bodyFont && settings.bodyFont.name) exclude.push(settings.bodyFont.name);
    if (settings.codeFont && settings.codeFont.name) exclude.push(settings.codeFont.name);
  }
  return dedupeClassify(raw, (name) => isProtectedFamily(name, extra), 40, exclude);
}

function startObserver() {
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) { scan(n); }
      }
      if (m.type === 'characterData' && m.target.parentElement) {
        processElement(m.target.parentElement);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
  });
}

async function injectWebFont() {
  const bf = settings.bodyFont;
  if (!bf || bf.source !== 'weburl' || !bf.url) return;
  let parsed;
  try { parsed = new URL(bf.url); } catch { return; }
  if (!/^https?:$/.test(parsed.protocol)) return;
  const styleId = '__refont_webfont';
  const style = document.createElement('style');
  style.id = styleId;
  if (bf.urlType === 'css') {
    // Use the normalized href (percent-encodes quotes/braces) so a crafted URL
    // can't break out of url("…") and inject arbitrary CSS.
    style.textContent = `@import url("${parsed.href}");`;
  } else {
    try {
      const dataUrl = await browser.runtime.sendMessage({ type: MSG.FETCH_FONT, url: bf.url });
      style.textContent = `@font-face{font-family:"${sanitizeFamilyName(bf.name)}";src:url(${dataUrl});font-display:swap;}`;
    } catch { return; }
  }
  (document.head || document.documentElement).appendChild(style);
}

function clearMarks() {
  for (const el of document.querySelectorAll('[data-fc],[data-fc-code]')) {
    el.removeAttribute('data-fc');
    el.removeAttribute('data-fc-code');
    el.style.removeProperty('font-size');
    el.style.removeProperty('font-weight');
  }
}

// Inject the cascade rule synchronously, in-page, as an author stylesheet. This
// is the anti-flash path: unlike the user-origin sheet (which travels async
// through the service worker), this <style> exists before the browser's first
// paint, so a tagged element is already styled the instant the parser emits it.
function injectStaticStyle(css) {
  let style = document.getElementById(STATIC_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STATIC_STYLE_ID;
  }
  style.textContent = css;
  // At document_start <head> doesn't exist yet; a <style> applies from <html> too.
  // Appending last also lets it win same-specificity !important ties by source order.
  (document.head || document.documentElement).appendChild(style);
}

function removeStaticStyle() {
  const style = document.getElementById(STATIC_STYLE_ID);
  if (style) style.remove();
}

// override: transient settings (live preview) that are applied but NOT persisted.
// When omitted, settings are read straight from storage.local — no service-worker
// wake-up — so the first paint isn't gated on a cold MV3 worker round-trip.
async function apply(override) {
  settings = override || await getSettings();
  const active = settings.enabled && !isBlocked(location.href, settings.blocklist);

  // --- teardown any previous application ---
  if (observer) { observer.disconnect(); observer = null; }
  clearMarks();
  removeStaticStyle();
  if (appliedCss) { browser.runtime.sendMessage({ type: MSG.REMOVE_CSS, css: appliedCss }).catch(() => {}); appliedCss = ''; }
  const oldWebFont = document.getElementById('__refont_webfont'); if (oldWebFont) oldWebFont.remove();

  if (!active) return;

  appliedCss = buildCss(settings);

  // --- fast path (synchronous): the cascade rule and the first tagged elements
  // land before the browser paints, so there's no flash of the original font. ---
  injectStaticStyle(appliedCss);
  injectWebFont().catch(() => {}); // @import/@font-face style appends synchronously
  startObserver();                 // catches nodes as the parser streams them in
  scan(document.documentElement);

  // --- reinforcement (async; does not gate first paint) ---
  // User-origin sheet: its !important outranks author !important on the rare page
  // that forces font-family on body text. The synchronous sheet above already
  // covers the common case instantly.
  browser.runtime.sendMessage({ type: MSG.APPLY_CSS, css: appliedCss }).catch(() => {});
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return undefined;
  if (msg.type === MSG.REAPPLY) { apply(); return undefined; }
  if (msg.type === MSG.PREVIEW_SETTINGS) { apply(msg.settings); return undefined; }
  if (msg.type === MSG.GET_PAGE_FONTS) return Promise.resolve(collectPageFonts());
  return undefined;
});

apply().catch(() => {});

// Safety net: if settings resolved late and the parser had already emitted most
// of the document before the observer was live, re-tag once the DOM is complete.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (settings && settings.enabled && !isBlocked(location.href, settings.blocklist)) {
      scan(document.documentElement);
    }
  }, { once: true });
}
