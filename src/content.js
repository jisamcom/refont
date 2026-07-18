// src/content.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { effectivePageUrl, isBlocked } from './lib/url-match.js';
import {
  buildSkeletonCss, buildDynamicCss, buildRootVars, engineVars, ENGINE_VAR_NAMES,
  elementBase, sanitizeFamilyName, sanitizeFontDisplay,
} from './lib/engine.js';
import { shouldProtect, hasIconClassHint, isProtectedFamily } from './lib/font-protection.js';
import { directText, isCodeElement, dedupeRoots } from './lib/dom-utils.js';
import { dedupeClassify, firstFamilyToken, rememberFamily } from './lib/page-fonts.js';
import { getSettings } from './lib/storage.js';
import { needsFullRescan } from './lib/apply-plan.js';

let settings = null;
let observer = null;
let appliedCss = '';      // the full injected sheet (vars + rules)
let appliedRules = '';    // just the rule half — a value-only preview leaves this unchanged
let applyGeneration = 0;
// A unique id for this document's lifetime. The document registers it with the
// background (on load and BFCache pageshow) to own its frame's USER sheet, so a
// delayed swap from a superseded document is dropped and a new document reinstalls
// even identical css. Prefer a real UUID; fall back where crypto is unavailable.
const CSS_DOC_ID = (() => {
  try { if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return `${Date.now()}.${Math.random()}`;
})();
function registerCssDoc() {
  return browser.runtime.sendMessage({ type: MSG.CSS_REGISTER, docId: CSS_DOC_ID }).catch(() => {});
}
// Re-assert this document's USER sheet unconditionally, bypassing replaceCss's
// local no-op guard. A BFCache restore keeps our local appliedCss, so apply()
// alone sends nothing — yet the background may hold another document's sheet for
// this frame (or none, if ours was dropped on navigate-away). Sending the current
// appliedCss (including '' when disabled) re-installs ours / evicts theirs.
function forceReplaceCss() {
  browser.runtime.sendMessage({ type: MSG.REPLACE_CSS, css: appliedCss, docId: CSS_DOC_ID }).catch(() => {});
}
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

// A live editing surface: a contenteditable host, a child that inherits its
// editability, or a native form control. `isContentEditable` is the spec signal;
// the attribute-selector fallback covers engines/jsdom where it's unreliable and
// catches inheriting children (a <p> inside a contenteditable has no attribute
// of its own). Form controls hold their value outside the DOM text, so they're
// never tagged directly — but we exclude them here for symmetry and clarity.
function isEditableHost(el) {
  const ce = el.isContentEditable;
  if (ce === true) return true;
  // A spec-compliant engine resolves editability (inheritance included) into a
  // boolean, so `false` is authoritative — no ancestor walk needed on the common
  // (non-editable) path. Only when the property is unsupported (undefined, e.g.
  // jsdom) do we fall back to a contenteditable-ancestor lookup.
  if (ce === undefined) {
    try { if (el.closest && el.closest('[contenteditable]:not([contenteditable="false"])')) return true; } catch {}
  }
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION';
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
  // Never restyle a live editing surface. Writing our attributes/--fc-base-size
  // to a contenteditable (or a child that inherits editability) mutates the DOM
  // the browser/editor is composing into: it flickers the font on every keystroke
  // (untag→retag) and can reset an in-flight IME composition ('안녕'→'ㅇ안녕').
  if (isEditableHost(el)) return null;
  if (PROFILE) profVisited += 1;
  const text = directText(el);
  if (!text || !text.trim()) return null; // only opt-in elements that hold real text

  const cs = getComputedStyle(el);
  const fontFamily = cs.fontFamily;
  const firstFamily = firstFamilyToken(fontFamily);
  if (firstFamily) rememberFamily(pageFontFamilies, firstFamily.toLowerCase(), fontFamily, MAX_PAGE_FONT_FAMILIES);
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
      // A *text node removed* (e.g. textNode.remove()) fires only a removedNodes
      // record — no characterData — so a now-empty element would otherwise keep
      // its stale data-fc/size/weight. Re-evaluate the target: reclassify untags
      // it when no direct text remains.
      for (const n of m.removedNodes) {
        if (n.nodeType === 3 && m.target && m.target.nodeType === 1) pendingReclassify.add(m.target);
      }
      // A text change affects only the target element's own classification.
      if (m.type === 'characterData' && m.target.parentElement) pendingReclassify.add(m.target.parentElement);
      // A class/style change can also restyle descendants (descendant selectors,
      // inheritance), so it's expanded to its text-bearing subtree at flush time.
      // A `contenteditable` toggle flips whether the subtree is an editing surface
      // — it must untag (on enable) or re-tag (on disable) BEFORE the first
      // keystroke, so it's observed and reclassified the same way.
      if (m.type === 'attributes') {
        // Ignore style records caused solely by Refont's own custom properties
        // (setVars' --refont-* / tagElement's --fc-base-size); otherwise they'd
        // schedule an endless re-scan.
        if (m.attributeName === 'style'
          && stripRefontStyle(m.oldValue) === stripRefontStyle(m.target.getAttribute('style'))) continue;
        pendingAttrTargets.add(m.target);
      }
    }
    if (pendingRoots.size || pendingReclassify.size || pendingAttrTargets.size) scheduleFlush();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'contenteditable'],
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
    // Fetch the stylesheet in the background and inject ONLY its @font-face rules
    // — never an @import of the whole remote sheet (which would run arbitrary
    // selectors, nested @imports, and background-image beacons in the page).
    try {
      const faces = await browser.runtime.sendMessage({ type: MSG.FETCH_FONT_CSS, url: bf.url });
      if (generation !== applyGeneration) return;
      if (!faces) return;
      style.textContent = faces;
    } catch { return; }
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

