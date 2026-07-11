// src/content.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { effectivePageUrl, isBlocked } from './lib/url-match.js';
import {
  buildSkeletonCss, buildDynamicCss, engineVars, elementBase, ENGINE_VAR_NAMES,
  sanitizeFamilyName, sanitizeFontDisplay,
} from './lib/engine.js';
import { shouldProtect, hasIconClassHint, isProtectedFamily } from './lib/font-protection.js';
import { directText, isCodeElement, dedupeRoots } from './lib/dom-utils.js';
import { dedupeClassify, firstFamilyToken } from './lib/page-fonts.js';
import { getSettings } from './lib/storage.js';
import { needsFullRescan } from './lib/apply-plan.js';

let settings = null;
let observer = null;
let appliedCss = '';
let applyGeneration = 0;
const pageFontFamilies = new Map();
const MAX_PAGE_FONT_FAMILIES = 100;
const STATIC_STYLE_ID = '__refont_style';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE']);
// Recomputed at each apply() (see refreshPageScope) so an SPA that changes the
// URL via history.pushState re-evaluates the blocklist / manual exclusions
// against the current location, not the one present at document_start.
let pageUrl = effectivePageUrl();
let pageHost = hostOf(pageUrl);

function hostOf(url) {
  try { return new URL(url).host; } catch { return location.host; }
}

function refreshPageScope() {
  pageUrl = effectivePageUrl();
  pageHost = hostOf(pageUrl);
}

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
  const firstFamily = firstFamilyToken(fontFamily);
  if (firstFamily && pageFontFamilies.size < MAX_PAGE_FONT_FAMILIES) {
    const key = firstFamily.toLowerCase();
    if (!pageFontFamilies.has(key)) pageFontFamilies.set(key, fontFamily);
  }
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

function untagElement(el) {
  el.removeAttribute('data-fc');
  el.removeAttribute('data-fc-code');
  el.removeAttribute('data-fc-size');
  el.removeAttribute('data-fc-wlight');
  el.removeAttribute('data-fc-wbold');
  el.style.removeProperty('--fc-base-size');
}

function matchesManualExclusion(el) {
  const map = settings.manualExclusions || {};
  const host = pageHost;
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
  const extra = (settings && settings.protectionDenylistExtra) || [];
  // Families are remembered during the normal read/classification pass, before
  // Refont writes its own font-family. Opening the popup is therefore O(unique
  // families), not another synchronous full-DOM getComputedStyle sweep.
  //
  // When Refont is inactive on the page (disabled or blocklisted) that pass
  // never ran, so the cache is empty. Fall back to a one-shot live DOM walk so
  // the popup can still list the page's fonts — and since nothing was applied,
  // no Refont font can pollute the reading.
  const families = pageFontFamilies.size ? [...pageFontFamilies.values()] : livePageFamilies();
  return dedupeClassify(families, (name) => isProtectedFamily(name, extra), 40);
}

function livePageFamilies() {
  const raw = [];
  try {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode.nodeType === 1 ? walker.currentNode : walker.nextNode();
    while (node) {
      if (!SKIP_TAGS.has(node.tagName)) {
        const t = directText(node);
        if (t && t.trim()) { try { raw.push(getComputedStyle(node).fontFamily); } catch {} }
      }
      node = walker.nextNode();
    }
  } catch {}
  return raw;
}

// ---- batched mutation handling ----
// A churny SPA can fire a flood of mutations. Doing synchronous getComputedStyle
// reads per record (the old behaviour) both burns time and pulls the content
// script into the initiator stack of any resource the forced layout flushes
// (e.g. a page's own lazy <img>). Coalesce a burst into one rAF flush instead.
let pendingRoots = new Set();
let pendingReclassify = new Set();
let pendingAttrTargets = new Set();
let flushScheduled = false;
const schedule = (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16));

function clearPending() { pendingRoots.clear(); pendingReclassify.clear(); pendingAttrTargets.clear(); }

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  schedule(() => {
    flushScheduled = false;
    if (!observer) { clearPending(); return; } // torn down before the flush ran
    const roots = [...pendingRoots];
    const reclassify = new Set(pendingReclassify);
    const attrTargets = [...pendingAttrTargets];
    clearPending();
    // A class/style change on an element can restyle its descendants through a
    // descendant selector (`.dark .child{…}`) or an inherited font property, with
    // NO mutation firing on those descendants. So expand each attribute target to
    // the text-bearing elements in its subtree — the only ones classifyElement
    // acts on — and re-evaluate them too. (Text/characterData changes touch only
    // their own element, so those stay single-element in `reclassify`.)
    for (const el of attrTargets) collectTextOwners(el, reclassify);
    const deduped = dedupeRoots(roots);
    // Named (not an arrow) so it shows up distinctly in a stack trace — lets us
    // tell which scan path is the initiator of any forced-layout resource load.
    profile('mutation-flush', `roots=${deduped.length} recls=${reclassify.size}`, function scanMutations() {
      for (const node of deduped) {
        if (node.isConnected !== false) scan(node);
      }
      reclassifyElements([...reclassify]);
    });
  });
}

