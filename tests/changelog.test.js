import { describe, it, expect } from 'vitest';
import { parseCommit, groupByType, parseCommits, renderMarkdown, prependSection } from '../scripts/lib/changelog.mjs';

describe('parseCommit', () => {
  it('parses type, scope, and subject', () => {
    expect(parseCommit('feat(engine): add width dial')).toMatchObject({ type: 'feat', scope: 'engine', subject: 'add width dial', breaking: false });
  });
  it('parses without a scope and flags breaking', () => {
    expect(parseCommit('fix: thing')).toMatchObject({ type: 'fix', scope: '', subject: 'thing' });
    expect(parseCommit('feat!: drop X').breaking).toBe(true);
  });
  it('falls back to "other" for non-conventional subjects', () => {
    expect(parseCommit('random text').type).toBe('other');
  });
});

describe('groupByType', () => {
  it('orders sections and drops noise types (chore/test/…)', () => {
    const groups = groupByType(parseCommits([
      'fix: a', 'feat: b', 'chore: noise', 'docs: c', 'random',
    ]));
    expect(groups.map((g) => g.title)).toEqual(['✨ Features', '🐛 Fixes', '📝 Docs', '🔧 Other']);
    expect(groups.find((g) => g.title === '🔧 Other').items[0].subject).toBe('random');
    expect(JSON.stringify(groups)).not.toContain('noise');
  });
});

describe('renderMarkdown', () => {
  it('renders a dated version heading with grouped bullets + scope', () => {
    const md = renderMarkdown('0.2.3', '2026-06-08', ['feat(ui): x', 'fix: y']);
    expect(md).toContain('## v0.2.3 — 2026-06-08');
    expect(md).toContain('### ✨ Features');
    expect(md).toContain('- **ui:** x');
    expect(md).toContain('- y');
  });
  it('handles an empty changeset', () => {
    expect(renderMarkdown('0.0.1', '2026-01-01', [])).toContain('_No notable changes._');
  });
});

describe('prependSection', () => {
  it('inserts the new section under the # Changelog header, above older ones', () => {
    const existing = '# Changelog\n\n## v0.1.0 — 2026-01-01\n\n- old\n';
    const out = prependSection(existing, '## v0.2.0 — 2026-02-02\n\n- new\n');
    expect(out.indexOf('v0.2.0')).toBeLessThan(out.indexOf('v0.1.0'));
    expect(out.startsWith('# Changelog')).toBe(true);
  });
  it('creates a header when none exists', () => {
    expect(prependSection('', '## v0.1.0 — x\n\n- a\n').startsWith('# Changelog')).toBe(true);
  });
});
