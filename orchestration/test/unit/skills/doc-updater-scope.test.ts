import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const SKILL_CLAUDE_PATH = join(
  __dirname,
  '../../../../skills/030-quality-assurance/doc-updater/SKILL.claude.md',
);

const SKILL_CODEX_PATH = join(
  __dirname,
  '../../../../skills/030-quality-assurance/doc-updater/SKILL.codex.md',
);

const IN_SCOPE_TARGETS = [
  '{{INSTRUCTION_FILE}}',
  'code-conventions',
  'multi-file-workflows',
  'testing-conventions',
];

const OUT_OF_SCOPE_DEFERRALS = ['docs/llm-wiki/**', '/wiki-refresh', 'ensure-context.sh'];

const FORBIDDEN_LIST_ENTRIES = ['docs/llm-wiki/**', 'README', 'package.json'];

const BINARY_RUBRIC_CLAUSES = ['(a)', '(b)', '(c)'];

describe('SKILL.claude.md — scope contract', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(SKILL_CLAUDE_PATH, 'utf-8');
  });

  describe('In scope section', () => {
    it('contains the "Responsibilities and non-responsibilities" section header', () => {
      expect(content).toContain('## Responsibilities and non-responsibilities');
    });

    it('contains the "In scope" subsection header', () => {
      expect(content).toContain('### In scope');
    });

    it.each(IN_SCOPE_TARGETS)('lists "%s" as an in-scope target', (target) => {
      const inScopeSection = content.slice(
        content.indexOf('### In scope'),
        content.indexOf('### Out of scope'),
      );
      expect(inScopeSection).toContain(target);
    });

    it('lists exactly four in-scope targets', () => {
      const inScopeSection = content.slice(
        content.indexOf('### In scope'),
        content.indexOf('### Out of scope'),
      );
      const numberedItems = inScopeSection.match(/^\d+\.\s+/gm);
      expect(numberedItems).toHaveLength(4);
    });
  });

  describe('Out of scope section', () => {
    it('contains the "Out of scope" subsection header', () => {
      expect(content).toContain('### Out of scope');
    });

    it.each(OUT_OF_SCOPE_DEFERRALS)('documents "%s" as an out-of-scope deferral', (deferral) => {
      const outOfScopeSection = content.slice(
        content.indexOf('### Out of scope'),
        content.indexOf('## CRITICAL: Role prompt'),
      );
      expect(outOfScopeSection).toContain(deferral);
    });

    it('lists exactly three out-of-scope deferrals in the table (excluding header)', () => {
      const outOfScopeSection = content.slice(
        content.indexOf('### Out of scope'),
        content.indexOf('## CRITICAL: Role prompt'),
      );
      const tableRows = outOfScopeSection.match(/^\|[^-|][^|]+\|/gm) ?? [];
      const dataRows = tableRows.filter((row) => !row.startsWith('| What'));
      expect(dataRows).toHaveLength(3);
    });
  });

  describe('FORBIDDEN list in role prompt', () => {
    it('contains the CRITICAL role prompt block', () => {
      expect(content).toContain('CRITICAL: This agent updates PRESCRIPTIVE rules only.');
    });

    it('contains the FORBIDDEN keyword', () => {
      expect(content).toContain('FORBIDDEN:');
    });

    it.each(FORBIDDEN_LIST_ENTRIES)('explicitly forbids "%s"', (entry) => {
      const criticalBlock = content.slice(
        content.indexOf('CRITICAL: This agent updates PRESCRIPTIVE rules only.'),
        content.indexOf('## Binary qualification rubric'),
      );
      expect(criticalBlock).toContain(entry);
    });

    it('instructs refusal with redirect to /wiki-refresh', () => {
      const criticalBlock = content.slice(
        content.indexOf('CRITICAL: This agent updates PRESCRIPTIVE rules only.'),
        content.indexOf('## Binary qualification rubric'),
      );
      expect(criticalBlock).toContain('/wiki-refresh');
      expect(criticalBlock).toMatch(/refuse|descriptive/i);
    });
  });

  describe('Binary qualification rubric', () => {
    it('contains the "Binary qualification rubric" section', () => {
      expect(content).toContain('## Binary qualification rubric');
    });

    it.each(BINARY_RUBRIC_CLAUSES)('documents rubric clause %s', (clause) => {
      const rubricSection = content.slice(
        content.indexOf('## Binary qualification rubric'),
        content.indexOf('## When to Use'),
      );
      expect(rubricSection).toContain(clause);
    });

    it('clause (a) is about file-placement rules', () => {
      const rubricSection = content.slice(
        content.indexOf('## Binary qualification rubric'),
        content.indexOf('## When to Use'),
      );
      expect(rubricSection).toMatch(/\(a\).*file.placement/i);
    });

    it('clause (b) is about workflows crossing ≥2 files', () => {
      const rubricSection = content.slice(
        content.indexOf('## Binary qualification rubric'),
        content.indexOf('## When to Use'),
      );
      expect(rubricSection).toMatch(/\(b\).*workflow|≥2 files/i);
    });

    it('clause (c) is about testing conventions reusable by future work', () => {
      const rubricSection = content.slice(
        content.indexOf('## Binary qualification rubric'),
        content.indexOf('## When to Use'),
      );
      expect(rubricSection).toMatch(/\(c\).*testing convention|reusable by future/i);
    });

    it('states that anything else is descriptive or one-off', () => {
      const rubricSection = content.slice(
        content.indexOf('## Binary qualification rubric'),
        content.indexOf('## When to Use'),
      );
      expect(rubricSection).toMatch(/descriptive|one-off/i);
    });
  });

  describe('wiki-refresh deferral is documented', () => {
    it('explicitly defers docs/llm-wiki/** to /wiki-refresh', () => {
      expect(content).toContain('/wiki-refresh');
      expect(content).toMatch(/docs\/llm-wiki[^"]+\/wiki-refresh/s);
    });

    it('mentions Phase 8.5 as the wiki-refresh invocation point', () => {
      expect(content).toContain('Phase 8.5');
    });
  });

  describe('No version language', () => {
    it('contains no V1/V2 labels', () => {
      expect(content).not.toMatch(/\bV1\b|\bV2\b/);
    });

    it('contains no "What\'s New" sections', () => {
      expect(content).not.toMatch(/What.s New/i);
    });

    it('contains no "previous version" references', () => {
      expect(content).not.toMatch(/previous version/i);
    });
  });

  describe('Frontmatter', () => {
    it('declares name: doc-updater', () => {
      expect(content).toContain('name: doc-updater');
    });

    it('declares version: 2.0.0', () => {
      expect(content).toContain('version: 2.0.0');
    });

    it('declares last-updated: 2026-05-14', () => {
      expect(content).toContain('last-updated: 2026-05-14');
    });
  });
});

