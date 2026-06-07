import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSkeletonCss } from '../src/lib/engine.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = process.argv[2] || 'chrome';
const outdir = join(root, 'dist', target);

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [
    join(root, 'src/background.js'),
    join(root, 'src/content.js'),
    join(root, 'src/options.js'),
    join(root, 'src/popup.js'),
  ],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox115'],
  outdir,
  logLevel: 'info',
});

// Bootstrap stylesheet: the static rule skeleton, declared via manifest
// content_scripts.css so the font-family rules exist before content.js even
// executes (earliest possible FOUC defense). Generated from the engine so it can
// never drift from buildSkeletonCss(). Until content.js sets the --refont-*
// variables and tags elements, the var() rules resolve to nothing — harmless.
writeFileSync(join(outdir, 'refont-bootstrap.css'), `${buildSkeletonCss()}\n`);

// static assets
copyFileSync(join(root, 'public/options.html'), join(outdir, 'options.html'));
copyFileSync(join(root, 'public/popup.html'), join(outdir, 'popup.html'));
copyFileSync(join(root, 'public/settings-ui.css'), join(outdir, 'settings-ui.css'));
cpSync(join(root, 'public/icons'), join(outdir, 'icons'), { recursive: true });
copyFileSync(
  join(root, `public/manifest.${target}.json`),
  join(outdir, 'manifest.json'),
);

console.log(`Built ${target} → ${outdir}`);