// ---- engine variables ----
// The committed values live in the sheet's :root (buildSheet), which is immune to
// a page that rewrites <html>'s inline style. These inline copies are only the
// fast path for live previews: a slider drag updates one inline property and
// overrides the sheet, so a preview never re-injects the (async, USER-origin)
// stylesheet. On a page that wipes them the sheet's committed values take over.
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

// Swap the async USER-origin reinforcement sheet. The background serializes the
// insert/remove per frame (keyed by our document token), inserting the new sheet
// before removing what it last installed — so a preview and a committed reapply
// can't race and leave the stale one installed. `prev` skips a no-op send AND is
// forwarded so the background can remove it: this content script outlives an MV3
// worker restart that wipes the background's authoritative `installed`, so on a
// shape change our `prev` is the only record of the old sheet still on the page.
// The in-page <style> (injectStaticStyle) is the synchronous, always-current half.
function replaceCss(css, prev) {
  if (css === prev) return;
  browser.runtime.sendMessage({ type: MSG.REPLACE_CSS, css, prev, docId: CSS_DOC_ID }).catch(() => {});
}

// The rule half of the sheet (shape depends on which features are on, not their
// values). A value-only preview leaves this identical, so no re-inject is needed.
function buildRules(s) {
  return `${buildSkeletonCss()}\n${buildDynamicCss(s)}`;
}

// The full sheet: engine vars in a `:root{}` rule (not inline on <html>) so a page
// that rewrites documentElement's style — Discord's theme manager wipes it — can't
// drop them and collapse font-family to the page's own font, then the rules.
function buildSheet(s) {
  return `${buildRootVars(s)}\n${buildRules(s)}`;
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
  // The USER-sheet removal is issued by the caller (applyFull) so an active
  // re-apply can insert-then-remove in ONE serialized op (no author-less gap).
  appliedCss = '';
  appliedRules = '';
  const oldWebFont = document.getElementById('__refont_webfont'); if (oldWebFont) oldWebFont.remove();
}

