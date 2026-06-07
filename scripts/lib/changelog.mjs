// Pure changelog helpers (unit-tested) — no git/fs/network. Turns a list of
// commit subject lines into grouped Markdown release notes. Conventional-commit
// prefixes (feat/fix/perf/refactor/docs) become sections; noise types
// (chore/test/style/ci/build) are dropped from notes.

const TYPES = [
  ['feat', '✨ Features'],
  ['fix', '🐛 Fixes'],
  ['perf', '⚡ Performance'],
  ['refactor', '♻️ Refactor'],
  ['docs', '📝 Docs'],
];
const HIDE = new Set(['chore', 'test', 'style', 'ci', 'build']);

// "feat(engine): add x" -> { type:'feat', scope:'engine', subject:'add x', raw }
export function parseCommit(line) {
  const raw = String(line || '').trim();
  const m = raw.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!m) return { type: 'other', scope: '', breaking: false, subject: raw, raw };
  return { type: m[1].toLowerCase(), scope: m[2] || '', breaking: !!m[3], subject: m[4], raw };
}

export function parseCommits(lines) {
  return (lines || []).map(parseCommit).filter((c) => c.subject);
}

// Ordered sections, dropping noise. Returns [{title, items}].
export function groupByType(commits) {
  const out = [];
  for (const [type, title] of TYPES) {
    const items = (commits || []).filter((c) => c.type === type);
    if (items.length) out.push({ title, items });
  }
  const others = (commits || []).filter(
    (c) => !TYPES.some(([t]) => t === c.type) && !HIDE.has(c.type),
  );
  if (others.length) out.push({ title: '🔧 Other', items: others });
  return out;
}

// One release section: "## vX.Y.Z — DATE" + grouped bullets. `subjectLines` is an
// array of raw commit subject strings.
export function renderMarkdown(version, date, subjectLines) {
  const groups = groupByType(parseCommits(subjectLines));
  const lines = [`## v${version} — ${date}`, ''];
  if (!groups.length) lines.push('_No notable changes._', '');
  for (const g of groups) {
    lines.push(`### ${g.title}`);
    for (const c of g.items) lines.push(`- ${c.scope ? `**${c.scope}:** ` : ''}${c.breaking ? '**BREAKING** ' : ''}${c.subject}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

// Prepend a new section under the "# Changelog" header (creating the file body if
// absent). Pure string transform.
export function prependSection(existing, section) {
  const header = '# Changelog\n';
  const body = String(existing || '').replace(/^# Changelog\n+/, '');
  return `${header}\n${section.trimEnd()}\n\n${body}`.trimEnd() + '\n';
}
