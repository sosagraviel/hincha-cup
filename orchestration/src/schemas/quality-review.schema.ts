/**
 * Quality-review schemas
 *
 * Shared Zod contracts emitted by the quality-assurance skills invoked from
 * `/implement-ticket` Phase 10: `/pr-reviewer` and `/security-review`. These
 * schemas are the source of truth for the JSON each skill writes to disk
 * under `.claude/artifacts/<JIRA_KEY>/{pr,security}/...`. The orchestrator
 * (implement-ticket) consumes them to decide whether to trigger a fix
 * iteration or proceed to cleanup.
 *
 * Single-repo invocations write one results file per skill. Multi-repo
 * invocations write per-repo files plus a `cross-repo-summary.json`
 * produced by the `--aggregate` pass. Aggregator output is shared between
 * the two skills (same shape, different `kind` enumeration).
 */

import { z } from 'zod';

const FixActionSchema = z.enum(['replace', 'add', 'delete', 'refactor']);

export const FixInstructionSchema = z.object({
  action: FixActionSchema,
  file: z.string(),
  line: z.number().int().nonnegative().optional(),
  insertAfterLine: z.number().int().nonnegative().optional(),
  oldCode: z.string().optional(),
  newCode: z.string().optional(),
  explanation: z.string(),
});

export const SeveritySchema = z.enum(['blocking', 'major', 'minor']);

export const FindingSchema = z.object({
  id: z.string(),
  category: z.string(),
  severity: SeveritySchema,
  issue: z.string(),
  file: z.string(),
  line: z.number().int().nonnegative().nullable(),
  details: z.string(),
  codeSnippet: z.string().nullable(),
  fixInstructions: FixInstructionSchema,
  testSuggestion: z.string().nullable(),
  references: z.array(z.string()).default([]),
});

export const RepositoryRefSchema = z.object({
  owner: z.string(),
  name: z.string(),
  path: z.string(),
});

export const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cached_input: z.number().int().nonnegative().default(0),
  cache_creation: z.number().int().nonnegative().default(0),
});

const FindingsBucketsSchema = z.object({
  blocking: z.array(FindingSchema),
  major: z.array(FindingSchema),
  minor: z.array(FindingSchema),
});

/**
 * `/pr-reviewer` per-PR output: `.claude/artifacts/<JIRA_KEY>/pr/review/review-results.json`
 * (single-repo) or `.claude/artifacts/<JIRA_KEY>/pr/<repo-basename>/review/review-results.json`
 * (multi-repo). Consumed by `/implement-ticket` Phase 10 to gate the fix
 * iteration loop.
 */
export const ReviewResultsSchema = z.object({
  jiraKey: z.string(),
  prUrl: z.string().url(),
  prNumber: z.number().int().positive(),
  reviewIteration: z.number().int().positive(),
  timestamp: z.string().datetime(),
  overallStatus: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']),
  summary: z.string(),
  repository: RepositoryRefSchema,
  prMetadata: z.object({
    commitSha: z.string(),
    baseRef: z.string(),
    headRef: z.string(),
    linesChanged: z.number().int().nonnegative(),
    filesChanged: z.number().int().nonnegative(),
  }),
  findings: FindingsBucketsSchema,
  metrics: z.object({
    totalFindings: z.number().int().nonnegative(),
    blockingCount: z.number().int().nonnegative(),
    majorCount: z.number().int().nonnegative(),
    minorCount: z.number().int().nonnegative(),
    filesReviewed: z.number().int().nonnegative(),
    linesChanged: z.number().int().nonnegative(),
  }),
  tokenUsage: TokenUsageSchema,
  recommendations: z.array(z.string()).default([]),
  nextSteps: z.object({
    action: z.enum(['APPROVE', 'TRIGGER_FIX_ITERATION', 'MANUAL_REVIEW']),
    reason: z.string(),
    maxIterations: z.number().int().positive().optional(),
    currentIteration: z.number().int().positive().optional(),
  }),
});

const OwaspCategorySchema = z.enum([
  'A01',
  'A02',
  'A03',
  'A04',
  'A05',
  'A06',
  'A07',
  'A08',
  'A09',
  'A10',
]);

