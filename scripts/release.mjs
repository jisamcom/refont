// One-shot release: bump version everywhere → test → build → package → commit →
// tag → (optionally) push. Keeps the version in lockstep across package.json, both
// manifests, and the popup badge, and tags the release as vX.Y.Z.
//
// Usage:
//   npm run release -- 0.2.5                 # bump, test, build, package, commit, tag (no push)
//   npm run release -- 0.2.5 --push          # ...and push the branch + the tag
//   npm run release -- 0.2.5 -m "fix: ..."   # custom commit message (default: "release: v0.2.5")
//
// Notes:
//   - Aborts if tests fail (before touching any files) and if the tag already exists.
//   - Commit messages carry NO Co-Authored-By trailer (project convention).
//   - Pushes the specific tag, never `--tags` (avoids leaking local/backup tags).
//   - With --push + GITHUB_TOKEN, creates the GitHub Release (notes + zips).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { renderMarkdown, prependSection } from './lib/changelog.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ---- args ----
const argv = process.argv.slice(2);
const version = argv.find((a) => !a.startsWith('-'));
const push = argv.includes('--push');
const mIdx = argv.findIndex((a) => a === '-m' || a === '--message');
const message = mIdx >= 0 ? argv[mIdx + 1] : null;

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run release -- <X.Y.Z> [--push] [-m "msg"]');
  process.exit(1);
}
const tag = `v${version}`;
const commitMsg = message || `release: ${tag}`;

const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
const cap = (cmd) => execSync(cmd, { cwd: root }).toString().trim();

// Pick the runner that's actually installed. The repo's documented flow is
// npm/node; this machine uses Bun. Detect Bun and fall back to npm/node so the
// release works in either environment.
const has = (bin) => { try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true; } catch { return false; } };
const useBun = has('bun');
const CMD = {
  test: useBun ? 'bun run test' : 'npm test',
  build: useBun ? 'bun run build' : 'npm run build',
  package: useBun ? 'bun scripts/package.mjs' : 'node scripts/package.mjs',
};

// ---- preflight: clean branch? tag free? tests green? ----
const dirty = cap('git status --porcelain');
if (dirty) {
  console.error('Working tree is not clean. Commit or stash changes before releasing.');
  process.exit(1);
}
if (cap(`git tag -l ${tag}`)) {
  console.error(`Tag ${tag} already exists. Bump to a new version.`);
  process.exit(1);
}
const branch = cap('git rev-parse --abbrev-ref HEAD');
if (!branch || branch === 'HEAD') {
  console.error('Cannot release from a detached HEAD. Check out a branch first.');
  process.exit(1);
}

console.log(`\n▶ Releasing ${tag} on ${branch}\n`);
console.log(`▶ Running tests… (${useBun ? 'bun' : 'npm'})`);
run(CMD.test);

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

// Sync the lockfile's root version to match package.json so the committed
// package-lock.json (bundled into the source zip) doesn't lag behind. Only the
// root version field changes — deps are unaffected — since package.json's ranges
// didn't move. Uses npm (bun can't write package-lock.json).
console.log('  syncing package-lock.json');
run('npm install --package-lock-only --ignore-scripts');

// ---- build + package ----
console.log('\n▶ Building + packaging…');
run(CMD.build);
run(CMD.package);

// ---- changelog (commit subjects since the previous version tag) ----
console.log('\n▶ Generating changelog…');
let prevTag = '';
try { prevTag = cap('git describe --tags --abbrev=0 --match "v*"'); } catch { /* no prior tag */ }
const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
const subjects = cap(`git log ${range} --no-merges --pretty=format:%s`).split('\n').filter(Boolean);
const date = new Date().toISOString().slice(0, 10);
const section = renderMarkdown(version, date, subjects);
const changelogPath = join(root, 'CHANGELOG.md');
const existing = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
writeFileSync(changelogPath, prependSection(existing, section));
writeFileSync(join(root, 'dist', `RELEASE_NOTES-${tag}.md`), section); // for manual paste if needed
console.log(`  CHANGELOG.md updated (${subjects.length} commit(s) since ${prevTag || 'start'})`);

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
  await createGithubRelease();
} else {
  console.log(`\n✓ Committed + tagged ${tag} (not pushed).`);
  console.log(`  To publish:  git push origin ${branch} && git push origin ${tag}`);
}
console.log(`  Zips: dist/refont-{chrome,firefox,source}-${version}.zip`);
console.log(`  Notes: dist/RELEASE_NOTES-${tag}.md`);

// Create a GitHub Release (with the notes + zip assets) when a token is present.
// The token is read ONLY from the GITHUB_TOKEN env var — never passed on the CLI
// or stored — so it can't leak into shell history or the repo.
async function createGithubRelease() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('\nℹ GITHUB_TOKEN not set → skipping GitHub Release.');
    console.log('  Create it manually (paste dist/RELEASE_NOTES-' + tag + '.md), or rerun with:');
    console.log(`    GITHUB_TOKEN=… npm run release -- ${version} --push`);
    return;
  }
  const remote = cap('git remote get-url origin');
  const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) { console.warn('! Could not parse owner/repo from origin; skipping GitHub Release.'); return; }
  const [, owner, repo] = m;
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'refont-release' };
  try {
    console.log(`\n▶ Creating GitHub Release ${tag}…`);
    const res = await fetch(`${api}/releases`, {
      method: 'POST', headers,
      body: JSON.stringify({ tag_name: tag, name: tag, body: section }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rel = await res.json();
    const uploadBase = rel.upload_url.replace(/\{.*\}$/, '');
    for (const name of [`refont-chrome-${version}.zip`, `refont-firefox-${version}.zip`, `refont-source-${version}.zip`]) {
      const data = readFileSync(join(root, 'dist', name));
      const up = await fetch(`${uploadBase}?name=${encodeURIComponent(name)}`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: data,
      });
      console.log(up.ok ? `  ↑ ${name}` : `  ! upload failed ${name}: ${up.status}`);
    }
    console.log(`✓ GitHub Release: ${rel.html_url}`);
  } catch (e) {
    console.warn(`! GitHub Release failed (push + tag already done): ${e.message}`);
  }
}
