import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
