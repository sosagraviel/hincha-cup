import { describe, expect, it } from 'vitest';
import {
  extractProvenanceTags,
  validateWikiOutput,
} from '../../../../../../src/nodes/initialize-project/phase4/wiki-generator/hooks/wiki-output-validator.js';

describe('validateWikiOutput — clean inputs', () => {
  it('passes a minimal valid page (heading + prose, no markers)', () => {
    const text = '# Architecture\n\nThe project is a monorepo with three services.';
    expect(validateWikiOutput(text)).toEqual([]);
  });

  it('passes a page using [[wikilinks]] (Karpathy convention)', () => {
    const text =
      '# Service: backend\n\nThe backend exposes a REST API. See [[ARCHITECTURE]] for the service map and [[DATA-FLOWS]] for request lifecycles.';
    expect(validateWikiOutput(text)).toEqual([]);
  });

  it('passes a page using `(not determined by analysis)` for gaps', () => {
    const text =
      '# Service: legacy\n\nThe legacy service runs on (not determined by analysis). Persistence layer: (not determined by analysis).';
    expect(validateWikiOutput(text)).toEqual([]);
  });
});

describe('validateWikiOutput — Rule 1: must start with heading, no frontmatter', () => {
  it('rejects YAML frontmatter at the top', () => {
    const text = '---\ntitle: x\n---\n\n# After frontmatter';
    const violations = validateWikiOutput(text);
    expect(violations.some((v) => v.includes('frontmatter delimiter'))).toBe(true);
  });

  it('rejects prose as the first non-blank line', () => {
    const text = 'Just some prose.\n\nNo heading here.';
    const violations = validateWikiOutput(text);
    expect(violations.some((v) => v.includes('level-1 markdown heading'))).toBe(true);
  });

  it('rejects a code-fence opener as the first non-blank line', () => {
    const text = '```\ncode\n```\n# Heading after fence';
    const violations = validateWikiOutput(text);
    expect(violations.some((v) => v.includes('level-1 markdown heading'))).toBe(true);
  });

  it('rejects empty / whitespace-only output', () => {
    expect(validateWikiOutput('').some((v) => v.includes('Empty wiki output'))).toBe(true);
    expect(validateWikiOutput('   \n\n   ').some((v) => v.includes('Empty wiki output'))).toBe(
      true,
    );
  });
});

describe('validateWikiOutput — Rule 2: NO inline ^[id] markers (any prefix, any kind)', () => {
  // The full grid: every prefix that the OLD contract used to allow must
  // now be rejected. Plus arbitrary tags. Plus consolidator-id refs.
  const oldAllowedTags = [
    '^[analyzer:tech_stack_dependencies]',
    '^[analyzer:structure-architecture]',
    '^[synthesis]',
    '^[claude-md]',
    '^[project-context]',
    '^[inferred]',
    '^[ambiguous]',
  ];

  for (const marker of oldAllowedTags) {
    it(`rejects ${marker} (formerly allowed; now FORBIDDEN)`, () => {
      const text = `# Page\n\nThe project uses NestJS ${marker} on the backend.`;
      const violations = validateWikiOutput(text);
      expect(violations.some((v) => v.includes('inline `^[...]` citation markers'))).toBe(true);
    });
  }

  it('rejects unknown / arbitrary `^[...]` tags', () => {
    const text = '# Page\n\nClaim ^[whatever] and another ^[v1] marker.';
    const violations = validateWikiOutput(text);
    expect(violations.some((v) => v.includes('inline `^[...]` citation markers'))).toBe(true);
  });

  it('reports up to 8 example markers in the violation message', () => {
    const tags = Array.from({ length: 12 }, (_, i) => `^[analyzer:tag${i}]`);
    const text = `# Page\n\n${tags.join(' ')}`;
    const violations = validateWikiOutput(text);
    const ruleMessage = violations.find((v) => v.includes('inline `^[...]`'))!;
    expect(ruleMessage).toContain('… and 4 more');
  });

  it('does NOT false-positive on `^[...]` inside fenced code blocks (legitimate examples)', () => {
    const text = [
      '# How not to write footnotes',
      '',
      'Bad example below uses inline citations (not allowed in real pages):',
      '',
      '```markdown',
      'NestJS is the framework ^[analyzer:tech_stack_dependencies].',
      '```',
      '',
      'Use `[[wikilinks]]` instead.',
    ].join('\n');
    expect(validateWikiOutput(text)).toEqual([]);
  });

  it('points the agent at the right replacement (wikilinks / not-determined)', () => {
    const text = '# Page\n\nClaim ^[synthesis].';
    const violations = validateWikiOutput(text);
    const ruleMessage = violations.find((v) => v.includes('inline `^[...]`'))!;
    // The fix message must mention both replacements so the agent knows
    // what to do next.
    expect(ruleMessage).toContain('[[wikilinks]]');
    expect(ruleMessage).toContain('(not determined by analysis)');
    expect(ruleMessage).toContain('YAML frontmatter');
  });
});