describe('SKILL.codex.md — scope contract (semantic symmetry)', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(SKILL_CODEX_PATH, 'utf-8');
  });

  describe('In scope section', () => {
    it('contains the "Responsibilities and non-responsibilities" section header', () => {
      expect(content).toContain('## Responsibilities and non-responsibilities');
    });

    it.each(IN_SCOPE_TARGETS)('lists "%s" as an in-scope target', (target) => {
      const inScopeSection = content.slice(
        content.indexOf('### In scope'),
        content.indexOf('### Out of scope'),
      );
      expect(inScopeSection).toContain(target);
    });

    it('lists exactly four in-scope targets', () => {
      const inScopeSection = content.slice(
        content.indexOf('### In scope'),
        content.indexOf('### Out of scope'),
      );
      const numberedItems = inScopeSection.match(/^\d+\.\s+/gm);
      expect(numberedItems).toHaveLength(4);
    });
  });

  describe('Out of scope section', () => {
    it.each(OUT_OF_SCOPE_DEFERRALS)('documents "%s" as an out-of-scope deferral', (deferral) => {
      const outOfScopeSection = content.slice(
        content.indexOf('### Out of scope'),
        content.indexOf('## CRITICAL: Role prompt'),
      );
      expect(outOfScopeSection).toContain(deferral);
    });

    it('lists exactly three out-of-scope deferrals in the table (excluding header)', () => {
      const outOfScopeSection = content.slice(
        content.indexOf('### Out of scope'),
        content.indexOf('## CRITICAL: Role prompt'),
      );
      const tableRows = outOfScopeSection.match(/^\|[^-|][^|]+\|/gm) ?? [];
      const dataRows = tableRows.filter((row) => !row.startsWith('| What'));
      expect(dataRows).toHaveLength(3);
    });
  });

  describe('FORBIDDEN list in role prompt', () => {
    it('contains the CRITICAL role prompt block', () => {
      expect(content).toContain('CRITICAL: This agent updates PRESCRIPTIVE rules only.');
    });

    it.each(FORBIDDEN_LIST_ENTRIES)('explicitly forbids "%s"', (entry) => {
      const criticalBlock = content.slice(
        content.indexOf('CRITICAL: This agent updates PRESCRIPTIVE rules only.'),
        content.indexOf('## Binary qualification rubric'),
      );
      expect(criticalBlock).toContain(entry);
    });
  });

  describe('Binary qualification rubric', () => {
    it('contains the "Binary qualification rubric" section', () => {
      expect(content).toContain('## Binary qualification rubric');
    });

    it.each(BINARY_RUBRIC_CLAUSES)('documents rubric clause %s', (clause) => {
      const rubricSection = content.slice(
        content.indexOf('## Binary qualification rubric'),
        content.indexOf('## When to Use'),
      );
      expect(rubricSection).toContain(clause);
    });
  });

  describe('Codex-specific mechanics', () => {
    it('uses $doc-updater invocation syntax (not /doc-updater)', () => {
      expect(content).toContain('$doc-updater');
    });

    it('references JSONL progress file instead of TaskCreate', () => {
      expect(content).toContain('doc-updater-progress.jsonl');
    });

    it('documents mcp__filesystem__ tool names', () => {
      expect(content).toContain('mcp__filesystem__');
    });

    it('documents codex --continue sub-agent spawning', () => {
      expect(content).toContain('codex --continue');
    });

    it('does not use TaskCreate as an invocation call (only as a contrast note in the preamble)', () => {
      const bodyAfterPreamble = content.slice(content.indexOf('## Responsibilities'));
      expect(bodyAfterPreamble).not.toContain('TaskCreate');
    });
  });

  describe('wiki-refresh deferral is documented', () => {
    it('explicitly defers docs/llm-wiki/** to /wiki-refresh', () => {
      expect(content).toContain('/wiki-refresh');
    });

    it('mentions Phase 8.5 as the wiki-refresh invocation point', () => {
      expect(content).toContain('Phase 8.5');
    });
  });

  describe('No version language', () => {
    it('contains no V1/V2 labels', () => {
      expect(content).not.toMatch(/\bV1\b|\bV2\b/);
    });

    it('contains no "What\'s New" sections', () => {
      expect(content).not.toMatch(/What.s New/i);
    });
  });

  describe('Frontmatter', () => {
    it('declares name: doc-updater', () => {
      expect(content).toContain('name: doc-updater');
    });

    it('declares version: 2.0.0', () => {
      expect(content).toContain('version: 2.0.0');
    });

    it('declares last-updated: 2026-05-14', () => {
      expect(content).toContain('last-updated: 2026-05-14');
    });
  });
});
