import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = join(__dirname, '../../../..');

function read(relPath: string): string {
  const abs = join(REPO_ROOT, relPath);
  if (!existsSync(abs)) {
    throw new Error(`fixture missing: ${abs}`);
  }
  return readFileSync(abs, 'utf-8');
}

const PR_REVIEWER_CLAUDE = read('skills/030-quality-assurance/pr-reviewer/SKILL.claude.md');
const PR_REVIEWER_CODEX = read('skills/030-quality-assurance/pr-reviewer/SKILL.codex.md');
const SECURITY_REVIEW_CLAUDE = read('skills/030-quality-assurance/security-review/SKILL.claude.md');
const SECURITY_REVIEW_CODEX = read('skills/030-quality-assurance/security-review/SKILL.codex.md');
const WIKI_REFRESH = read('skills/020-development-workflow/wiki-refresh/SKILL.md');
const WIKI_INGEST_CLAUDE = read(
  'skills/020-development-workflow/wiki-ingest-external-docs/SKILL.claude.md',
);
const WIKI_INGEST_CODEX = read(
  'skills/020-development-workflow/wiki-ingest-external-docs/SKILL.codex.md',
);
const IMPLEMENT_TICKET_CLAUDE = read(
  'skills/020-development-workflow/implement-ticket/SKILL.claude.md',
);
const IMPLEMENT_TICKET_CODEX = read(
  'skills/020-development-workflow/implement-ticket/SKILL.codex.md',
);
const SKILLS_CONFIG = read('skills/skills.config.json');

describe('skills.config.json registry', () => {
  it('parses as valid JSON', () => {
    expect(() => JSON.parse(SKILLS_CONFIG)).not.toThrow();
  });

  it('does not contain the wiki-lint ghost', () => {
    expect(SKILLS_CONFIG).not.toMatch(/"name":\s*"wiki-lint"/);
  });

  it('does not contain a mastering-javascript or bare nextjs entry', () => {
    expect(SKILLS_CONFIG).not.toMatch(/"name":\s*"mastering-javascript"/);
    expect(SKILLS_CONFIG).not.toMatch(/"name":\s*"nextjs"/);
  });

  it('registers repo-fanout-pr at 020-development-workflow', () => {
    const parsed = JSON.parse(SKILLS_CONFIG) as { skills: Array<{ name: string; path: string }> };
    const entry = parsed.skills.find((s) => s.name === 'repo-fanout-pr');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('020-development-workflow/repo-fanout-pr');
  });

  it('registers wiki-add-service at 020-development-workflow', () => {
    const parsed = JSON.parse(SKILLS_CONFIG) as { skills: Array<{ name: string; path: string }> };
    const entry = parsed.skills.find((s) => s.name === 'wiki-add-service');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('020-development-workflow/wiki-add-service');
  });
});

describe('pr-reviewer multi-repo contract', () => {
  for (const [variant, body] of [
    ['SKILL.claude.md', PR_REVIEWER_CLAUDE],
    ['SKILL.codex.md', PR_REVIEWER_CODEX],
  ] as const) {
    describe(variant, () => {
      it('contains no banned version strings', () => {
        expect(body).not.toMatch(
          /\bV1\b|\bV2\b|Migration Notice|What.s New|backward compatibility/,
        );
      });

      it('documents the --repos flag', () => {
        expect(body).toMatch(/--repos/);
      });

      it('documents the --aggregate flag', () => {
        expect(body).toMatch(/--aggregate/);
      });

      it('references cross-repo-summary output', () => {
        expect(body).toMatch(/cross-repo-summary/);
      });

      it('references review-results.json', () => {
        expect(body).toMatch(/review-results\.json/);
      });

      it('references the deterministic glue scripts (fetch_pr_data, generate_review_files, add_inline_comment)', () => {
        expect(body).toMatch(/fetch_pr_data\.py/);
        expect(body).toMatch(/generate_review_files\.py/);
        expect(body).toMatch(/add_inline_comment\.py/);
      });

      it('does not reference the deleted TypeScript orchestrator', () => {
        expect(body).not.toMatch(/review-loop-orchestrator|review-loop\.service\.ts/);
      });
    });
  }
});

describe('security-review multi-repo contract', () => {
  for (const [variant, body] of [
    ['SKILL.claude.md', SECURITY_REVIEW_CLAUDE],
    ['SKILL.codex.md', SECURITY_REVIEW_CODEX],
  ] as const) {
    describe(variant, () => {
      it('contains no banned version strings', () => {
        expect(body).not.toMatch(
          /\bV1\b|\bV2\b|Migration Notice|What.s New|backward compatibility/,
        );
      });

      it('documents the --repos flag', () => {
        expect(body).toMatch(/--repos/);
      });

      it('documents the --baseline flag', () => {
        expect(body).toMatch(/--baseline/);
      });

      it('documents the --aggregate flag', () => {
        expect(body).toMatch(/--aggregate/);
      });

      it('emits SARIF as the machine output', () => {
        expect(body.toLowerCase()).toMatch(/sarif/);
      });

      it('mentions OWASP Top 10', () => {
        expect(body).toMatch(/OWASP/);
      });

      for (const lang of ['python', 'typescript', 'go', 'java', 'ruby', 'rust', 'php']) {
        it(`covers ${lang} via scanner table or detection logic`, () => {
          expect(body.toLowerCase()).toMatch(new RegExp(lang));
        });
      }

      it('does not call /scripts/security-check.sh at repo root', () => {
        expect(body).not.toMatch(/scripts\/security-check\.sh/);
      });
    });
  }
});

