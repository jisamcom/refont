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

export async function fetchFontAsDataUrl(url, fetchFn = fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return `data:${guessFontMime(url)};base64,${arrayBufferToBase64(buf)}`;
}

// ---- Browser wiring (no-ops in unit tests where runtime is absent) ----
async function applyCssToTab(tabId, css) {
  if (!css) return;
  await browser.scripting.insertCSS({ target: { tabId }, css, origin: 'USER' });
}
async function removeCssFromTab(tabId, css) {
  try { await browser.scripting.removeCSS({ target: { tabId }, css, origin: 'USER' }); } catch {}
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
    switch (msg && msg.type) {
      case MSG.GET_SETTINGS:
        return getSettings();
      case MSG.SAVE_SETTINGS:
        return saveSettings(msg.payload).then(async (s) => { await broadcastReapply(); return s; });
      case MSG.FETCH_FONT:
        return fetchFontAsDataUrl(msg.url);
      case MSG.APPLY_CSS:
        return applyCssToTab(tabId, msg.css);
      case MSG.REMOVE_CSS:
        return removeCssFromTab(tabId, msg.css);
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
