import browser from 'webextension-polyfill';
import { MSG } from './lib/messaging.js';
import { detectFonts, makeMeasurer, FONT_CANDIDATES, MONO_CANDIDATES } from './lib/font-detect.js';
import { mountSettingsUI } from './ui/settings-ui.js';

// Re-export for the existing import/export unit test (tests/options-io.test.js).
export { serializeSettings, parseSettings } from './lib/settings-io.js';

async function init() {
  const settings = await browser.runtime.sendMessage({ type: MSG.GET_SETTINGS });
  let installedFonts = [], monoFonts = [];
  try { installedFonts = detectFonts(FONT_CANDIDATES, makeMeasurer()); } catch {}
  try { monoFonts = detectFonts(MONO_CANDIDATES, makeMeasurer()); } catch {}
  mountSettingsUI(document.getElementById('root'), {
    context: 'options', currentHost: null, tabId: null,
    settings, installedFonts, monoFonts, pageFonts: [],
  });
}
if (typeof document !== 'undefined' && document.getElementById('root')) init();
