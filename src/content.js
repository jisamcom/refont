// src/content.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';
import {
  buildSkeletonCss, buildDynamicCss, engineVars, elementBase, ENGINE_VAR_NAMES,
  sanitizeFamilyName, sanitizeFontDisplay,
} from './lib/engine.js';
import { shouldProtect, hasIconClassHint, isProtectedFamily } from './lib/font-protection.js';
import { directText, isCodeElement, dedupeRoots } from './lib/dom-utils.js';
import { dedupeClassify } from './lib/page-fonts.js';
import { getSettings } from './lib/storage.js';
import { needsFullRescan } from './lib/apply-plan.js';

let settings = null;
let observer = null;
let appliedCss = '';
const STATIC_STYLE_ID = '__refont_style';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE']);

// Opt-in profiling. Off by default with zero runtime cost; enable in a tab with
//   localStorage.__refont_profile = '1'   (then reload)
// to log initial-scan time, elements visited/tagged, and mutation-flush time —
// the evidence needed before deciding whether the SHOW_ELEMENT scan is worth
// reworking (e.g. to SHOW_TEXT). Read once at load so it can't throw mid-scan.
const PROFILE = (() => { try { return !!localStorage.getItem('__refont_profile'); } catch { return false; } })();
let profVisited = 0;
let profTagged = 0;
function profile(label, extra, fn) {
  if (!PROFILE) return fn();
  profVisited = 0; profTagged = 0;
  const t0 = performance.now();
  const r = fn();
  const dt = performance.now() - t0;
  // eslint-disable-next-line no-console
  console.debug(`[refont:profile] ${label} ${dt.toFixed(1)}ms visited=${profVisited} tagged=${profTagged}${extra ? ` ${extra}` : ''}`);
  return r;
}

function pseudoFamily(el, which) {
  try { return getComputedStyle(el, which).fontFamily; } catch { return ''; }
}

// READ + DECIDE only (no DOM writes). Returns a tag plan or null to skip.
// Keeping all getComputedStyle reads in a write-free pass avoids layout
// thrashing (a write between reads forces a synchronous reflow on the next
// read). It also means every element is classified against the page's ORIGINAL
// computed style — tagging a parent can't perturb a child's read, since no
// tagging happens until the write pass.
function classifyElement(el) {
  if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return null;
  if (el.hasAttribute('data-fc')) return null;
  if (PROFILE) profVisited += 1;
  const text = directText(el);
  if (!text || !text.trim()) return null; // only opt-in elements that hold real text

  const cs = getComputedStyle(el);
  const fontFamily = cs.fontFamily;
  const className = el.getAttribute('class') || '';
  const pseudoFontFamily = hasIconClassHint(className)
    ? `${pseudoFamily(el, '::before')} ${pseudoFamily(el, '::after')}`
    : '';
  const info = { fontFamily, pseudoFontFamily, className, text };
  const extra = settings.protectionDenylistExtra || [];
  if (shouldProtect(info, extra) || matchesManualExclusion(el)) return null;

  const isCode = isCodeElement(el, fontFamily);
  const useCode = settings.codeFont && settings.codeFont.name;
  if (isCode && !useCode) return null; // no code font set → leave code untouched

  const { sizePx, weightBucket } = elementBase({
    fontSize: parseFloat(cs.fontSize) || 0,
    fontWeight: parseInt(cs.fontWeight, 10) || 400,
  });
  return { el, isCode, sizePx, weightBucket };
}

// WRITE only. We only ever set Refont's own attributes and the --fc-base-size
// custom property — the author's inline font-size/font-weight are never touched,
// so removing our attributes restores the page losslessly.
function tagElement(plan) {
  const { el, isCode, sizePx, weightBucket } = plan;
  el.setAttribute('data-fc', '');
  if (PROFILE) profTagged += 1;
  if (isCode) el.setAttribute('data-fc-code', '');
  if (sizePx > 0) {
    el.style.setProperty('--fc-base-size', `${sizePx}px`);
    el.setAttribute('data-fc-size', '');
  }
  el.setAttribute(weightBucket === 'light' ? 'data-fc-wlight' : 'data-fc-wbold', '');
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
  // Pass 1 — read + decide (no writes ⇒ at most one forced reflow for the whole
  // subtree instead of one per element).
  const plans = [];
  while (node) {
    const plan = classifyElement(node);
    if (plan) plans.push(plan);
    node = walker.nextNode();
  }
  // Pass 2 — write only (no reads ⇒ nothing forces a reflow mid-loop).
  for (const plan of plans) tagElement(plan);
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

// ---- batched mutation handling ----
// A churny SPA can fire a flood of mutations. Doing synchronous getComputedStyle
// reads per record (the old behaviour) both burns time and pulls the content
// script into the initiator stack of any resource the forced layout flushes
// (e.g. a page's own lazy <img>). Coalesce a burst into one rAF flush instead.
let pendingRoots = new Set();
let flushScheduled = false;
const schedule = (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16));

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  schedule(() => {
    flushScheduled = false;
    if (!observer) { pendingRoots.clear(); return; } // torn down before the flush ran
    const roots = [...pendingRoots];
    pendingRoots.clear();
    const deduped = dedupeRoots(roots);
    // Named (not an arrow) so it shows up distinctly in a stack trace — lets us
    // tell which scan path is the initiator of any forced-layout resource load.
    profile('mutation-flush', `roots=${roots.length}->${deduped.length}`, function scanMutations() {
      for (const node of deduped) {
        if (node.isConnected !== false) scan(node);
      }
    });
  });
}