/**
 * `/security-review` per-repo output: `.claude/artifacts/<JIRA_KEY>/security/security-results.json`
 * (single-repo) or `.claude/artifacts/<JIRA_KEY>/security/<repo-basename>/security-results.json`
 * (multi-repo). The SARIF file referenced by `sarifPath` is the source of
 * truth for downstream GitHub code-scanning integration.
 */
export const SecurityResultsSchema = z.object({
  jiraKey: z.string(),
  timestamp: z.string().datetime(),
  languages: z.array(z.string()),
  overallStatus: z.enum(['PASS', 'FAIL']),
  summary: z.string(),
  repository: RepositoryRefSchema,
  sarifPath: z.string(),
  scannerVersions: z.record(z.string(), z.string()),
  findings: FindingsBucketsSchema,
  metrics: z.object({
    totalFindings: z.number().int().nonnegative(),
    blockingCount: z.number().int().nonnegative(),
    majorCount: z.number().int().nonnegative(),
    minorCount: z.number().int().nonnegative(),
    secretsFound: z.number().int().nonnegative(),
    filesScanned: z.number().int().nonnegative(),
    linesScanned: z.number().int().nonnegative(),
  }),
  scannerResults: z.record(z.string(), z.unknown()),
  owaspCompliance: z.partialRecord(
    OwaspCategorySchema,
    z.enum(['PASS', 'WARN', 'CRITICAL', 'REVIEW']),
  ),
  recommendations: z.array(z.string()).default([]),
  nextSteps: z.object({
    action: z.enum(['PASS', 'TRIGGER_REVIEW_LOOP']),
    reason: z.string(),
    blockingIssueIds: z.array(z.string()).optional(),
  }),
});

const CrossRepoPrSummarySchema = z.object({
  repo: z.string(),
  url: z.string().url(),
  blockingCount: z.number().int().nonnegative(),
  majorCount: z.number().int().nonnegative(),
  minorCount: z.number().int().nonnegative(),
  overallStatus: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']),
});

const CrossRepoEvidenceSchema = z.object({
  repo: z.string(),
  file: z.string(),
  line: z.number().int().nonnegative().nullable(),
});

const CrossRepoConcernSchema = z.object({
  kind: z.string(),
  summary: z.string(),
  evidence: z.array(CrossRepoEvidenceSchema),
  recommendation: z.string().optional(),
});

/**
 * Output of `/pr-reviewer --aggregate --jira-key <KEY>` written to
 * `.claude/artifacts/<JIRA_KEY>/pr/cross-repo-summary.json`. Produced only
 * when more than one PR was reviewed under the same ticket.
 */
export const PrCrossRepoSummarySchema = z.object({
  ticketId: z.string(),
  prs: z.array(CrossRepoPrSummarySchema),
  crossRepoConcerns: z.array(CrossRepoConcernSchema),
  mergeOrder: z.array(z.string()),
});

const SecurityCrossRepoEntrySchema = z.object({
  repo: z.string(),
  blockingCount: z.number().int().nonnegative(),
  majorCount: z.number().int().nonnegative(),
  minorCount: z.number().int().nonnegative(),
  sarifPath: z.string(),
  overallStatus: z.enum(['PASS', 'FAIL']),
});

/**
 * Output of `/security-review --aggregate --jira-key <KEY>` written to
 * `.claude/artifacts/<JIRA_KEY>/security/cross-repo-summary.json`. Produced
 * only when more than one repo was scanned under the same ticket.
 */
export const SecurityCrossRepoSummarySchema = z.object({
  ticketId: z.string(),
  repos: z.array(SecurityCrossRepoEntrySchema),
  crossCuttingConcerns: z.array(CrossRepoConcernSchema),
  dependencyOrder: z.array(z.string()),
});

export type FixInstruction = z.infer<typeof FixInstructionSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type RepositoryRef = z.infer<typeof RepositoryRefSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ReviewResults = z.infer<typeof ReviewResultsSchema>;
export type SecurityResults = z.infer<typeof SecurityResultsSchema>;
export type PrCrossRepoSummary = z.infer<typeof PrCrossRepoSummarySchema>;
export type SecurityCrossRepoSummary = z.infer<typeof SecurityCrossRepoSummarySchema>;