// Full path: re-tag the document. Used on first run and whenever a change can
// alter *which* elements get tagged (see needsFullRescan).
function applyFull(next, generation) {
  settings = next;
  const active = settings.enabled && !isBlocked(pageUrl, settings.blocklist, settings.allowlist);
  const prevCss = appliedCss; // capture before teardown clears it
  teardown();
  if (!active) { replaceCss('', prevCss); return; }

  setVars(settings);
  appliedRules = buildRules(settings);
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
  // covers the common case instantly. One serialized swap (insert new, then remove
  // the prior sheet) so there's no author-less gap.
  replaceCss(appliedCss, prevCss);
}

// Cheap path: only style *values* changed (scale/weight/spacing/axes/family).
// Update the inline vars (O(1), no DOM walk) so a live preview is instant and
// never touches the async USER stylesheet. Re-inject the sheet only when the rule
// SHAPE changes (a feature toggled on/off) or when the change is committed (from
// storage, not a transient preview) — that keeps the sheet's :root committed
// values current for pages that wipe the inline copy, without a per-preview
// insert/remove race on the USER sheet.
function applyValues(next, commit) {
  settings = next;
  setVars(settings);
  warmFonts();
  const rules = buildRules(settings);
  if (rules !== appliedRules || commit) {
    const css = `${buildRootVars(settings)}\n${rules}`;
    if (css !== appliedCss) {
      injectStaticStyle(css);
      const prev = appliedCss;
      appliedCss = css;
      appliedRules = rules;
      replaceCss(css, prev);
    }
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
  // A preview passes transient settings via `override`; a storage-sourced apply
  // (no override) is a committed change that should refresh the sheet's vars.
  const commit = override == null;
  if (full || needsFullRescan(settings, next) || !appliedCss) {
    applyFull(next, generation);
  } else {
    applyValues(next, commit);
  }
}

// True when Refont should be applied to the current URL. `observer` is live iff
// we are currently applied, so it doubles as "was active".
function isActiveFor(s) { return !!s && s.enabled && !isBlocked(pageUrl, s.blocklist, s.allowlist); }

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

registerCssDoc();        // own this frame's USER sheet before the first apply
apply().catch(() => {});

// BFCache: a restored document didn't re-run this script, and its USER sheet was
// removed when we navigated away. Re-register (reclaim ownership), re-apply, then
// FORCE one replace: the restored appliedCss is unchanged, so apply()'s local
// dedupe would send nothing and the sheet would never be reinstalled. Ordered so
// the owner is reclaimed before the forced sheet lands. Only on a persisted show —
// a normal load already applied above.
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pageshow', (e) => {
    if (!(e && e.persisted)) return;
    (async () => {
      await registerCssDoc();
      await apply();
      forceReplaceCss();
    })().catch(() => {});
  });
}

// SPA navigation triggers (permission-free; no webNavigation). popstate covers
// back/forward everywhere. For pushState/replaceState the Navigation API's
// `navigate` event (Chromium) is immediate. A low-frequency effective-URL poll
// is the fallback, needed in two cases the events miss: (1) Firefox, which has no
// Navigation API, and (2) an opaque (about:blank/srcdoc) child frame, whose own
// events never fire for a *parent* SPA navigation — only re-reading the inherited
// ancestor URL sees it. Comparing effectivePageUrl() (not location.href) is what
// makes the parent-frame case work. All paths funnel through onNavigation, which
// no-ops unless the block state actually flips.
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('popstate', onNavigation, { passive: true });
  let navApi = null;
  try { navApi = window.navigation && window.navigation.addEventListener ? window.navigation : null; } catch {}
  if (navApi) navApi.addEventListener('navigate', onNavigation);
  let opaqueFrame = false;
  try { opaqueFrame = !/^https?:$/.test(location.protocol); } catch {}
  if (!navApi || opaqueFrame) {
    setInterval(() => { if (effectivePageUrl() !== pageUrl) onNavigation(); }, 1000);
  }
}

// Safety net: if settings resolved late and the parser had already emitted most
// of the document before the observer was live, re-tag once the DOM is complete.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function scanLate() {
    if (settings && settings.enabled && !isBlocked(pageUrl, settings.blocklist, settings.allowlist)) {
      scan(document.documentElement);
    }
  }, { once: true });
}