function startObserver() {
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) if (n.nodeType === 1) pendingRoots.add(n);
      if (m.type === 'characterData' && m.target.parentElement) pendingRoots.add(m.target.parentElement);
    }
    if (pendingRoots.size) scheduleFlush();
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
      const display = sanitizeFontDisplay(settings.webfontDisplay);
      style.textContent = `@font-face{font-family:"${sanitizeFamilyName(bf.name)}";src:url(${dataUrl});font-display:${display};}`;
    } catch { return; }
  }
  (document.head || document.documentElement).appendChild(style);
}

// Untag every element. Because we only ever set Refont attributes + the
// --fc-base-size custom property, this fully reverts the page — the author's own
// inline font-size/font-weight were never modified.
function clearMarks() {
  for (const el of document.querySelectorAll('[data-fc]')) {
    el.removeAttribute('data-fc');
    el.removeAttribute('data-fc-code');
    el.removeAttribute('data-fc-size');
    el.removeAttribute('data-fc-wlight');
    el.removeAttribute('data-fc-wbold');
    el.style.removeProperty('--fc-base-size');
  }
}

// ---- engine variables (live values driven through CSS custom properties) ----
function setVars(s) {
  const root = document.documentElement;
  const vars = engineVars(s);
  for (const k of ENGINE_VAR_NAMES) {
    if (k in vars) root.style.setProperty(k, vars[k]);
    else root.style.removeProperty(k); // e.g. --refont-weight when weight is 0
  }
}

function clearVars() {
  const root = document.documentElement;
  for (const k of ENGINE_VAR_NAMES) root.style.removeProperty(k);
}

// Inject the rule sheet synchronously, in-page, as an author stylesheet. This is
// the anti-flash path: unlike the user-origin sheet (which travels async through
// the service worker), this <style> exists before the browser's first paint, so
// a tagged element is already styled the instant the parser emits it.
//
// GUARDRAIL (w3c/webextensions#906): the author-origin half of Refont MUST stay
// an in-page <style> node — do NOT replace it with scripting.insertCSS({ origin:
// 'AUTHOR' }). Chrome mis-files AUTHOR-origin injected CSS at the user origin
// (cascade-incorrect; Firefox is spec-correct), and insertCSS is async so it
// can't land before first paint anyway. The async USER-origin sheet (see
// background.js) is the only insertCSS path, and it's intentionally USER.
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

// The full author/user-origin rule sheet for the current settings.
function buildSheet(s) {
  return `${buildSkeletonCss()}\n${buildDynamicCss(s)}`;
}

// Tear down a previous application: stop the observer, untag elements, drop our
// variables and stylesheets/web font.
function teardown() {
  if (observer) { observer.disconnect(); observer = null; }
  pendingRoots.clear();
  flushScheduled = false;
  clearMarks();
  clearVars();
  removeStaticStyle();
  if (appliedCss) { browser.runtime.sendMessage({ type: MSG.REMOVE_CSS, css: appliedCss }).catch(() => {}); appliedCss = ''; }
  const oldWebFont = document.getElementById('__refont_webfont'); if (oldWebFont) oldWebFont.remove();
}

// Full path: re-tag the document. Used on first run and whenever a change can
// alter *which* elements get tagged (see needsFullRescan).
function applyFull(next) {
  settings = next;
  const active = settings.enabled && !isBlocked(location.href, settings.blocklist);
  teardown();
  if (!active) return;

  setVars(settings);
  appliedCss = buildSheet(settings);

  // --- fast path (synchronous): the rule sheet, the variables and the first
  // tagged elements land before the browser paints — no flash of the original. ---
  injectStaticStyle(appliedCss);
  injectWebFont().catch(() => {}); // @import/@font-face style appends synchronously
  startObserver();                 // catches nodes as the parser streams them in
  profile('full-scan', null, function scanInitial() { scan(document.documentElement); });

  // --- reinforcement (async; does not gate first paint) ---
  // User-origin sheet: its !important outranks author !important on the rare page
  // that forces font-family on body text. The synchronous sheet above already
  // covers the common case instantly.
  browser.runtime.sendMessage({ type: MSG.APPLY_CSS, css: appliedCss }).catch(() => {});
}

// Cheap path: only style *values* changed (scale/weight/spacing/axes/family).
// Re-set the variables (O(1)) and swap the rule sheet only if its *shape* changed
// (weight on-off, preserveBold, line-height/letter-spacing/axes on-off). No DOM
// walk, no getComputedStyle — this is what makes dragging a slider on a large
// page cheap.
function applyValues(next) {
  settings = next;
  setVars(settings);
  const css = buildSheet(settings);
  if (css !== appliedCss) {
    injectStaticStyle(css);
    const prev = appliedCss;
    appliedCss = css;
    browser.runtime.sendMessage({ type: MSG.APPLY_CSS, css }).catch(() => {});
    if (prev) browser.runtime.sendMessage({ type: MSG.REMOVE_CSS, css: prev }).catch(() => {});
  }
}

// override: transient settings (live preview) that are applied but NOT persisted.
// When omitted, settings are read straight from storage.local — no service-worker
// wake-up — so the first paint isn't gated on a cold MV3 worker round-trip.
async function apply(override) {
  const next = override || await getSettings();
  if (needsFullRescan(settings, next) || !appliedCss) {
    applyFull(next);
  } else {
    applyValues(next);
  }
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
  document.addEventListener('DOMContentLoaded', function scanLate() {
    if (settings && settings.enabled && !isBlocked(location.href, settings.blocklist)) {
      scan(document.documentElement);
    }
  }, { once: true });
}