// Collect every element that owns direct (non-whitespace) text within `root`'s
// subtree — inclusive of `root` itself. Walking SHOW_TEXT (not SHOW_ELEMENT)
// visits only the nodes that matter to classification, skipping the structural
// elements classifyElement would reject anyway.
function collectTextOwners(root, out) {
  if (!root || root.isConnected === false) return;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.data && n.data.trim() && n.parentElement) out.add(n.parentElement);
    }
  } catch {}
}

// Re-evaluate elements whose classification may have changed. Untag first
// (write), then read+plan, then re-tag — the same no-layout-thrash discipline as
// scan(): all removals precede all reads, all reads precede all writes.
function reclassifyElements(els) {
  const live = els.filter((el) => el.isConnected !== false);
  if (!live.length) return;
  // Drop our marks so the read pass sees the page's current author font, not
  // Refont's override.
  for (const el of live) if (el.hasAttribute('data-fc')) untagElement(el);
  const plans = [];
  for (const el of live) { const plan = classifyElement(el); if (plan) plans.push(plan); }
  for (const plan of plans) tagElement(plan);
}

function stripRefontStyle(cssText) {
  return String(cssText || '')
    .replace(/--(?:fc-base-size|refont-[\w-]+)\s*:[^;]*(?:;|$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function startObserver() {
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) pendingRoots.add(n); // element subtree added → scan it
        // A *text node* added to an existing element (the common ExtJS/jQuery
        // pattern: create an empty element, then fill it via textContent/innerHTML
        // /appendChild). That's a childList mutation, not characterData, and the
        // element was likely scanned-and-skipped while still empty — so re-evaluate
        // just that element now that it holds direct text.
        else if (n.nodeType === 3 && m.target && m.target.nodeType === 1) pendingReclassify.add(m.target);
      }
      // A text change affects only the target element's own classification.
      if (m.type === 'characterData' && m.target.parentElement) pendingReclassify.add(m.target.parentElement);
      // A class/style change can also restyle descendants (descendant selectors,
      // inheritance), so it's expanded to its text-bearing subtree at flush time.
      if (m.type === 'attributes') {
        // Ignore style records caused solely by Refont's own custom properties;
        // otherwise setVars()/tagElement() would schedule an endless re-scan.
        if (m.attributeName === 'style'
          && stripRefontStyle(m.oldValue) === stripRefontStyle(m.target.getAttribute('style'))) continue;
        pendingAttrTargets.add(m.target);
      }
    }
    if (pendingRoots.size || pendingReclassify.size || pendingAttrTargets.size) scheduleFlush();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'],
  });
}

async function injectWebFont(nextSettings, generation) {
  const bf = nextSettings.bodyFont;
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
      if (generation !== applyGeneration) return;
      const display = sanitizeFontDisplay(nextSettings.webfontDisplay);
      style.textContent = `@font-face{font-family:"${sanitizeFamilyName(bf.name)}";src:url(${dataUrl});font-display:${display};}`;
    } catch { return; }
  }
  if (generation !== applyGeneration) return;
  (document.head || document.documentElement).appendChild(style);
  warmFonts(nextSettings);
}

// CSS Font Loading API: proactively trigger a download of the chosen families so
// the swap happens as soon as possible instead of lazily on first paint of a
// matching glyph. This is purely a fetch hint — the actual application is still
// the CSS-variable engine — so it never forces layout or blocks. No-op where the
// API or the family is absent. (document.fonts.ready, used by the popup, is the
// matching post-layout readback; here we only kick off loads.)
//
// Reliability of font-display:optional depends on this. `optional` permanently
// drops a font that isn't ready within its ~100ms block window; calling
// document.fonts.load() right after the @font-face is injected forces that face
// to decode immediately (the file path is an inlined data: URL, so it's ready
// almost at once), so the chosen font actually shows instead of being dropped.
function warmFonts(nextSettings = settings) {
  try {
    if (!nextSettings || !document.fonts || !document.fonts.load) return;
    const names = [];
    if (nextSettings.bodyFont && nextSettings.bodyFont.name) names.push(nextSettings.bodyFont.name);
    if (nextSettings.codeFont && nextSettings.codeFont.name) names.push(nextSettings.codeFont.name);
    for (const n of names) {
      const fam = sanitizeFamilyName(n);
      if (fam) document.fonts.load(`1em "${fam}"`).catch(() => {});
    }
  } catch {}
}

