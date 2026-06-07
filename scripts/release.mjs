// One-shot release: bump version everywhere → test → build → package → commit →
// tag → (optionally) push. Keeps the version in lockstep across package.json, both
// manifests, and the popup badge, and tags the release as vX.Y.Z.
//
// Usage:
//   bun scripts/release.mjs 0.2.3                 # bump, test, build, package, commit, tag (no push)
//   bun scripts/release.mjs 0.2.3 --push          # ...and push the branch + the tag
//   bun scripts/release.mjs 0.2.3 -m "fix: ..."   # custom commit message (default: "release: v0.2.3")
//
// Notes:
//   - Aborts if tests fail (before touching any files) and if the tag already exists.
//   - Commit messages carry NO Co-Authored-By trailer (project convention).
//   - Pushes the specific tag, never `--tags` (avoids leaking local/backup tags).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ---- args ----
const argv = process.argv.slice(2);
const version = argv.find((a) => !a.startsWith('-'));
const push = argv.includes('--push');
const mIdx = argv.findIndex((a) => a === '-m' || a === '--message');
const message = mIdx >= 0 ? argv[mIdx + 1] : null;

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: bun scripts/release.mjs <X.Y.Z> [--push] [-m "msg"]');
  process.exit(1);
}
const tag = `v${version}`;
const commitMsg = message || `release: ${tag}`;

const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
const cap = (cmd) => execSync(cmd, { cwd: root }).toString().trim();

// ---- preflight: clean-ish? tag free? tests green? ----
if (cap(`git tag -l ${tag}`)) {
  console.error(`Tag ${tag} already exists. Bump to a new version.`);
  process.exit(1);
}
const branch = cap('git rev-parse --abbrev-ref HEAD');

console.log(`\n▶ Releasing ${tag} on ${branch}\n`);
console.log('▶ Running tests…');
run('bun run test');

// ---- bump version in the three manifests + the UI badge ----
function patch(rel, transform) {
  const file = join(root, rel);
  const before = readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) { console.error(`! No version change applied in ${rel}`); process.exit(1); }
  writeFileSync(file, after);
  console.log(`  bumped ${rel}`);
}
const setJsonVersion = (s) => s.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`);
console.log(`\n▶ Bumping version → ${version}`);
patch('package.json', setJsonVersion);
patch('public/manifest.chrome.json', setJsonVersion);
patch('public/manifest.firefox.json', setJsonVersion);
patch('src/ui/settings-ui.js', (s) => s.replace(/(<span class="ver">v)[^<]*(<\/span>)/, `$1${version}$2`));

// ---- build + package ----
console.log('\n▶ Building + packaging…');
run('bun run build');
run('bun scripts/package.mjs');

// ---- commit + tag ----
console.log('\n▶ Committing + tagging…');
run('git add -A');
// Commit message via stdin so it can contain anything; no Co-Authored-By trailer.
run(`git commit -F -`, { input: commitMsg, stdio: ['pipe', 'inherit', 'inherit'] });
run(`git tag -a ${tag} -m "Refont ${tag}"`);

// ---- push (opt-in) ----
if (push) {
  console.log('\n▶ Pushing branch + tag…');
  run(`git push origin ${branch}`);
  run(`git push origin ${tag}`);
  console.log(`\n✓ Released ${tag} and pushed.`);
} else {
  console.log(`\n✓ Committed + tagged ${tag} (not pushed).`);
  console.log(`  To publish:  git push origin ${branch} && git push origin ${tag}`);
}
console.log(`  Zips: dist/refont-{chrome,firefox,source}-${version}.zip`);