describe('wiki-refresh Phase 3.5 (external-docs ingestion bridge)', () => {
  it('documents Phase 3.5 ingesting external-doc manifest', () => {
    expect(WIKI_REFRESH).toMatch(/Phase 3\.5|external_docs|external-doc/);
  });

  it('mentions manifest.json as input to the evidence pack', () => {
    expect(WIKI_REFRESH).toMatch(/manifest\.json/);
  });

  it('bumps to version 2.3.0 or later', () => {
    const match = WIKI_REFRESH.match(/version:\s*(\d+)\.(\d+)\.(\d+)/);
    expect(match).not.toBeNull();
    if (match) {
      const [major, minor] = [parseInt(match[1]!, 10), parseInt(match[2]!, 10)];
      expect(major).toBeGreaterThanOrEqual(2);
      if (major === 2) expect(minor).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('wiki-ingest-external-docs Karpathy contract', () => {
  for (const [variant, body] of [
    ['SKILL.claude.md', WIKI_INGEST_CLAUDE],
    ['SKILL.codex.md', WIKI_INGEST_CODEX],
  ] as const) {
    describe(variant, () => {
      it('contains no banned version strings', () => {
        expect(body).not.toMatch(/\bV1\b|\bV2\b/);
      });

      it('documents the --global flag for cross-repo / shared external docs', () => {
        expect(body).toMatch(/--global/);
      });

      it('mentions content-addressed staging via sha256', () => {
        expect(body.toLowerCase()).toMatch(/sha256|content-addressed/);
      });

      it('mentions the Karpathy LLM-Wiki pattern', () => {
        expect(body.toLowerCase()).toMatch(/karpathy|llm[- ]wiki/);
      });

      it('lists at least three required frontmatter fields for staged pages', () => {
        for (const field of ['source_uri', 'content_sha256', 'ingested_at']) {
          expect(body).toMatch(new RegExp(field));
        }
      });

      it('checks the wiki.cache_external flag from framework-config.json', () => {
        expect(body).toMatch(/cache_external/);
      });
    });
  }
});

describe('implement-ticket Phase 10 wiring', () => {
  for (const [variant, body] of [
    ['SKILL.claude.md', IMPLEMENT_TICKET_CLAUDE],
    ['SKILL.codex.md', IMPLEMENT_TICKET_CODEX],
  ] as const) {
    describe(variant, () => {
      it('passes --pr-url and --jira-key to /pr-reviewer', () => {
        expect(body).toMatch(/\/pr-reviewer[^`]*--pr-url/);
        expect(body).toMatch(/\/pr-reviewer[^`]*--jira-key/);
      });

      it('passes --pr-url and --jira-key to /security-review', () => {
        expect(body).toMatch(/\/security-review[^`]*--pr-url/);
        expect(body).toMatch(/\/security-review[^`]*--jira-key/);
      });

      it('documents the multi-repo aggregator pass for both review skills', () => {
        expect(body).toMatch(/\/pr-reviewer --aggregate/);
        expect(body).toMatch(/\/security-review --aggregate/);
      });

      it('documents the --repos flag forwarding from /repo-fanout-pr', () => {
        expect(body).toMatch(/--repos/);
      });
    });
  }
});

describe('JSON schema round-trip with concrete examples', () => {
  it('the review-results example documented in pr-reviewer SKILL.claude.md parses', async () => {
    const { ReviewResultsSchema } = await import('../../../src/schemas/quality-review.schema.js');
    const example = {
      jiraKey: 'PROJ-1',
      prUrl: 'https://github.com/acme/api/pull/1',
      prNumber: 1,
      reviewIteration: 1,
      timestamp: new Date().toISOString(),
      overallStatus: 'APPROVED' as const,
      summary: 'No findings.',
      repository: { owner: 'acme', name: 'api', path: '/abs/api' },
      prMetadata: {
        commitSha: 'sha',
        baseRef: 'main',
        headRef: 'feature/x',
        linesChanged: 0,
        filesChanged: 0,
      },
      findings: { blocking: [], major: [], minor: [] },
      metrics: {
        totalFindings: 0,
        blockingCount: 0,
        majorCount: 0,
        minorCount: 0,
        filesReviewed: 0,
        linesChanged: 0,
      },
      tokenUsage: { input: 1, output: 1 },
      recommendations: [],
      nextSteps: { action: 'APPROVE' as const, reason: 'Clean.' },
    };
    expect(() => ReviewResultsSchema.parse(example)).not.toThrow();
  });

  it('the security-results example documented in security-review SKILL.claude.md parses', async () => {
    const { SecurityResultsSchema } = await import('../../../src/schemas/quality-review.schema.js');
    const example = {
      jiraKey: 'PROJ-1',
      timestamp: new Date().toISOString(),
      languages: ['typescript'],
      overallStatus: 'PASS' as const,
      summary: 'No findings.',
      repository: { owner: 'acme', name: 'api', path: '/abs/api' },
      sarifPath: 'sarif.json',
      scannerVersions: { semgrep: '1.0.0' },
      findings: { blocking: [], major: [], minor: [] },
      metrics: {
        totalFindings: 0,
        blockingCount: 0,
        majorCount: 0,
        minorCount: 0,
        secretsFound: 0,
        filesScanned: 0,
        linesScanned: 0,
      },
      scannerResults: {},
      owaspCompliance: { A05: 'PASS' as const },
      recommendations: [],
      nextSteps: { action: 'PASS' as const, reason: 'Clean.' },
    };
    expect(() => SecurityResultsSchema.parse(example)).not.toThrow();
  });
});