// Untag every element. Because we only ever set Refont attributes + the
// --fc-base-size custom property, this fully reverts the page — the author's own
// inline font-size/font-weight were never modified.
function clearMarks() {
  for (const el of document.querySelectorAll('[data-fc]')) untagElement(el);
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
  clearPending();
  pageFontFamilies.clear();
  flushScheduled = false;
  clearMarks();
  clearVars();
  removeStaticStyle();
  if (appliedCss) { browser.runtime.sendMessage({ type: MSG.REMOVE_CSS, css: appliedCss }).catch(() => {}); appliedCss = ''; }
  const oldWebFont = document.getElementById('__refont_webfont'); if (oldWebFont) oldWebFont.remove();
}

// Full path: re-tag the document. Used on first run and whenever a change can
// alter *which* elements get tagged (see needsFullRescan).
function applyFull(next, generation) {
  settings = next;
  const active = settings.enabled && !isBlocked(pageUrl, settings.blocklist);
  teardown();
  if (!active) return;

  setVars(settings);
  appliedCss = buildSheet(settings);

  // --- fast path (synchronous): the rule sheet, the variables and the first
  // tagged elements land before the browser paints — no flash of the original. ---
  injectStaticStyle(appliedCss);
  injectWebFont(settings, generation).catch(() => {}); // async file fetch is generation-guarded
  warmFonts(settings);             // system-font path: kick off the load too
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
  warmFonts();
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
async function apply(override, { full = false } = {}) {
  const generation = ++applyGeneration;
  refreshPageScope();
  const next = override || await getSettings();
  if (generation !== applyGeneration) return;
  if (full || needsFullRescan(settings, next) || !appliedCss) {
    applyFull(next, generation);
  } else {
    applyValues(next);
  }
}

// True when Refont should be applied to the current URL. `observer` is live iff
// we are currently applied, so it doubles as "was active".
function isActiveFor(s) { return !!s && s.enabled && !isBlocked(pageUrl, s.blocklist); }

// A same-document SPA navigation (pushState/replaceState/back-forward) changes
// the URL without re-running the content script, so a path-scoped blocklist entry
// would otherwise never re-evaluate. Recompute the scope and, only when the
// blocked/active state actually flips, force a full re-apply (or teardown). A
// benign in-app route change that doesn't cross a blocklist boundary does no work
// beyond recomputing the URL.
let navScheduled = false;
function onNavigation() {
  if (navScheduled) return;
  navScheduled = true;
  schedule(() => {
    navScheduled = false;
    refreshPageScope(); // read the URL after the navigation has committed
    if (isActiveFor(settings) === !!observer) return; // block-state unchanged
    apply(undefined, { full: true }).catch(() => {});
  });
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return undefined;
  // Fire-and-forget: returning the apply() promise would hold the message
  // channel open in every frame (all_frames) and emit "channel closed" noise;
  // REAPPLY/PREVIEW have no response the sender awaits.
  if (msg.type === MSG.REAPPLY) { apply().catch(() => {}); return undefined; }
  if (msg.type === MSG.PREVIEW_SETTINGS) { apply(msg.settings).catch(() => {}); return undefined; }
  if (msg.type === MSG.GET_PAGE_FONTS) return Promise.resolve(collectPageFonts());
  return undefined;
});

apply().catch(() => {});

// SPA navigation triggers (permission-free; no webNavigation). popstate covers
// back/forward everywhere; the Navigation API's `navigate` covers pushState/
// replaceState where supported (Chromium). Both are feature-detected.
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('popstate', onNavigation, { passive: true });
  try {
    if (window.navigation && window.navigation.addEventListener) {
      window.navigation.addEventListener('navigate', onNavigation);
    }
  } catch {}
}

// Safety net: if settings resolved late and the parser had already emitted most
// of the document before the observer was live, re-tag once the DOM is complete.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function scanLate() {
    if (settings && settings.enabled && !isBlocked(pageUrl, settings.blocklist)) {
      scan(document.documentElement);
    }
  }, { once: true });
}
