// src/background.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { getSettings, saveSettings } from './lib/storage.js';
import { isBlocked, computeSiteToggle } from './lib/url-match.js';

export function guessFontMime(url) {
  let u = String(url).toLowerCase();
  try { u = new URL(u).pathname.toLowerCase(); } catch { u = u.split(/[?#]/)[0]; }
  if (u.endsWith('.woff2')) return 'font/woff2';
  if (u.endsWith('.woff')) return 'font/woff';
  if (u.endsWith('.ttf')) return 'font/ttf';
  if (u.endsWith('.otf')) return 'font/otf';
  return 'application/octet-stream';
}

export function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Cap on a single decoded font. A data: URL is held in memory per frame, so a
// runaway/abusive URL shouldn't be allowed to balloon the page. 5 MiB covers
// even large CJK woff2 families.
export const MAX_FONT_BYTES = 5 * 1024 * 1024;
const FONT_EXT_RE = /\.(woff2?|ttf|otf|eot)(?:[?#]|$)/i;
const NON_FONT_CT = new Set(['text/html', 'text/plain', 'application/json', 'application/xml', 'text/xml']);

// 'ok' | 'too-large' | 'not-font'. Fonts are commonly served as octet-stream or
// with no/odd content-type, so only reject responses that clearly aren't fonts
// (e.g. a hotlink-protection HTML page) or that exceed the size cap.
export function classifyFontResponse({ url, contentType, byteLength }) {
  if (byteLength != null && byteLength > MAX_FONT_BYTES) return 'too-large';
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (ct && NON_FONT_CT.has(ct)) return 'not-font';
  const looksFont = !ct || ct.includes('font') || ct.endsWith('octet-stream') || FONT_EXT_RE.test(url);
  return looksFont ? 'ok' : 'not-font';
}

function header(res, name) {
  try { return res.headers && res.headers.get ? res.headers.get(name) : null; } catch { return null; }
}

export async function fetchFontAsDataUrl(url, fetchFn = fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status}`);
  const declared = Number(header(res, 'content-length'));
  if (declared > MAX_FONT_BYTES) throw new Error(`font too large: ${declared} bytes`);
  const contentType = header(res, 'content-type');
  const earlyVerdict = classifyFontResponse({ url, contentType, byteLength: Number.isFinite(declared) ? declared : null });
  if (earlyVerdict === 'not-font') throw new Error('rejected font response: not-font');
  const buf = await readResponseLimited(res, MAX_FONT_BYTES);
  const verdict = classifyFontResponse({ url, contentType, byteLength: buf.byteLength });
  if (verdict !== 'ok') throw new Error(`rejected font response: ${verdict}`);
  return `data:${guessFontMime(url)};base64,${arrayBufferToBase64(buf)}`;
}

async function readResponseLimited(res, maxBytes) {
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new Error(`font too large: ${buf.byteLength} bytes`);
    return buf;
  }

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel('font too large'); } catch {}
        throw new Error(`font too large: more than ${maxBytes} bytes`);
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return merged.buffer;
}

// One fetch per URL per service-worker lifetime. With all_frames:true a page of
// many same-origin iframes would otherwise each re-fetch + re-base64 the same
// font. In-flight requests share the same promise; failures are evicted so a
// transient error doesn't poison the URL.
const fontCache = new Map();
export const MAX_FONT_CACHE_ENTRIES = 4;
export function fetchFontCached(url, fetchFn = fetch) {
  if (fontCache.has(url)) {
    const cached = fontCache.get(url);
    fontCache.delete(url);
    fontCache.set(url, cached);
    return cached;
  }
  const p = fetchFontAsDataUrl(url, fetchFn).catch((e) => {
    if (fontCache.get(url) === p) fontCache.delete(url);
    throw e;
  });
  fontCache.set(url, p);
  while (fontCache.size > MAX_FONT_CACHE_ENTRIES) fontCache.delete(fontCache.keys().next().value);
  return p;
}

// Advance past a CSS string starting at `i` (src[i] is the opening quote),
// honouring backslash escapes. Returns the index just past the closing quote.
function skipCssString(src, i) {
  const q = src[i];
  i += 1;
  for (; i < src.length; i += 1) {
    if (src[i] === '\\') { i += 1; continue; }
    if (src[i] === q) return i + 1;
  }
  return src.length;
}

// Extract only the @font-face rules from a stylesheet, dropping arbitrary
// selectors, nested @import, @media, and any background-image/beacon requests. A
// @font-face body holds only descriptors (family, src, weight, unicode-range…),
// so passing the block through can't restyle the page — the sole external request
// it can trigger is the font file itself. The scan tracks strings AND comments so
// neither a `}` inside a quoted url() nor a `}` inside a `/* comment */` truncates
// a block, and a commented-out `@font-face` is not mistaken for a real rule.
export function extractFontFaces(cssText) {
  const src = String(cssText || '');
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (src[i] === '"' || src[i] === "'") { i = skipCssString(src, i); continue; }
    // A real @font-face rule: the token, then whitespace/comments, then `{`. Scan
    // for the brace (skipping `/* comments */` and any amount of whitespace) rather
    // than matching a fixed-length slice, so `@font-face /* x */ {` or a long gap
    // before `{` still counts.
    if (src[i] === '@' && /^@font-face/i.test(src.slice(i, i + 10)) && !/[\w-]/.test(src[i + 10] || '')) {
      let k = i + 10;
      while (k < n) {
        if (src[k] === '/' && src[k + 1] === '*') { const e = src.indexOf('*/', k + 2); k = e === -1 ? n : e + 2; continue; }
        if (/\s/.test(src[k])) { k += 1; continue; }
        break;
      }
      if (src[k] !== '{') { i += 10; continue; } // @font-face not opening a block
      const start = i;
      let j = k + 1; // past the opening brace
      let depth = 1;
      while (j < n && depth > 0) {
        const c = src[j];
        if (c === '/' && src[j + 1] === '*') {
          const end = src.indexOf('*/', j + 2);
          j = end === -1 ? n : end + 2;
          continue;
        }
        if (c === '"' || c === "'") { j = skipCssString(src, j); continue; }
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        j += 1;
      }
      out.push(src.slice(start, j));
      i = j;
      continue;
    }
    i += 1;
  }
  return out.join('\n');
}

// Decode CSS escape sequences in a url() argument (shared by the quoted and
// unquoted branches). Per CSS syntax: `\` + 1–6 hex digits is a codepoint (one
// trailing whitespace is consumed); `\` + newline is a line continuation (removed);
// `\` + any other char is that char literally. Without this, a backslash reaches
// new URL() and is treated as a path separator, corrupting the address.
function decodeCssEscapes(s) {
  return String(s).replace(/\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|(\r\n|[\n\r\f])|([\s\S]))/g,
    (m, hex, nl, ch) => {
      if (hex) { const cp = parseInt(hex, 16); try { return cp ? String.fromCodePoint(cp) : '�'; } catch { return '�'; } }
      if (nl != null) return ''; // escaped newline = line continuation
      return ch; // escaped character = the literal character
    });
}

// Emit a url() token for an already-resolved absolute address, preserving the
// input quote style. An unquoted input is re-quoted only if the address contains a
// char that can't sit bare in url() (whitespace, parens, quotes, backslash).
function buildUrlToken(abs, quote) {
  if (quote) {
    const esc = abs.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`);
    return `url(${quote}${esc}${quote})`;
  }
  if (/[\s()"'\\]/.test(abs)) return `url("${abs.replace(/[\\"]/g, (m) => `\\${m}`)}")`;
  return `url(${abs})`;
}

// Rewrite relative url(...) references to absolute, resolved against the
// stylesheet's own (post-redirect) address. The extracted rules are injected into
// the VISITED page's <style>, where a relative `url(../f.woff2)` would otherwise
// resolve against the page — not the font host — and 404. Google Fonts ships
// absolute URLs (unaffected); a generic CDN stylesheet often ships relative ones.
//
// A CSS-aware scan (not a regex): strings and comments are stepped over so a url()
// inside one isn't touched, and the url() argument is read honouring quotes and
// backslash escapes — so `url("../v(2).woff2")` (a `)` inside quotes) and
// `url(../v\(2\).woff2)` (an escaped `)`) resolve correctly instead of being
// missed or corrupted. data:/blob:/empty refs and anything that fails to resolve
// are left exactly as-is.
export function absolutizeFontUrls(cssText, baseUrl) {
  const src = String(cssText || '');
  if (!baseUrl) return src;
  let out = '';
  let i = 0;
  const n = src.length;
  // Skip whitespace AND CSS comments (both are stripped before tokenization, so
  // either may sit between `url(`, the argument, and `)`).
  const skipWsc = (k) => {
    while (k < n) {
      if (/\s/.test(src[k])) { k += 1; continue; }
      if (src[k] === '/' && src[k + 1] === '*') { const e = src.indexOf('*/', k + 2); k = e === -1 ? n : e + 2; continue; }
      break;
    }
    return k;
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e === -1 ? n : e + 2;
      out += src.slice(i, end); i = end; continue;
    }
    if (c === '"' || c === "'") { const j = skipCssString(src, i); out += src.slice(i, j); i = j; continue; }
    // A url( function token — not the tail of a longer ident like `myurl(`.
    if ((c === 'u' || c === 'U') && /^url\(/i.test(src.slice(i, i + 4)) && !(i > 0 && /[\w-]/.test(src[i - 1]))) {
      const tokenStart = i;
      let j = skipWsc(i + 4);
      let ref = '';
      let quote = '';
      if (src[j] === '"' || src[j] === "'") {
        quote = src[j];
        const end = skipCssString(src, j);
        ref = decodeCssEscapes(src.slice(j + 1, end - 1));
        j = end;
      } else {
        // Collect the raw argument (keeping backslash pairs so an escaped `)` does
        // not terminate it, and skipping CSS comments so their characters don't get
        // encoded into the address), then decode CSS escapes like the quoted arm.
        let raw = '';
        while (j < n && src[j] !== ')') {
          if (src[j] === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e === -1 ? n : e + 2; continue; }
          if (src[j] === '\\') { raw += src[j] + (src[j + 1] || ''); j += 2; continue; }
          raw += src[j]; j += 1;
        }
        ref = decodeCssEscapes(raw.trim());
      }
      j = skipWsc(j);
      if (src[j] === ')') {
        const raw = src.slice(tokenStart, j + 1);
        if (!ref || /^(?:data|blob):/i.test(ref)) { out += raw; i = j + 1; continue; }
        let abs;
        try { abs = new URL(ref, baseUrl).href; } catch { out += raw; i = j + 1; continue; }
        out += buildUrlToken(abs, quote);
        i = j + 1; continue;
      }
      // Unterminated url( — emit the literal and keep scanning past it.
      out += src.slice(tokenStart, i + 4); i += 4; continue;
    }
    out += c; i += 1;
  }
  return out;
}

// Cap on a fetched webfont stylesheet. Google Fonts CSS is a few KB; this bounds a
// hostile URL that streams megabytes of CSS.
export const MAX_FONT_CSS_BYTES = 512 * 1024;

// Fetch a webfont "CSS link" in the background (extension origin — no page
// cookies) and return ONLY its @font-face rules, with relative font URLs made
// absolute. This replaces a page-side @import, which would pull the whole remote
// author stylesheet into the page. The download is stream-capped so a URL with a
// missing/false Content-Length can't buffer megabytes before the size check.
export async function fetchFontCss(url, fetchFn = fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`css fetch failed: ${res.status}`);
  const declared = Number(header(res, 'content-length'));
  if (declared > MAX_FONT_CSS_BYTES) throw new Error(`css too large: ${declared} bytes`);
  const buf = await readResponseLimited(res, MAX_FONT_CSS_BYTES);
  const text = new TextDecoder('utf-8').decode(buf);
  const faces = extractFontFaces(text);
  return absolutizeFontUrls(faces, res.url || url);
}

// One fetch per stylesheet URL per worker lifetime (all_frames amplification), an
// in-flight promise is shared, and a failure is evicted so a retry can succeed.
const fontCssCache = new Map();
export function fetchFontCssCached(url, fetchFn = fetch) {
  if (fontCssCache.has(url)) return fontCssCache.get(url);
  const p = fetchFontCss(url, fetchFn).catch((e) => {
    if (fontCssCache.get(url) === p) fontCssCache.delete(url);
    throw e;
  });
  fontCssCache.set(url, p);
  while (fontCssCache.size > MAX_FONT_CACHE_ENTRIES) fontCssCache.delete(fontCssCache.keys().next().value);
  return p;
}

// Build the insertCSS/removeCSS target. Targeting the *sender's* frame is what
// makes the font reach content rendered inside iframes (e.g. Naver Cafe renders
// its article in a same-origin <iframe id="cafe_main">). Omitting frameIds makes
// Chrome inject into the top frame only, so iframe text keeps its original font.
export function cssTarget(tabId, frameId) {
  const target = { tabId };
  if (frameId != null) target.frameIds = [frameId];
  return target;
}

// ---- Browser wiring (no-ops in unit tests where runtime is absent) ----
//
// GUARDRAIL (w3c/webextensions#906): keep `origin: 'USER'` here, and keep the
// author-origin rules in content.js's synchronous in-page <style> — do NOT move
// author styling to scripting.insertCSS({ origin: 'AUTHOR' }). Chrome currently
// mis-files AUTHOR-origin injected CSS at the *user* origin (so author
// !important wouldn't beat real page author !important), while Firefox files it
// per spec — switching would silently break the cascade on Chrome only. The
// USER-origin sheet here is the reinforcement path precisely *because* user
// !important outranks author !important regardless of that bug.
// Serialize the USER-origin sheet swaps per frame. Independent insert/remove
// messages are async and can complete out of order — a rapid shape-change preview
// followed by a committed reapply (e.g. on popup close) could otherwise land the
// stale preview sheet last. Chaining per frame guarantees each replace fully
// applies before the next starts, and the new sheet is inserted BEFORE the old is
// removed (both USER !important → newer source order wins) to avoid a flash.
//
// Two cross-document hazards are handled beyond ordering:
//   - `installed` is the authoritative last css WE injected, so a removal targets
//     what's really there — not the caller's belief (which resets to '' in each
//     fresh content script) — so a stale sheet can't survive a navigation.
//   - `owner` is the document that currently holds the frame (see registerCssOwner).
//     A queued op from a superseded document is discarded, and — because a new
//     document can register mid-flight — ownership is re-checked after the awaited
//     browser calls too, so a delayed op can't leak its sheet into the next page.
const cssState = new Map(); // `${tabId}:${frameId}` → { owner, installedDoc, installed, stale, chain, pending }
const MAX_STALE_CSS = 8;
const cssKey = (tabId, frameId) => `${tabId}:${frameId == null ? 'top' : frameId}`;
function cssStateFor(key) {
  let st = cssState.get(key);
  if (!st) { st = { owner: null, installedDoc: null, installed: '', stale: new Set(), chain: Promise.resolve(), pending: 0 }; cssState.set(key, st); }
  return st;
}

// A document announces itself active (load / BFCache pageshow) → it owns the
// frame's USER sheet from now on. Applied at message-arrival time (not queued),
// so any queued op from a prior document is discarded when it later runs.
export function registerCssOwner(tabId, frameId, docId) {
  if (docId == null) return;
  cssStateFor(cssKey(tabId, frameId)).owner = docId;
}

// `prevCss` is the sheet the CONTENT script believes it last installed. The
// content script survives an MV3 worker restart while this in-memory state does
// not, so after a restart `installed` is '' and a shape change would insert the
// new sheet without removing the old one (its now-off rules would keep applying).
// Treating the caller's `prev` as an extra removal candidate closes that gap.
export function replaceCssSerialized(tabId, frameId, css, docId, scripting = (browser && browser.scripting), prevCss = '') {
  const key = cssKey(tabId, frameId);
  const target = cssTarget(tabId, frameId);
  const st = cssStateFor(key);
  st.pending += 1;
  // True once a newer document has registered as this frame's owner. Injected CSS
  // targets whatever document currently occupies the frame, so once we're no longer
  // the owner our sheet lands in the WRONG (now-current) document — checked both up
  // front and again after every awaited browser call (a new owner can register
  // while insertCSS/removeCSS is in flight).
  const superseded = () => st.owner != null && docId != null && docId !== st.owner;
  const chain = st.chain.then(async () => {
    if (superseded()) return;
    // A new document must (re)install even identical css: navigation drops its
    // sheet while `installed` survives here, so dedupe only within one document.
    const sameDoc = docId != null && docId === st.installedDoc;
    // Retry is driven purely by `installed` (the last SUCCESSFUL install): a failed
    // insert never updates it, so a repeat of the same css re-inserts naturally and
    // a revert to what's already installed is skipped. No `dirty` flag — it was
    // global, so a failed preview insert made the next revert re-insert the still-
    // installed committed sheet (a duplicate).
    const needsInsert = css !== '' && !(sameDoc && css === st.installed);
    const needsCleanup = st.stale.size > 0 || (st.installed && st.installed !== css) || (css === '' && !!st.installed) || (!!prevCss && prevCss !== css);
    if (!needsInsert && !needsCleanup) return;
    if (!scripting) { if (needsInsert || css === '') { st.installed = css; st.installedDoc = docId; } return; }
    let inserted = false;
    if (needsInsert) {
      // Leave prior state intact on a failed insert so the next apply retries
      // (no phantom "installed" that suppresses a retry).
      try { await scripting.insertCSS({ target, css, origin: 'USER' }); inserted = true; }
      catch { return; }
    }
    // Cleanup (separate from insert): remove the replaced sheet + any removal that
    // failed before. A removal that fails again is kept (bounded) and retried, not
    // lost — and when only cleanup is needed the current sheet is NOT reinserted.
    // Removing CSS is safe regardless of who owns the frame now, so it runs before
    // the ownership recheck below.
    const toRemove = new Set(st.stale);
    if (st.installed && st.installed !== css) toRemove.add(st.installed);
    if (prevCss && prevCss !== css) toRemove.add(prevCss); // content-supplied: survives a worker restart that lost `installed`
    st.stale.clear();
    for (const old of toRemove) {
      if (old === css) continue;
      try { await scripting.removeCSS({ target, css: old, origin: 'USER' }); }
      catch { if (st.stale.size < MAX_STALE_CSS) st.stale.add(old); }
    }
    // A newer document registered while we awaited insert/removeCSS: our injected
    // sheet now sits in ITS live document. Strip it and commit no authoritative
    // state — the new owner's own queued op reinstalls.
    if (superseded()) {
      if (inserted && css !== '') {
        try { await scripting.removeCSS({ target, css, origin: 'USER' }); }
        catch { if (st.stale.size < MAX_STALE_CSS) st.stale.add(css); }
      }
      return;
    }
    if (needsInsert) st.installedDoc = docId;
    if (needsInsert || css === '') st.installed = css;
  }).catch(() => {}).finally(() => {
    st.pending -= 1;
    // Drop the entry once the queue drains with nothing left to track, so a
    // long-lived worker doesn't accumulate a key per visited frame.
    if (st.pending === 0 && !st.installed && st.stale.size === 0 && cssState.get(key) === st) cssState.delete(key);
  });
  st.chain = chain;
  return chain;
}

// Drop all per-frame CSS state for a tab — its documents are gone, so nothing is
// installed to track. Wired to tabs.onRemoved (normal close/navigation-away).
export function purgeTabCss(tabId) {
  const prefix = `${tabId}:`;
  for (const key of cssState.keys()) if (key.startsWith(prefix)) cssState.delete(key);
}

// Test hook: number of live per-frame CSS chains.
export function __cssStateSize() { return cssState.size; }

async function setBadge(tabId, enabled) {
  try {
    await browser.action.setBadgeText({ tabId, text: enabled ? '' : 'off' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#888' });
  } catch {}
}

// Turn Refont on/off for a site. `enable` is the DESIRED state (the popup knows
// the current one and flips it) so a site blocked by a broader rule can actually
// be undone instead of gaining a redundant exact-host block:
//   enable=true  → drop an exact-host block; if a parent/path rule still catches
//                  the URL, add a host allow-exception (which overrides the block).
//   enable=false → drop any allow-exception; if nothing blocks the URL yet, add
//                  an exact-host block.
// We only ever add/remove OUR exact-host entries — a user's parent/path rules are
// never widened or deleted (that's what the allowlist exists to override).
async function toggleSite(url, enable) {
  const settings = await getSettings();
  const next = computeSiteToggle(url, enable, settings.blocklist, settings.allowlist || []);
  return saveSettings(next);
}

async function broadcastReapply() {
  const settings = await getSettings();
  const tabs = await browser.tabs.query({});
  for (const t of tabs) {
    if (t.id == null) continue;
    browser.tabs.sendMessage(t.id, { type: MSG.REAPPLY }).catch(() => {});
    // Keep the toolbar badge current after a save / site toggle / global switch,
    // instead of only on the next full tab load (tabs.onUpdated).
    if (t.url) setBadge(t.id, settings.enabled && !isBlocked(t.url, settings.blocklist, settings.allowlist));
  }
}

if (browser && browser.runtime && browser.runtime.onMessage) {
  browser.runtime.onMessage.addListener((msg, sender) => {
    const tabId = sender && sender.tab && sender.tab.id;
    const frameId = sender && sender.frameId;
    switch (msg && msg.type) {
      case MSG.GET_SETTINGS:
        return getSettings();
      case MSG.SAVE_SETTINGS:
        return saveSettings(msg.payload).then(async (s) => { await broadcastReapply(); return s; });
      case MSG.FETCH_FONT:
        return fetchFontCached(msg.url);
      case MSG.FETCH_FONT_CSS:
        return fetchFontCssCached(msg.url);
      case MSG.CSS_REGISTER:
        registerCssOwner(tabId, frameId, msg.docId || (sender && sender.documentId));
        return undefined;
      case MSG.REPLACE_CSS:
        return replaceCssSerialized(tabId, frameId, msg.css || '', msg.docId || (sender && sender.documentId), undefined, msg.prev || '');
      case MSG.TOGGLE_SITE:
        return toggleSite(msg.url || (sender.tab && sender.tab.url), msg.enable).then(async (s) => { await broadcastReapply(); return s; });
      default:
        return undefined;
    }
  });

  if (browser.commands && browser.commands.onCommand) {
    browser.commands.onCommand.addListener(async (command) => {
      if (command !== 'toggle-site') return;
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) { await toggleSite(tab.url); await broadcastReapply(); }
    });
  }

  if (browser.tabs && browser.tabs.onUpdated) {
    browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
      if (info.status !== 'complete' || !tab.url) return;
      const s = await getSettings();
      setBadge(tabId, s.enabled && !isBlocked(tab.url, s.blocklist, s.allowlist));
    });
  }

  // A closed tab destroys its documents' injected CSS without a teardown message,
  // so drop its tracked state to keep the worker's map from growing over time.
  if (browser.tabs && browser.tabs.onRemoved) {
    browser.tabs.onRemoved.addListener((tabId) => purgeTabCss(tabId));
  }
}
