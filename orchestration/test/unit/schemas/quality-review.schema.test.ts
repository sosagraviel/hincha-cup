import { describe, it, expect } from 'vitest';
import {
  ReviewResultsSchema,
  SecurityResultsSchema,
  PrCrossRepoSummarySchema,
  SecurityCrossRepoSummarySchema,
  FindingSchema,
  FixInstructionSchema,
} from '../../../src/schemas/quality-review.schema.js';

const baseFinding = {
  id: 'SEC-001',
  category: 'Security',
  severity: 'blocking' as const,
  issue: 'SQL injection in login handler',
  file: 'src/auth/login.ts',
  line: 142,
  details: 'User input is interpolated into the SQL string without parameterization.',
  codeSnippet: "db.query(`SELECT * FROM users WHERE email='${email}'`);",
  fixInstructions: {
    action: 'replace' as const,
    file: 'src/auth/login.ts',
    line: 142,
    oldCode: "db.query(`SELECT * FROM users WHERE email='${email}'`);",
    newCode: 'db.query("SELECT * FROM users WHERE email = $1", [email]);',
    explanation: 'Use parameterized query to prevent SQL injection.',
  },
  testSuggestion: "Add a test that submits email containing ' OR 1=1 --.",
  references: ['https://owasp.org/Top10/A03_2021-Injection/'],
};

const validReviewResults = {
  jiraKey: 'PROJ-123',
  prUrl: 'https://github.com/acme/api/pull/42',
  prNumber: 42,
  reviewIteration: 1,
  timestamp: '2026-05-14T13:00:00.000Z',
  overallStatus: 'CHANGES_REQUESTED' as const,
  summary: 'One blocking SQL injection finding.',
  repository: { owner: 'acme', name: 'api', path: '/abs/path/api' },
  prMetadata: {
    commitSha: 'abc123def456',
    baseRef: 'development',
    headRef: 'feature/PROJ-123-foo',
    linesChanged: 87,
    filesChanged: 5,
  },
  findings: {
    blocking: [baseFinding],
    major: [],
    minor: [],
  },
  metrics: {
    totalFindings: 1,
    blockingCount: 1,
    majorCount: 0,
    minorCount: 0,
    filesReviewed: 5,
    linesChanged: 87,
  },
  tokenUsage: {
    input: 12000,
    output: 850,
    cached_input: 9500,
    cache_creation: 0,
  },
  recommendations: ['Run /security-review for deeper SAST coverage.'],
  nextSteps: {
    action: 'TRIGGER_FIX_ITERATION' as const,
    reason: 'Blocking finding present.',
    maxIterations: 3,
    currentIteration: 1,
  },
};

describe('FixInstructionSchema', () => {
  it('parses a valid fix instruction', () => {
    expect(() =>
      FixInstructionSchema.parse(validReviewResults.findings.blocking[0]!.fixInstructions),
    ).not.toThrow();
  });

  it('rejects an invalid action verb', () => {
    expect(() =>
      FixInstructionSchema.parse({
        ...validReviewResults.findings.blocking[0]!.fixInstructions,
        action: 'rewrite',
      }),
    ).toThrow();
  });
});

describe('FindingSchema', () => {
  it('parses a valid finding', () => {
    expect(() => FindingSchema.parse(baseFinding)).not.toThrow();
  });

  it('accepts a file-level finding with line === null', () => {
    expect(() =>
      FindingSchema.parse({
        ...baseFinding,
        line: null,
        codeSnippet: null,
        testSuggestion: null,
      }),
    ).not.toThrow();
  });

  it('rejects an invalid severity', () => {
    expect(() => FindingSchema.parse({ ...baseFinding, severity: 'critical' })).toThrow();
  });
});

describe('ReviewResultsSchema', () => {
  it('parses a full review result', () => {
    expect(() => ReviewResultsSchema.parse(validReviewResults)).not.toThrow();
  });

  it('rejects when overallStatus is unknown', () => {
    expect(() =>
      ReviewResultsSchema.parse({
        ...validReviewResults,
        overallStatus: 'BLOCKED',
      }),
    ).toThrow();
  });

  it('rejects when nextSteps.action is unknown', () => {
    expect(() =>
      ReviewResultsSchema.parse({
        ...validReviewResults,
        nextSteps: { action: 'MERGE', reason: 'good to go' },
      }),
    ).toThrow();
  });

  it('rejects when tokenUsage is missing', () => {
    const { tokenUsage: _tokenUsage, ...rest } = validReviewResults;
    expect(() => ReviewResultsSchema.parse(rest)).toThrow();
  });

  it('defaults cached_input and cache_creation to 0', () => {
    const parsed = ReviewResultsSchema.parse({
      ...validReviewResults,
      tokenUsage: { input: 1, output: 1 },
    });
    expect(parsed.tokenUsage.cached_input).toBe(0);
    expect(parsed.tokenUsage.cache_creation).toBe(0);
  });
});

