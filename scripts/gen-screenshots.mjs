// Render the store screenshot templates to PNG using a headless Chromium
// (Chrome or Edge). Outputs exact-size images into docs/store-assets/.
// Run: npm run screenshots
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tplDir = join(root, 'scripts', 'screenshots');
const outDir = join(root, 'docs', 'store-assets');
const profile = join(root, 'dist', '.shot-profile');

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  console.error('No Chrome/Edge found. Install one or edit CANDIDATES in gen-screenshots.mjs.');
  process.exit(1);
}

// [template, width, height, output-name]
const JOBS = [
  ['01-hero.html', 1280, 800, 'screenshot-1-hero.png'],
  ['02-protect.html', 1280, 800, 'screenshot-2-protection.png'],
  ['03-picker.html', 1280, 800, 'screenshot-3-picker.png'],
  ['04-controls.html', 1280, 800, 'screenshot-4-controls.png'],
  ['05-sitecontrol.html', 1280, 800, 'screenshot-5-site-control.png'],
  ['promo-small.html', 440, 280, 'promo-tile-440x280.png'],
];

mkdirSync(outDir, { recursive: true });
rmSync(profile, { recursive: true, force: true });

for (const [tpl, w, h, out] of JOBS) {
  const url = pathToFileURL(join(tplDir, tpl)).href;
  const outPath = join(outDir, out);
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      `--window-size=${w},${h}`,
      `--screenshot=${outPath}`,
      url,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  console.log(`  ${out}  (${w}x${h})`);
}

rmSync(profile, { recursive: true, force: true });
console.log(`\nRendered ${JOBS.length} images → docs/store-assets/  using ${browser.includes('Edge') ? 'Edge' : 'Chrome'}`);
