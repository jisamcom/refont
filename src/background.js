// src/background.js
import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { getSettings, saveSettings } from './lib/storage.js';
import { isBlocked } from './lib/url-match.js';

export function guessFontMime(url) {
  const u = String(url).toLowerCase();
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
  const buf = await res.arrayBuffer();
  const verdict = classifyFontResponse({ url, contentType: header(res, 'content-type'), byteLength: buf.byteLength });
  if (verdict !== 'ok') throw new Error(`rejected font response: ${verdict}`);
  return `data:${guessFontMime(url)};base64,${arrayBufferToBase64(buf)}`;
}

// One fetch per URL per service-worker lifetime. With all_frames:true a page of
// many same-origin iframes would otherwise each re-fetch + re-base64 the same
// font. In-flight requests share the same promise; failures are evicted so a
// transient error doesn't poison the URL.
const fontCache = new Map();
export function fetchFontCached(url, fetchFn = fetch) {
  if (fontCache.has(url)) return fontCache.get(url);
  const p = fetchFontAsDataUrl(url, fetchFn).catch((e) => { fontCache.delete(url); throw e; });
  fontCache.set(url, p);
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
async function applyCssToTab(tabId, css, frameId) {
  if (!css) return;
  await browser.scripting.insertCSS({ target: cssTarget(tabId, frameId), css, origin: 'USER' });
}
async function removeCssFromTab(tabId, css, frameId) {
  try { await browser.scripting.removeCSS({ target: cssTarget(tabId, frameId), css, origin: 'USER' }); } catch {}
}

async function setBadge(tabId, enabled) {
  try {
    await browser.action.setBadgeText({ tabId, text: enabled ? '' : 'off' });
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#888' });
  } catch {}
}

async function toggleSite(url) {
  const settings = await getSettings();
  let host = '';
  try { host = new URL(url).host; } catch { return settings; }
  const list = settings.blocklist.slice();
  const idx = list.findIndex((e) => e === host);
  if (idx >= 0) list.splice(idx, 1); else list.push(host);
  return saveSettings({ blocklist: list });
}

async function broadcastReapply() {
  const tabs = await browser.tabs.query({});
  for (const t of tabs) {
    if (t.id != null) browser.tabs.sendMessage(t.id, { type: MSG.REAPPLY }).catch(() => {});
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
      case MSG.APPLY_CSS:
        return applyCssToTab(tabId, msg.css, frameId);
      case MSG.REMOVE_CSS:
        return removeCssFromTab(tabId, msg.css, frameId);
      case MSG.TOGGLE_SITE:
        return toggleSite(msg.url || (sender.tab && sender.tab.url)).then(async (s) => { await broadcastReapply(); return s; });
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
      setBadge(tabId, s.enabled && !isBlocked(tab.url, s.blocklist));
    });
  }
}