describe('validateWikiOutput — Rule 3: framework jargon (preserved from earlier work)', () => {
  it('rejects "automated run"', () => {
    const text = '# Page\n\nThe community tool overflowed during the automated run.';
    const violations = validateWikiOutput(text);
    expect(violations.some((v) => v.includes('framework-internal phrasing'))).toBe(true);
  });

  it('rejects "exceeded token limit" anywhere in the body', () => {
    const text = '# Page\n\nThe call exceeded token limit and was truncated.';
    const violations = validateWikiOutput(text);
    expect(violations.some((v) => v.includes('framework-internal phrasing'))).toBe(true);
  });
});

describe('validateWikiOutput — Rule 4: no trailing meta-sections', () => {
  // A `## Verification Notes` trailing section was once found in
  // ARCHITECTURE.md. The wiki is GROUND TRUTH; meta sections that
  // describe the wiki's own confidence belong in `.state.json`, not in
  // user-facing prose. This rule blocks all known shapes of the leak.
  const FORBIDDEN_HEADINGS = [
    '## Verification',
    '## Verification Notes',
    '## Caveats',
    '## Assumptions',
    '## Limitations',
    '## Known Issues',
    '## Notes',
    '## Disclaimer',
    '## TODO',
  ] as const;

  for (const heading of FORBIDDEN_HEADINGS) {
    it(`rejects a trailing \`${heading}\` heading`, () => {
      const text = [
        '# Service: api',
        '',
        'Body content.',
        '',
        heading,
        '',
        '- The backend file count is unverified.',
      ].join('\n');
      const violations = validateWikiOutput(text);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => /forbidden trailing meta-section/i.test(v))).toBe(true);
    });
  }

  it('match is case-insensitive (catches `## verification` as well)', () => {
    const text = ['# H', '', 'body', '', '## verification', '- unverified fact'].join('\n');
    expect(validateWikiOutput(text).length).toBeGreaterThan(0);
  });

  it('allows the body of a section to mention the word "verification" (only the heading is forbidden)', () => {
    const text = [
      '# Service: api',
      '',
      'The service uses JWT verification at the gateway. (See [[auth]].)',
    ].join('\n');
    expect(validateWikiOutput(text)).toEqual([]);
  });

  it('points the agent at .state.json + (not determined by analysis) replacement', () => {
    const text = ['# H', '', 'body', '', '## Verification Notes', '', '- Unverified.'].join('\n');
    const violations = validateWikiOutput(text);
    const meta = violations.find((v) => /forbidden trailing meta-section/i.test(v));
    expect(meta).toBeDefined();
    expect(meta).toContain('.state.json');
    expect(meta).toContain('(not determined by analysis)');
  });

  it('reports up to 6 example headings in the violation message', () => {
    const lines = ['# H', ''];
    for (const heading of [
      '## Verification',
      '## Caveats',
      '## Assumptions',
      '## Limitations',
      '## Known Issues',
      '## Notes',
      '## Disclaimer',
    ]) {
      lines.push(heading, 'body', '');
    }
    const violations = validateWikiOutput(lines.join('\n'));
    const meta = violations.find((v) => /forbidden trailing meta-section/i.test(v));
    expect(meta).toMatch(/and \d+ more/);
  });
});

describe('validateWikiOutput — combinations', () => {
  it('reports all rule violations simultaneously', () => {
    const text = '---\nbad: frontmatter\n---\n\nExceeded token limit ^[analyzer:foo].';
    const violations = validateWikiOutput(text);
    // 3 distinct violations: frontmatter, ^[id], jargon.
    expect(violations.length).toBe(3);
  });

  it('returns an empty array on a fully clean page', () => {
    const text = [
      '# Service: api',
      '',
      'The api service is a Node.js HTTP server. See [[ARCHITECTURE]] for context.',
      '',
      '## Endpoints',
      '',
      'The full endpoint catalog is (not determined by analysis).',
    ].join('\n');
    expect(validateWikiOutput(text)).toEqual([]);
  });
});

describe('extractProvenanceTags', () => {
  it('returns line numbers (1-indexed) for each tag', () => {
    const text = ['# H', '', 'line 3 has ^[a].', 'line 4 has ^[b].'].join('\n');
    const tags = extractProvenanceTags(text);
    expect(tags).toEqual([
      { tag: 'a', line: 3 },
      { tag: 'b', line: 4 },
    ]);
  });

  it('skips fenced blocks', () => {
    const text = ['# H', '```', '^[skip-me]', '```', 'real ^[hit]'].join('\n');
    const tags = extractProvenanceTags(text);
    expect(tags).toEqual([{ tag: 'hit', line: 5 }]);
  });
});
