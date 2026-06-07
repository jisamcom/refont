// Build store-ready zip packages into dist/:
//   refont-chrome-<ver>.zip   — upload to Chrome Web Store
//   refont-firefox-<ver>.zip  — upload to Firefox AMO (the built add-on)
//   refont-source-<ver>.zip   — source for AMO reviewers (build is bundled)
// Run `npm run package` (builds first). Pure Node, no external deps.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from './lib/zip.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const distDir = join(root, 'dist');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

// All files under `dir`, as zip entries; `prefix` nests them inside a folder.
function dirEntries(dir, prefix = '') {
  return walk(dir).map((full) => ({
    name: (prefix ? prefix + '/' : '') + relative(dir, full).split(sep).join('/'),
    data: readFileSync(full),
  }));
}

function fileEntry(rel) {
  const full = join(root, rel);
  return existsSync(full) ? [{ name: rel.split(sep).join('/'), data: readFileSync(full) }] : [];
}

for (const t of ['chrome', 'firefox']) {
  if (!existsSync(join(distDir, t))) {
    console.error(`Missing dist/${t}. Run "npm run build" first.`);
    process.exit(1);
  }
}

mkdirSync(distDir, { recursive: true });

// 1 + 2: built add-ons — manifest.json must sit at the zip root.
const targets = [
  ['chrome', join(distDir, 'chrome')],
  ['firefox', join(distDir, 'firefox')],
];
const sizes = {};
for (const [name, dir] of targets) {
  const buf = zipSync(dirEntries(dir));
  const out = join(distDir, `refont-${name}-${version}.zip`);
  writeFileSync(out, buf);
  sizes[name] = buf.length;
}

// 3: source package for AMO reviewers (we bundle with esbuild → source required).
const srcEntries = [
  ...dirEntries(join(root, 'src'), 'src'),
  ...dirEntries(join(root, 'public'), 'public'),
  ...dirEntries(join(root, 'scripts'), 'scripts'),
  ...dirEntries(join(root, 'tests'), 'tests'),
  ...fileEntry('package.json'),
  ...fileEntry('package-lock.json'),
  ...fileEntry('vitest.config.js'),
  ...fileEntry('README.md'),
  ...fileEntry('CHANGELOG.md'),
  ...fileEntry(join('docs', 'REVIEWERS.md')),
];
const sourceBuf = zipSync(srcEntries);
writeFileSync(join(distDir, `refont-source-${version}.zip`), sourceBuf);
sizes.source = sourceBuf.length;

const kb = (n) => (n / 1024).toFixed(1) + 'KB';
console.log(
  `Packaged v${version} → dist/\n` +
    `  refont-chrome-${version}.zip  (${kb(sizes.chrome)})\n` +
    `  refont-firefox-${version}.zip (${kb(sizes.firefox)})\n` +
    `  refont-source-${version}.zip  (${kb(sizes.source)})`,
);