describe('SecurityResultsSchema', () => {
  const validSecurity = {
    jiraKey: 'PROJ-123',
    timestamp: '2026-05-14T13:00:00.000Z',
    languages: ['typescript', 'python'],
    overallStatus: 'FAIL' as const,
    summary: 'One blocking finding from semgrep.',
    repository: { owner: 'acme', name: 'api', path: '/abs/path/api' },
    sarifPath: 'sarif.json',
    scannerVersions: { semgrep: '1.105.0', gitleaks: '8.21.0' },
    findings: {
      blocking: [baseFinding],
      major: [],
      minor: [],
    },
    metrics: {
      totalFindings: 1,
      blockingCount: 1,
      majorCount: 0,
      minorCount: 0,
      secretsFound: 0,
      filesScanned: 124,
      linesScanned: 18450,
    },
    scannerResults: { semgrep: { findings: 1 } },
    owaspCompliance: { A05: 'CRITICAL' as const, A03: 'PASS' as const },
    recommendations: ['Apply parameterized query.'],
    nextSteps: {
      action: 'TRIGGER_REVIEW_LOOP' as const,
      reason: 'Blocking SQLi finding.',
      blockingIssueIds: ['SEC-001'],
    },
  };

  it('parses a full security result', () => {
    expect(() => SecurityResultsSchema.parse(validSecurity)).not.toThrow();
  });

  it('rejects when languages is missing', () => {
    const { languages: _languages, ...rest } = validSecurity;
    expect(() => SecurityResultsSchema.parse(rest)).toThrow();
  });

  it('rejects an OWASP key outside A01-A10', () => {
    expect(() =>
      SecurityResultsSchema.parse({
        ...validSecurity,
        owaspCompliance: { A99: 'PASS' },
      }),
    ).toThrow();
  });
});

describe('PrCrossRepoSummarySchema', () => {
  it('parses a multi-repo summary', () => {
    expect(() =>
      PrCrossRepoSummarySchema.parse({
        ticketId: 'PROJ-123',
        prs: [
          {
            repo: 'api',
            url: 'https://github.com/acme/api/pull/42',
            blockingCount: 1,
            majorCount: 0,
            minorCount: 0,
            overallStatus: 'CHANGES_REQUESTED',
          },
          {
            repo: 'web',
            url: 'https://github.com/acme/web/pull/17',
            blockingCount: 0,
            majorCount: 0,
            minorCount: 2,
            overallStatus: 'COMMENTED',
          },
        ],
        crossRepoConcerns: [
          {
            kind: 'api-contract-mismatch',
            summary: 'web/types/User.ts expects field `displayName`; api/User does not emit it.',
            evidence: [
              { repo: 'web', file: 'types/User.ts', line: 12 },
              { repo: 'api', file: 'src/user.ts', line: 88 },
            ],
            recommendation: 'Add displayName to api UserResponse or remove from web.',
          },
        ],
        mergeOrder: ['api', 'web'],
      }),
    ).not.toThrow();
  });

  it('accepts empty mergeOrder when ordering does not matter', () => {
    expect(() =>
      PrCrossRepoSummarySchema.parse({
        ticketId: 'PROJ-123',
        prs: [],
        crossRepoConcerns: [],
        mergeOrder: [],
      }),
    ).not.toThrow();
  });
});

describe('SecurityCrossRepoSummarySchema', () => {
  it('parses a multi-repo security summary', () => {
    expect(() =>
      SecurityCrossRepoSummarySchema.parse({
        ticketId: 'PROJ-123',
        repos: [
          {
            repo: 'api',
            blockingCount: 1,
            majorCount: 0,
            minorCount: 0,
            sarifPath: 'security/api/sarif.json',
            overallStatus: 'FAIL',
          },
        ],
        crossCuttingConcerns: [
          {
            kind: 'shared-dep-cve',
            summary: 'lodash@4.17.20 has CVE-2026-XXXX; appears in both api and web lockfiles.',
            evidence: [
              { repo: 'api', file: 'package-lock.json', line: null },
              { repo: 'web', file: 'pnpm-lock.yaml', line: null },
            ],
          },
        ],
        dependencyOrder: ['shared-lib', 'api', 'web'],
      }),
    ).not.toThrow();
  });
});
