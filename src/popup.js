import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { isBlocked } from './lib/url-match.js';

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  const host = (() => { try { return new URL(tab.url).host; } catch { return ''; } })();
  const blocked = isBlocked(tab.url, settings.blocklist);
  document.getElementById('host').textContent = `${host} — ${blocked ? '꺼짐' : '켜짐'}`;

  document.getElementById('toggleSite').addEventListener('click', async () => {
    await browser.runtime.sendMessage({ type: MSG.TOGGLE_SITE, url: tab.url });
    window.close();
  });
  document.getElementById('openOptions').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
}

if (typeof document !== 'undefined' && document.getElementById('toggleSite')) {
  init();
}
