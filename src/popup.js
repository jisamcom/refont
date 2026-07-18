import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';
import { detectFonts, makeMeasurer, FONT_CANDIDATES, MONO_CANDIDATES } from './lib/font-detect.js';
import { mountSettingsUI } from './ui/settings-ui.js';

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  const url = (tab && tab.url) || '';
  const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
  let installedFonts = [], monoFonts = [];
  try { installedFonts = detectFonts(FONT_CANDIDATES, makeMeasurer()); } catch {}
  try { monoFonts = detectFonts(MONO_CANDIDATES, makeMeasurer()); } catch {}
  let pageFonts = [];
  try { pageFonts = await browser.tabs.sendMessage(tab.id, { type: MSG.GET_PAGE_FONTS }); } catch {}
  mountSettingsUI(document.getElementById('root'), {
    context: 'popup', currentHost: host, currentUrl: url, tabId: tab && tab.id,
    blocked: isBlocked(url, settings.blocklist, settings.allowlist),
    settings, installedFonts, monoFonts, pageFonts: pageFonts || [],
  });
}
if (typeof document !== 'undefined' && document.getElementById('root')) init();
