import { describe, expect, it } from 'vitest';
import {
  extractClaudeMdBody,
  spliceClaudeMdBody,
  normalizeVerifierOutput,
} from '../../../../../src/nodes/initialize-project/phase3_5/helpers/splice-claude-md.js';

/**
 * The Phase 3 synthesis blob holds five `---`-separated sections. The Phase 3.5
 * verifier corrects only the cheat-sheet section; these helpers must isolate and
 * splice it back without disturbing the other four.
 */

const BLOB = [
  '# CLAUDE.md Content',
  '',
  '# my-api',
  '',
  '## Tech Stack',
  '- FastAPI',
  '',
  '---',
  '# code-conventions/SKILL.md Content',
  '',
  '---',
  'frontmatter: here',
  '',
  '# multi-file-workflows/SKILL.md Content',
  '',
  '# testing-conventions/SKILL.md Content',
  '',
  '# Architectural Narrative Content',
  '',
  'Some narrative.',
].join('\n');

describe('extractClaudeMdBody', () => {
  it('returns the cheat-sheet body without its header or trailing separator', () => {
    expect(extractClaudeMdBody(BLOB)).toBe('# my-api\n\n## Tech Stack\n- FastAPI');
  });

  it('returns null when no cheat-sheet header is present', () => {
    expect(extractClaudeMdBody('# Some Other Doc\n\ntext')).toBeNull();
  });

  it('supports the Codex AGENTS.md header variant', () => {
    const blob = '# AGENTS.md Content\n\n# my-api\n\n---\n# code-conventions/SKILL.md Content\n';
    expect(extractClaudeMdBody(blob)).toBe('# my-api');
  });
});

describe('spliceClaudeMdBody', () => {
  it('replaces only the cheat-sheet body and preserves the other sections', () => {
    const corrected = '# my-api\n\n## Tech Stack\n- FastAPI 0.115';
    const out = spliceClaudeMdBody(BLOB, corrected);
    expect(out).not.toBeNull();
    expect(out).toContain('## Tech Stack\n- FastAPI 0.115');
    expect(extractClaudeMdBody(out as string)).toBe(corrected);
    // Other sections survive untouched.
    expect(out).toContain('# code-conventions/SKILL.md Content');
    expect(out).toContain('# Architectural Narrative Content');
    expect(out).toContain('Some narrative.');
    // The separator before the next section is preserved.
    expect(out).toContain('\n---\n# code-conventions/SKILL.md Content');
  });

  it('round-trips through the section extractor used by Phase 4', () => {
    const corrected = '# my-api\n\n## File Placement Guide\n| A | B | C |';
    const out = spliceClaudeMdBody(BLOB, corrected) as string;
    expect(extractClaudeMdBody(out)).toBe(corrected);
  });

  it('returns null when the cheat-sheet header cannot be located', () => {
    expect(spliceClaudeMdBody('no headers here', 'x')).toBeNull();
  });

  it('handles a blob where the cheat-sheet is the only section', () => {
    const blob = '# CLAUDE.md Content\n\n# my-api\n\n## Tech Stack\n- FastAPI';
    const out = spliceClaudeMdBody(blob, '# my-api\n\nfixed') as string;
    expect(out).toContain('# CLAUDE.md Content');
    expect(extractClaudeMdBody(out)).toBe('# my-api\n\nfixed');
  });
});

describe('normalizeVerifierOutput', () => {
  it('strips a wrapping markdown code fence', () => {
    expect(normalizeVerifierOutput('```markdown\n# my-api\n\ntext\n```')).toBe('# my-api\n\ntext');
  });

  it('strips a mistakenly re-emitted section header line', () => {
    expect(normalizeVerifierOutput('# CLAUDE.md Content\n\n# my-api\n\ntext')).toBe(
      '# my-api\n\ntext',
    );
  });

  it('leaves clean output untouched', () => {
    expect(normalizeVerifierOutput('# my-api\n\ntext')).toBe('# my-api\n\ntext');
  });

  it('strips a leading explanation preamble before the project heading', () => {
    const raw =
      'All path claims are valid. In the Services & Ports table, `cm-ai-api` is an alias ' +
      'for the real docker service `api` (both on port 8000). Dropping the two alias rows.\n\n' +
      '# cm-ai-api\n\n## Tech Stack\n- FastAPI';
    expect(normalizeVerifierOutput(raw)).toBe('# cm-ai-api\n\n## Tech Stack\n- FastAPI');
  });

  it('strips preamble AND a re-emitted wrapper header, leaving only the body', () => {
    const raw =
      'Here is the corrected file:\n\n# CLAUDE.md Content\n\n# cm-ai-api\n\n## Tech Stack\n- FastAPI';
    expect(normalizeVerifierOutput(raw)).toBe('# cm-ai-api\n\n## Tech Stack\n- FastAPI');
  });

  it('does not mistake a level-2 heading for the project heading', () => {
    const raw = 'Summary of changes.\n\n## Not the title\n\n# real-title\n\nbody';
    expect(normalizeVerifierOutput(raw)).toBe('# real-title\n\nbody');
  });

  it('returns prose unchanged when there is no top-level heading (so validation rejects it)', () => {
    const raw = 'All path claims are valid. Nothing to change.';
    expect(normalizeVerifierOutput(raw)).toBe('All path claims are valid. Nothing to change.');
  });
});
