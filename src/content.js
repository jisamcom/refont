// src/content.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';
import { buildCss, computeElementInline, sanitizeFamilyName } from './lib/engine.js';
import { shouldProtect, hasIconClassHint } from './lib/font-protection.js';
import { directText, isCodeElement } from './lib/dom-utils.js';

let settings = null;
let observer = null;
let appliedCss = '';
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
    style.textContent = `@import url("${bf.url}");`;
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

async function apply() {
  settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  const active = settings.enabled && !isBlocked(location.href, settings.blocklist);

  if (observer) { observer.disconnect(); observer = null; }
  clearMarks();
  if (appliedCss) { await browser.runtime.sendMessage({ type: MSG.REMOVE_CSS, css: appliedCss }); appliedCss = ''; }
  const oldWebFont = document.getElementById('__refont_webfont'); if (oldWebFont) oldWebFont.remove();

  if (!active) return;

  appliedCss = buildCss(settings);
  await browser.runtime.sendMessage({ type: MSG.APPLY_CSS, css: appliedCss });
  await injectWebFont();
  startObserver();
  scan(document.documentElement);
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === MSG.REAPPLY) apply();
});

apply().catch(() => {});
