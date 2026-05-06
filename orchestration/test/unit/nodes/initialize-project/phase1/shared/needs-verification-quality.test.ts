import { describe, expect, it } from 'vitest';
import {
  hasAnyManifestVsImportMismatch,
  hasManifestVsImportMismatch,
  hasSpeculativeNeedsVerification,
  findSpeculativeNeedsVerification,
  validateNeedsVerificationProse,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/needs-verification-quality.js';

/**
 * Wave 2 Fix 4.3 — needs_verification quality gate.
 *
 * The 2026-05-04 gira run shipped speculative items the framework
 * rule explicitly excludes (credentials, outside-the-repo concerns,
 * manifest-derivable questions). The detector here surfaces a soft
 * warning when an analyzer emits any of those — non-blocking, but
 * trends visible in the run report.
 *
 * Stack-agnostic: each fixture uses generic ids and a question
 * shape that could come from any language family.
 */

describe('hasSpeculativeNeedsVerification — anti-regression on the gira-2026-05-04 items', () => {
  it('detects credential / DSN / secrets questions', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v1',
          question: 'What are the production Sentry DSN, org, and credentials?',
          reason: 'Credentials are not in the repository',
        },
      ]),
    ).toBe(true);
  });

  it('detects "configured outside this repository"', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v2',
          question: 'Is there a CI/CD pipeline configured outside this repository?',
          reason: 'Cannot determine from repo',
        },
      ]),
    ).toBe(true);
  });

  it('detects production deployment / infrastructure questions', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v3',
          question: 'What is the production deployment server URL?',
          reason: 'Not in repo',
        },
      ]),
    ).toBe(true);
  });

  it('detects "managed by another team" framing', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v4',
          question: 'Is the auth service managed by another team?',
          reason: 'Possibly outside scope',
        },
      ]),
    ).toBe(true);
  });

  it('does NOT fire on legitimate verification items', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v1',
          question: 'Is the Redis instance shared across services or per-service?',
          reason: 'Both services connect to Redis but configs do not specify isolation',
        },
        {
          id: 'v2',
          question: 'Should the legacy /api/v1 endpoints be included in documentation?',
          reason: 'Found deprecated endpoints still in the codebase',
        },
      ]),
    ).toBe(false);
  });

  it('does NOT fire on the canonical "good example" from verification-format.md', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v1',
          question: 'Is the Redis instance shared across services or per-service?',
          reason: 'Both services connect to Redis but connection configs do not specify isolation',
        },
      ]),
    ).toBe(false);
  });

  it('returns false on undefined / null / non-array input (defensive)', () => {
    expect(hasSpeculativeNeedsVerification(undefined)).toBe(false);
    expect(hasSpeculativeNeedsVerification(null)).toBe(false);
    expect(hasSpeculativeNeedsVerification('not-an-array')).toBe(false);
    expect(hasSpeculativeNeedsVerification({})).toBe(false);
  });

  it('returns false on empty array', () => {
    expect(hasSpeculativeNeedsVerification([])).toBe(false);
  });

  it('matches across question OR reason text (not both required)', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v1',
          // The question is innocuous; the reason mentions credentials.
          question: 'What is the auth setup?',
          reason: 'Could not find production credentials in repo.',
        },
      ]),
    ).toBe(true);
  });

  it('handles items missing question or reason (defensive)', () => {
    expect(
      hasSpeculativeNeedsVerification([
        { id: 'v1' }, // no question / reason
        { id: 'v2', question: 42 as never }, // wrong type
      ]),
    ).toBe(false);
  });
});

describe('findSpeculativeNeedsVerification — diagnostic mode', () => {
  it('returns the index + question + classification reason for each match', () => {
    const items = [
      {
        id: 'v1',
        question: 'Is the Redis instance shared?',
        reason: 'Configs are ambiguous',
      },
      {
        id: 'v2',
        question: 'What are the production credentials for Sentry?',
        reason: 'Not in repo',
      },
    ];
    const matches = findSpeculativeNeedsVerification(items);
    expect(matches).toHaveLength(1);
    expect(matches[0].index).toBe(1);
    expect(matches[0].question).toMatch(/credentials/);
    expect(matches[0].reason).toMatch(/external/);
  });

  it('returns an empty array when nothing matches', () => {
    expect(
      findSpeculativeNeedsVerification([
        { id: 'v1', question: 'Why is X coupled to Y?', reason: 'Both import from utils' },
      ]),
    ).toEqual([]);
  });

  it('returns an empty array on non-array input (defensive)', () => {
    expect(findSpeculativeNeedsVerification(undefined)).toEqual([]);
    expect(findSpeculativeNeedsVerification(null)).toEqual([]);
    expect(findSpeculativeNeedsVerification({})).toEqual([]);
  });

  it('classifies each match against exactly one category (first-match wins)', () => {
    // An item that mentions BOTH "credentials" and "outside this
    // repository" matches the credentials category first (declared
    // earlier in the SPECULATIVE_TOKENS list). The classification
    // string just has to be non-empty.
    const matches = findSpeculativeNeedsVerification([
      {
        id: 'v1',
        question: 'What credentials are managed outside this repository?',
        reason: 'Combo case',
      },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].reason.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// PLAN 14 — STRUCTURAL VALIDATORS
// ============================================================================

/**
 * Reusable fixture: a "good" item that passes every Plan 14 rule.
 * Tests start from this baseline and mutate one field at a time so
 * the rule under test is the only failing thing.
 */
const GOOD_ITEM = {
  id: 'v1',
  question: 'Is the Redis instance shared across services or per-service?',
  reason:
    'Both services connect to Redis but connection configs do not specify instance isolation.',
  attempted_resolution: [
    'Read services/backend/src/redis/redis.module.ts',
    'Grep "createClient" services/',
  ],
  impact:
    "Determines whether the architectural narrative describes Redis topology as 'shared' or 'per-service' and changes the deployment-target paragraph in ARCHITECTURE.md.",
};

describe('validateNeedsVerificationProse — Plan 14 §C.1 attempted_resolution', () => {
  it('passes a good item with 2 tool entries', () => {
    expect(validateNeedsVerificationProse([GOOD_ITEM])).toHaveLength(0);
  });

  it('hard-fails when attempted_resolution is missing', () => {
    const { attempted_resolution: _ar, ...rest } = GOOD_ITEM;
    const violations = validateNeedsVerificationProse([rest]);
    expect(violations.some((v) => v.code === 'missing_attempted_resolution')).toBe(true);
  });

  it('hard-fails when attempted_resolution has fewer than 2 entries', () => {
    const violations = validateNeedsVerificationProse([
      { ...GOOD_ITEM, attempted_resolution: ['Read services/backend/package.json'] },
    ]);
    expect(violations.some((v) => v.code === 'missing_attempted_resolution')).toBe(true);
  });

  it('hard-fails when entries are too short or empty', () => {
    const violations = validateNeedsVerificationProse([
      { ...GOOD_ITEM, attempted_resolution: ['', 'short'] },
    ]);
    expect(violations.some((v) => v.code === 'invalid_attempted_resolution_entry')).toBe(true);
  });

  it('hard-fails when entries are prose without a tool token', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        attempted_resolution: [
          'I tried looking at the files but did not find anything',
          'I checked the README too',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'invalid_attempted_resolution_entry')).toBe(true);
  });

  it('hard-fails when there is NO tool entry (only human:-prefixed entries)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        attempted_resolution: [
          'human: requires the operator to confirm whether v1 is supported in production',
          'human: only the product owner can answer this deprecation timeline',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'invalid_attempted_resolution_entry')).toBe(true);
  });

  it('passes when human:-prefixed entries supplement at least one tool entry', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        attempted_resolution: [
          'Grep "v1" services/backend/src/routes/',
          'human: requires product-owner decision on v1 deprecation timeline',
        ],
      },
    ]);
    expect(violations).toHaveLength(0);
  });

  it('hard-fails human:-prefixed entries with too-short explanations', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        attempted_resolution: ['Grep "v1" services/', 'human: dunno'],
      },
    ]);
    expect(violations.some((v) => v.code === 'invalid_attempted_resolution_entry')).toBe(true);
  });

  it('accepts both Read/Grep/Glob/Bash and mcp__code_graph__* tool tokens', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        attempted_resolution: [
          'mcp__code_graph__semantic_search_nodes_tool({ query: "Stripe", limit: 20 })',
          'Bash: find services -name "*.controller.ts"',
        ],
      },
    ]);
    expect(violations).toHaveLength(0);
  });
});

describe('validateNeedsVerificationProse — Plan 14 §C.2 graph internals ban', () => {
  it.each([
    ['question', 'graph traversal'],
    ['question', 'during graph parsing'],
    ['question', 'graph data alone'],
    ['question', 'Class search returned 0'],
    ['question', 'mcp__code_graph__semantic_search_nodes_tool'],
    ['reason', 'community size'],
    ['reason', 'community member analysis'],
    ['reason', 'graph community payload'],
  ])('hard-fails when %s contains "%s"', (field, phrase) => {
    const item = { ...GOOD_ITEM, [field]: `Some text with ${phrase} in it.` };
    const violations = validateNeedsVerificationProse([item]);
    expect(violations.some((v) => v.code === 'graph_internals_in_user_prose')).toBe(true);
  });

  it('does NOT fire when the item describes project state in plain language', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Does the auth service integrate with Keycloak via JWT or session tokens?',
        reason: 'Both libraries are imported but the configuration is not clear.',
      },
    ]);
    expect(violations.filter((v) => v.code === 'graph_internals_in_user_prose')).toHaveLength(0);
  });
});

describe('validateNeedsVerificationProse — Plan 14 §C.3 fabricated numbers', () => {
  it.each([
    'Are there approximately 180 files in services/backend?',
    'Is the function count roughly 3000?',
    'Are there about 12 modules in shared?',
    'Are the per-service file counts ~180, ~120, ~25?',
    'Does the project have around 25 packages?',
    'Are there ≈45 controllers?',
  ])('hard-fails on "%s"', (question) => {
    const violations = validateNeedsVerificationProse([{ ...GOOD_ITEM, question }]);
    expect(violations.some((v) => v.code === 'fabricated_numbers_in_question')).toBe(true);
  });

  it('does NOT fire on numbers that are part of a version reference', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Is the project pinned to NestJS 11.x or expected to migrate to 12.x?',
      },
    ]);
    expect(violations.filter((v) => v.code === 'fabricated_numbers_in_question')).toHaveLength(0);
  });
});

describe('validateNeedsVerificationProse — Plan 14 §C.7 impact field', () => {
  it('hard-fails when impact is missing', () => {
    const { impact: _imp, ...rest } = GOOD_ITEM;
    const violations = validateNeedsVerificationProse([rest]);
    expect(violations.some((v) => v.code === 'missing_or_generic_impact')).toBe(true);
  });

  it('hard-fails when impact is empty / whitespace-only', () => {
    const violations = validateNeedsVerificationProse([{ ...GOOD_ITEM, impact: '   ' }]);
    expect(violations.some((v) => v.code === 'missing_or_generic_impact')).toBe(true);
  });

  it('hard-fails when impact is too short (<40 chars)', () => {
    const violations = validateNeedsVerificationProse([{ ...GOOD_ITEM, impact: 'Some impact.' }]);
    expect(violations.some((v) => v.code === 'missing_or_generic_impact')).toBe(true);
  });

  it.each([
    'Important for documentation purposes and general clarity.',
    'Useful to know for future migration planning.',
    'Helpful for understanding the project layout.',
    'Nice to have for completeness.',
    'Provides context for other analyses.',
    'Affects the analysis of the testing surface.',
  ])('hard-fails on generic phrasing: "%s"', (impact) => {
    const violations = validateNeedsVerificationProse([{ ...GOOD_ITEM, impact }]);
    expect(violations.some((v) => v.code === 'missing_or_generic_impact')).toBe(true);
  });

  it('passes when impact names a concrete artefact + concrete change', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        impact:
          'Decides whether SERVICES.md describes the queue topology as fan-out or single-consumer.',
      },
    ]);
    expect(violations.filter((v) => v.code === 'missing_or_generic_impact')).toHaveLength(0);
  });
});

describe('validateNeedsVerificationProse — defensive shapes', () => {
  it('returns empty on non-array input', () => {
    expect(validateNeedsVerificationProse(undefined)).toEqual([]);
    expect(validateNeedsVerificationProse(null)).toEqual([]);
    expect(validateNeedsVerificationProse({})).toEqual([]);
    expect(validateNeedsVerificationProse('oops')).toEqual([]);
  });

  it('skips non-object items in the array (lets the schema validator handle them)', () => {
    const violations = validateNeedsVerificationProse([null, 'not an object', 42, GOOD_ITEM]);
    // Only the valid GOOD_ITEM is examined; it passes; output is empty.
    expect(violations).toEqual([]);
  });

  it('reports per-item violations with correct index', () => {
    const violations = validateNeedsVerificationProse([
      GOOD_ITEM,
      { ...GOOD_ITEM, impact: 'Useful for context.' },
      GOOD_ITEM,
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].index).toBe(1);
  });
});

describe('validateNeedsVerificationProse — Plan 17 §C.1 found_no_evidence_yesno', () => {
  // The gira 2026-05-06 run produced these self-contradicting questions:
  //  - "Is an AWS S3 client library installed?" + attempted_resolution
  //    showing `Grep aws-sdk — zero matches`
  //  - "Is there a CI/CD pipeline configured?" + attempted_resolution
  //    showing `Glob {.github/workflows/*.yml,...} — returned zero matches`
  //  - "Is a minimum Jest code-coverage threshold enforced?" +
  //    attempted_resolution showing `no coverageThreshold key found`
  //
  // Each one has well-formed evidence that already proves the answer
  // is "no". The rule rejects them so the operator gets a clean list.

  const GIRA_AR_AWS_SDK = [
    'Grep "aws-sdk" services/backend/package.json — zero matches; no AWS SDK declared in backend dependencies',
    'Grep "aws-sdk" services/web-frontend/package.json — zero matches across all remaining packages',
  ];

  it('fires on the gira "AWS SDK" shape (Q1)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Is an AWS S3 client library installed for the attachment storage feature?',
        attempted_resolution: GIRA_AR_AWS_SDK,
      },
    ]);
    expect(violations.some((v) => v.code === 'found_no_evidence_yesno')).toBe(true);
  });

  it('fires on the gira "CI/CD pipeline" shape (Q2)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Is there a CI/CD pipeline configured for this project?',
        attempted_resolution: [
          'Glob "{.github/workflows/*.yml,.gitlab-ci.yml,.circleci/config.yml}" — returned zero matches',
          'Grep "deploy" package.json — only keycloak:export-realm script found; no publish or release automation',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'found_no_evidence_yesno')).toBe(true);
  });

  it('fires on the gira "Jest coverage threshold" shape (Q4)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Is a minimum Jest code-coverage threshold enforced for the backend service?',
        attempted_resolution: [
          'Read services/backend/jest.config.mjs — collectCoverageFrom present, no coverageThreshold key found',
          'Grep "coverageThreshold" services/backend/ — zero matches across all backend config files',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'found_no_evidence_yesno')).toBe(true);
  });

  it('does NOT fire on legitimate operator questions (gira Q5 — Keycloak prod env vars)', () => {
    // The agent established the code's behavior. The question asks
    // whether production VALUES are correct — production-only,
    // operator-only. The attempted_resolution contains negative
    // tokens ("no @IsOptional()", "no defaults") that establish
    // source-code context but do NOT answer the production-values
    // question. The production-runtime exemption keeps this from
    // false-positive firing.
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question:
          'Are KEYCLOAK_INTERNAL_URL, KEYCLOAK_EXTERNAL_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_ADMIN_USERNAME, and KEYCLOAK_ADMIN_PASSWORD set correctly in the production environment?',
        attempted_resolution: [
          'Read services/backend/src/modules/config/keycloak.config.ts — confirms all six vars are marked @IsString() with no @IsOptional() and no defaults',
          'Grep "KEYCLOAK" services/backend/src — 7 source files reference these vars but no .env.example or fallback defaults appear in any of them',
        ],
      },
    ]);
    expect(violations.filter((v) => v.code === 'found_no_evidence_yesno')).toHaveLength(0);
  });

  it('does NOT fire on production-runtime questions (gira Q6 — Redis production deployment)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question:
          'Is the Redis instance pointed to by REDIS_HOST and REDIS_PORT a persistent, production-grade deployment rather than a local or ephemeral container?',
        attempted_resolution: [
          'Read services/backend/src/modules/queue/queues.config.ts — getRedisConnection() defaults REDIS_HOST to localhost and REDIS_PORT to 6379',
          'Read services/backend/src/modules/auth/middleware/auth.middleware.ts — RedisService.getJson call has no try/catch or graceful degradation',
        ],
      },
    ]);
    expect(violations.filter((v) => v.code === 'found_no_evidence_yesno')).toHaveLength(0);
  });

  it('does NOT fire on "configured correctly" / "set correctly" question shapes', () => {
    // These ask about CORRECTNESS of production state, not source-code presence.
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Are SENTRY_DSN and SENTRY_ENVIRONMENT configured correctly?',
        attempted_resolution: [
          'Read sentry.config.ts — vars are required at startup',
          'Grep "SENTRY" services/backend/src — 5 files reference; no defaults in code',
        ],
      },
    ]);
    expect(violations.filter((v) => v.code === 'found_no_evidence_yesno')).toHaveLength(0);
  });

  it('does NOT fire on non-yes/no questions even when attempted_resolution has negative evidence', () => {
    // Questions like "What testing strategy is enforced?" deserve to be
    // asked even when the agent searched and found nothing — they ask
    // about strategy, not pure presence.
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'What testing strategy is enforced for the backend service?',
        attempted_resolution: [
          'Read services/backend/jest.config.mjs — no coverageThreshold key found',
          'Grep "coverageThreshold" services/backend/ — zero matches',
        ],
      },
    ]);
    expect(violations.filter((v) => v.code === 'found_no_evidence_yesno')).toHaveLength(0);
  });

  it('does NOT fire when the question is yes/no but the evidence is positive', () => {
    // "Is X used at runtime?" + AR proving X is used — this is well-shaped;
    // the rule must only catch yes/no + negative-evidence pairs.
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Is BullMQ used as the queue transport?',
        attempted_resolution: [
          'Read services/backend/src/queue/queue.module.ts — imports @nestjs/bullmq and registers two queues',
          'Grep "from \'bullmq\'" services/backend/src/ — 4 import sites confirmed',
        ],
      },
    ]);
    expect(violations.filter((v) => v.code === 'found_no_evidence_yesno')).toHaveLength(0);
  });
});

describe('validateNeedsVerificationProse — Plan 17 §C.2 confessed_incomplete_search', () => {
  // The gira 2026-05-06 run produced this confessed-incomplete question:
  //  - "What commands do the husky git hooks actually execute?" +
  //    attempted_resolution explicitly stating "file contents were not read"
  // The .husky/* files are short shell scripts; the agent had Read
  // available; the fix is to read them.

  it('fires on the gira "husky hooks" shape (Q3)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question:
          'What commands do the husky git hooks (commit-msg, pre-push, pre-commit) actually execute?',
        attempted_resolution: [
          'Glob .husky/* — found commit-msg, pre-push, pre-commit but file contents were not read',
          'Read services/backend/package.json — scripts define lint:check, type:check, test:unit',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'confessed_incomplete_search')).toBe(true);
  });

  it('fires on "did not inspect" phrasing', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        attempted_resolution: [
          'Read services/backend/package.json — confirmed deps',
          'Found 3 config files but did not inspect their contents',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'confessed_incomplete_search')).toBe(true);
  });

  it('fires on "was not searched" phrasing', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        attempted_resolution: [
          'Read services/backend/package.json',
          'The /docs directory was not searched for additional context',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'confessed_incomplete_search')).toBe(true);
  });

  it('does NOT fire on completed searches (no admit-incomplete tokens)', () => {
    const violations = validateNeedsVerificationProse([GOOD_ITEM]);
    expect(violations.filter((v) => v.code === 'confessed_incomplete_search')).toHaveLength(0);
  });

  it('does NOT fire on negative results that simply report "not found" (different from confessed)', () => {
    // "no X found" is a completed search with a negative result —
    // that's the §C.1 territory (and only fires for yes/no questions).
    // The confessed-incomplete rule must not trip on negative results.
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'How are background jobs scheduled?',
        attempted_resolution: [
          'Grep "BullMQ" services/backend/src — no matches found',
          'Read services/backend/src/queue/queue.module.ts',
        ],
      },
    ]);
    expect(violations.filter((v) => v.code === 'confessed_incomplete_search')).toHaveLength(0);
  });
});

describe('Plan 17 acceptance — all 4 self-contradicting gira questions are blocked', () => {
  it('blocks Q1, Q2, Q3, Q4 in a single batch; passes Q5, Q6 unchanged', () => {
    // The complete gira 2026-05-06 set, as shipped to the operator
    // in the interactive prompt. The expectation: 4 reject, 2 pass
    // through (subject to the existing Plan-14 gates which we already
    // know they pass).
    const giraSet = [
      // Q1 — found-no-evidence
      {
        ...GOOD_ITEM,
        question: 'Is an AWS S3 client library installed for the attachment storage feature?',
        attempted_resolution: [
          'Grep "aws-sdk" services/backend/package.json — zero matches; no AWS SDK declared in backend dependencies',
          'Grep "aws-sdk" services/web-frontend/package.json seeds/scripts/package.json packages/shared/package.json — zero matches across all remaining packages',
        ],
      },
      // Q2 — found-no-evidence
      {
        ...GOOD_ITEM,
        question:
          'Is there a CI/CD pipeline configured for this project, and if so where is it defined?',
        attempted_resolution: [
          'Glob "{.github/workflows/*.yml,.gitlab-ci.yml,.circleci/config.yml,Jenkinsfile,.travis.yml,azure-pipelines.yml}" — returned zero matches',
          'Grep "deploy" package.json — only keycloak:export-realm script found; no publish, deploy, or release automation scripts present',
        ],
      },
      // Q3 — confessed-incomplete-search
      {
        ...GOOD_ITEM,
        question:
          'What commands do the husky git hooks (commit-msg, pre-push, pre-commit) actually execute?',
        attempted_resolution: [
          'Glob .husky/* — found commit-msg, pre-push, pre-commit but file contents were not read',
          'Read services/backend/package.json — scripts define lint:check, type:check, test:unit',
        ],
      },
      // Q4 — found-no-evidence
      {
        ...GOOD_ITEM,
        question: 'Is a minimum Jest code-coverage threshold enforced for the backend service?',
        attempted_resolution: [
          'Read services/backend/jest.config.mjs — collectCoverageFrom present, no coverageThreshold key found',
          'Grep "coverageThreshold" services/backend/ — zero matches across all backend config files',
        ],
      },
      // Q5 — legitimate operator question
      {
        ...GOOD_ITEM,
        question:
          'Are KEYCLOAK_INTERNAL_URL, KEYCLOAK_EXTERNAL_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_ADMIN_USERNAME, and KEYCLOAK_ADMIN_PASSWORD set correctly in the production environment?',
        attempted_resolution: [
          'Read services/backend/src/modules/config/keycloak.config.ts — confirms all six vars are marked @IsString() with no @IsOptional() and no defaults',
          'Grep "KEYCLOAK" services/backend/src — 7 source files reference these vars',
        ],
      },
      // Q6 — legitimate operator question
      {
        ...GOOD_ITEM,
        question:
          'Is the Redis instance pointed to by REDIS_HOST and REDIS_PORT a persistent, production-grade deployment rather than a local or ephemeral container?',
        attempted_resolution: [
          'Read services/backend/src/modules/queue/queues.config.ts — getRedisConnection() defaults REDIS_HOST to localhost and REDIS_PORT to 6379',
          'Read services/backend/src/modules/auth/middleware/auth.middleware.ts — RedisService.getJson call has no try/catch',
        ],
      },
    ];

    const violations = validateNeedsVerificationProse(giraSet);
    const blockedIndexes = new Set(
      violations
        .filter(
          (v) => v.code === 'found_no_evidence_yesno' || v.code === 'confessed_incomplete_search',
        )
        .map((v) => v.index),
    );
    // Q1, Q2, Q3, Q4 are at indexes 0, 1, 2, 3.
    expect(blockedIndexes.has(0)).toBe(true);
    expect(blockedIndexes.has(1)).toBe(true);
    expect(blockedIndexes.has(2)).toBe(true);
    expect(blockedIndexes.has(3)).toBe(true);
    // Q5, Q6 (indexes 4, 5) MUST NOT be flagged by the Plan 17 rules.
    // (Plan 18 promotes those to `speculative_out_of_scope` instead.)
    const q5q6New = violations.filter(
      (v) =>
        (v.index === 4 || v.index === 5) &&
        (v.code === 'found_no_evidence_yesno' || v.code === 'confessed_incomplete_search'),
    );
    expect(q5q6New).toHaveLength(0);
  });
});

describe('validateNeedsVerificationProse — Plan 18 speculative_out_of_scope', () => {
  // Plan 14's `hasSpeculativeNeedsVerification` was a soft warning;
  // Plan 18 promotes it to a hard rejection. The wiki/CLAUDE.md is
  // generated from CODE — production state, secrets, and externally-
  // managed infrastructure are out-of-scope by design.

  it('blocks credentials / secrets / passwords questions', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'What are the production Sentry DSN, org, and credentials?',
      },
    ]);
    expect(violations.some((v) => v.code === 'speculative_out_of_scope')).toBe(true);
  });

  it('blocks env-var-style credential identifiers (SENTRY_DSN, *_SECRET, *_PASSWORD)', () => {
    // The 2026-05-06 gira data-flows run produced "What is the production
    // SENTRY_DSN value...?". The plain-word `\bdsn\b` regex does not
    // match inside `SENTRY_DSN` because `_` is a word character; an
    // env-var-suffix pattern catches it.
    expect(
      validateNeedsVerificationProse([
        { ...GOOD_ITEM, question: 'What is the production SENTRY_DSN value for error monitoring?' },
      ]).some((v) => v.code === 'speculative_out_of_scope'),
    ).toBe(true);
    expect(
      validateNeedsVerificationProse([
        { ...GOOD_ITEM, question: 'What is the value of STRIPE_API_KEY?' },
      ]).some((v) => v.code === 'speculative_out_of_scope'),
    ).toBe(true);
    expect(
      validateNeedsVerificationProse([
        { ...GOOD_ITEM, question: 'Is the GITHUB_TOKEN configured?' },
      ]).some((v) => v.code === 'speculative_out_of_scope'),
    ).toBe(true);
  });

  it('blocks "set correctly in production" questions (gira Q5)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question:
          'Are KEYCLOAK_INTERNAL_URL, KEYCLOAK_EXTERNAL_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_ADMIN_USERNAME, and KEYCLOAK_ADMIN_PASSWORD set correctly in the production environment?',
        attempted_resolution: [
          'Read services/backend/src/modules/config/keycloak.config.ts — confirms all six vars are required',
          'Grep "KEYCLOAK" services/backend/src — 7 source files reference these vars',
        ],
      },
    ]);
    // Hits multiple SPECULATIVE_TOKENS patterns: PASSWORD ∈ credentials,
    // "production environment" ∈ production-deployment.
    expect(violations.some((v) => v.code === 'speculative_out_of_scope')).toBe(true);
  });

  it('blocks "production-grade deployment" questions (gira Q6)', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question:
          'Is the Redis instance pointed to by REDIS_HOST and REDIS_PORT a persistent, production-grade deployment rather than a local or ephemeral container?',
        attempted_resolution: [
          'Read services/backend/src/modules/queue/queues.config.ts — REDIS_HOST defaults to localhost',
          'Read services/backend/src/modules/auth/middleware/auth.middleware.ts — no try/catch around Redis call',
        ],
      },
    ]);
    expect(violations.some((v) => v.code === 'speculative_out_of_scope')).toBe(true);
  });

  it('blocks "managed outside this repository" questions', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Is the auth service managed in a separate infrastructure repository?',
      },
    ]);
    expect(violations.some((v) => v.code === 'speculative_out_of_scope')).toBe(true);
  });

  it('blocks "vendor portal" / "external system" questions', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question: 'Is the Keycloak realm configured in the vendor portal?',
      },
    ]);
    expect(violations.some((v) => v.code === 'speculative_out_of_scope')).toBe(true);
  });

  it('does NOT fire on legitimate intent / business-decision questions', () => {
    const violations = validateNeedsVerificationProse([
      {
        ...GOOD_ITEM,
        question:
          'Should the legacy /api/v1 endpoints be included in the public API documentation?',
        attempted_resolution: [
          'Grep "/api/v1" services/backend/src — 12 routes still defined',
          'Read services/backend/src/main.ts — both /api/v1 and /api/v2 are registered',
        ],
      },
    ]);
    expect(violations.filter((v) => v.code === 'speculative_out_of_scope')).toHaveLength(0);
  });

  it('does NOT fire on the canonical GOOD_ITEM (Redis topology — code-determinable)', () => {
    const violations = validateNeedsVerificationProse([GOOD_ITEM]);
    expect(violations.filter((v) => v.code === 'speculative_out_of_scope')).toHaveLength(0);
  });
});

describe('Plan 18 acceptance — all 6 gira questions are blocked (Plan 17 + Plan 18 combined)', () => {
  it('blocks every wrong question; legitimate intent questions still pass', () => {
    // The same gira-shape set from the Plan 17 acceptance test, but
    // now we expect ALL six to be blocked because Plan 18 catches Q5
    // and Q6 via `speculative_out_of_scope`. The remaining clean
    // questions (the absence-intentional one + the runtime-platform
    // one from earlier analyzer outputs) are NOT in this fixture
    // and would pass — those are the only items reaching the operator.
    const giraSet = [
      // Q1 — found-no-evidence
      {
        ...GOOD_ITEM,
        question: 'Is an AWS S3 client library installed for the attachment storage feature?',
        attempted_resolution: [
          'Grep "aws-sdk" services/backend/package.json — zero matches',
          'Grep "aws-sdk" services/web-frontend/package.json — zero matches',
        ],
      },
      // Q2 — found-no-evidence
      {
        ...GOOD_ITEM,
        question: 'Is there a CI/CD pipeline configured for this project?',
        attempted_resolution: [
          'Glob "{.github/workflows/*.yml,.gitlab-ci.yml,.circleci/config.yml}" — returned zero matches',
          'Grep "deploy" package.json — only keycloak:export-realm script found',
        ],
      },
      // Q3 — confessed-incomplete-search
      {
        ...GOOD_ITEM,
        question:
          'What commands do the husky git hooks (commit-msg, pre-push, pre-commit) actually execute?',
        attempted_resolution: [
          'Glob .husky/* — found commit-msg, pre-push, pre-commit but file contents were not read',
          'Read services/backend/package.json — scripts define lint:check, type:check, test:unit',
        ],
      },
      // Q4 — found-no-evidence
      {
        ...GOOD_ITEM,
        question: 'Is a minimum Jest code-coverage threshold enforced for the backend service?',
        attempted_resolution: [
          'Read services/backend/jest.config.mjs — no coverageThreshold key found',
          'Grep "coverageThreshold" services/backend/ — zero matches',
        ],
      },
      // Q5 — speculative_out_of_scope (Plan 18)
      {
        ...GOOD_ITEM,
        question:
          'Are KEYCLOAK_INTERNAL_URL, KEYCLOAK_EXTERNAL_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID, KEYCLOAK_ADMIN_USERNAME, and KEYCLOAK_ADMIN_PASSWORD set correctly in the production environment?',
      },
      // Q6 — speculative_out_of_scope (Plan 18)
      {
        ...GOOD_ITEM,
        question:
          'Is the Redis instance pointed to by REDIS_HOST and REDIS_PORT a persistent, production-grade deployment rather than a local or ephemeral container?',
      },
    ];
    const violations = validateNeedsVerificationProse(giraSet);
    const allRejectionCodes = new Set([
      'found_no_evidence_yesno',
      'confessed_incomplete_search',
      'speculative_out_of_scope',
    ]);
    const blockedIndexes = new Set(
      violations.filter((v) => allRejectionCodes.has(v.code)).map((v) => v.index),
    );
    // ALL six should be blocked.
    for (let i = 0; i < 6; i++) {
      expect(blockedIndexes.has(i)).toBe(true);
    }
  });
});

describe('Plan 14 acceptance — the 7 gira questions are blocked', () => {
  // Each fixture is the gira question rephrased as a needs_verification
  // item with the worst-case shape (empty / generic resolution + impact).
  // Q5 (testing-coverage policy) is the only one that should pass when
  // it carries a proper resolution + impact.

  it('Q1 (does main.tsx exist?) — blocked on missing_attempted_resolution', () => {
    const violations = validateNeedsVerificationProse([
      {
        id: 'v1',
        question:
          'Do services/web-frontend/src/main.tsx and src/routes/__root.tsx exist as the actual application entry points?',
        reason: 'Entry points inferred from Vite + TanStack Router conventions.',
        attempted_resolution: [],
        impact: 'Determines the entry-point list in the web-frontend service doc.',
      },
    ]);
    expect(violations.some((v) => v.code === 'missing_attempted_resolution')).toBe(true);
  });

  it('Q2 (file-count guess) — blocked on fabricated_numbers_in_question', () => {
    const violations = validateNeedsVerificationProse([
      {
        id: 'v2',
        question:
          'Are the per-service file counts accurate at approximately backend ~180, web-frontend ~120, and shared ~25?',
        reason: 'Graph community sizes represent node counts, not file counts.',
        attempted_resolution: ['Read package.json', 'Glob "services/**/*"'],
        impact: 'Sets the file_count field on each service entry in SERVICES.md.',
      },
    ]);
    expect(violations.some((v) => v.code === 'fabricated_numbers_in_question')).toBe(true);
  });

  it('Q6 (graph-internals leakage) — blocked on graph_internals_in_user_prose', () => {
    const violations = validateNeedsVerificationProse([
      {
        id: 'v6',
        question:
          'Do NestJS REST controllers and WebSocket gateways exist in the backend beyond what the code graph indexed?',
        reason:
          'Graph Class search returned 0 Controller/Gateway nodes; NestJS decorator-based classes may have been missed during graph parsing.',
        attempted_resolution: [
          'mcp__code_graph__semantic_search_nodes_tool({ query: "Controller" })',
          'mcp__code_graph__semantic_search_nodes_tool({ query: "Gateway" })',
        ],
        impact: 'Decides whether the api-patterns block of ARCHITECTURE.md mentions WebSocket.',
      },
    ]);
    expect(violations.some((v) => v.code === 'graph_internals_in_user_prose')).toBe(true);
  });

  it('Q4 (synonym for outside-the-repo) — surfaces speculative_needs_verification', () => {
    // Q4 evades the original "outside this repository" rule but
    // matches the §C.5 synonym list ("infrastructure repository",
    // "external system", "build environments reachable").
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v4',
          question:
            'Does a CI/CD pipeline exist for this project, and is the self-hosted Sentry instance accessible from production build environments?',
          reason:
            'No CI config detected — automated deployment may be managed in a separate infrastructure repository or external system.',
          attempted_resolution: ['Glob ".github/workflows/*"', 'Read vite.config.ts'],
          impact:
            'Decides whether ARCHITECTURE.md mentions a CI pipeline as part of the deployment topology.',
        },
      ]),
    ).toBe(true);
  });

  it('Q5 (testing-coverage policy) — passes when the agent supplies proper resolution + impact', () => {
    const violations = validateNeedsVerificationProse([
      {
        id: 'v5',
        question:
          'What is the project testing coverage policy — are coverage thresholds enforced in CI?',
        reason: 'jest.config.mjs enables collectCoverageFrom but defines no threshold values.',
        attempted_resolution: [
          'Read jest.config.mjs',
          'Grep "coverageThreshold" services/',
          'human: requires operator knowledge of CI pipeline coverage gates',
        ],
        impact:
          'Decides whether testing-conventions/SKILL.md prescribes "enforce 80% line coverage" or "no enforced threshold".',
      },
    ]);
    expect(violations).toHaveLength(0);
  });
});

describe('hasSpeculativeNeedsVerification — Plan 14 §C.5 synonym expansion', () => {
  it.each([
    'managed in a separate infrastructure repository',
    'lives in a sibling repository',
    'managed by a different vendor portal',
    'handled by an external system',
    'external infrastructure managed by another team',
    'is the host accessible from production build environments?',
    'reachable from CI environments?',
    'accessible from build environments',
    'infrastructure managed elsewhere',
  ])('detects "%s" via synonym pattern', (phrase) => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v1',
          question: `Does the deployment ${phrase}?`,
          reason: 'Cannot determine from this repo.',
        },
      ]),
    ).toBe(true);
  });

  it('does NOT misfire on legitimate prose mentioning unrelated tokens', () => {
    expect(
      hasSpeculativeNeedsVerification([
        {
          id: 'v1',
          question: 'Does the project use a Redis-based external cache or an in-process cache?',
          reason:
            'Both libraries appear to be installed but only one is wired up in the cache module.',
        },
      ]),
    ).toBe(false);
  });
});

describe('hasManifestVsImportMismatch — Plan 14 §C.4', () => {
  it('fires when the item references "declared as dependencies" without an import-site search', () => {
    expect(
      hasManifestVsImportMismatch({
        id: 'v3',
        question: 'Are AWS S3 and Google OAuth fully implemented or only declared as dependencies?',
        reason: 'AWS env vars are present in .env.example but no @aws-sdk/client-s3 SDK was found.',
        attempted_resolution: ['Read .env.example', 'Read services/backend/package.json'],
        impact: 'Decides whether SERVICES.md mentions S3 in the integrations block.',
      }),
    ).toBe(true);
  });

  it('does NOT fire when the agent already searched for import sites', () => {
    expect(
      hasManifestVsImportMismatch({
        id: 'v3',
        question: 'Is the @aws-sdk dependency only declared, or actually imported?',
        reason: 'Package.json lists it but unclear if it is wired up.',
        attempted_resolution: [
          'Read services/backend/package.json',
          'Grep "from \'@aws-sdk" services/backend/src/',
        ],
        impact: 'Decides whether SERVICES.md mentions S3 in the integrations block.',
      }),
    ).toBe(false);
  });

  it('detects mcp__code_graph__semantic_search_nodes_tool as an import-site search', () => {
    expect(
      hasManifestVsImportMismatch({
        id: 'v3',
        question: 'Is the @aws-sdk dependency only declared as a dependency in package.json?',
        reason: 'Package.json lists it but unclear if it is wired up.',
        attempted_resolution: [
          'Read services/backend/package.json',
          'mcp__code_graph__semantic_search_nodes_tool({ query: "@aws-sdk", limit: 20 })',
        ],
        impact: 'Decides whether SERVICES.md mentions S3 in the integrations block.',
      }),
    ).toBe(false);
  });

  it('does NOT fire when the question does not reference manifest-declaration prose', () => {
    expect(
      hasManifestVsImportMismatch({
        id: 'v1',
        question: 'Is Redis topology shared or per-service?',
        reason: 'Configs do not specify.',
        attempted_resolution: ['Read services/backend/redis.module.ts'],
        impact: 'Determines the deployment-target paragraph in ARCHITECTURE.md.',
      }),
    ).toBe(false);
  });

  it('hasAnyManifestVsImportMismatch returns true when any item trips', () => {
    expect(
      hasAnyManifestVsImportMismatch([
        {
          id: 'a',
          question: 'Plain question.',
          reason: 'Plain reason.',
          attempted_resolution: ['Read x.ts', 'Read y.ts'],
          impact: 'Concrete impact paragraph for the architecture section of ARCHITECTURE.md.',
        },
        {
          id: 'b',
          question: 'Is @sentry/node only declared as a dependency?',
          reason: 'package.json shows it.',
          attempted_resolution: ['Read package.json', 'Read README.md'],
          impact: 'Decides whether SERVICES.md mentions Sentry in the integrations block.',
        },
      ]),
    ).toBe(true);
  });

  it('hasAnyManifestVsImportMismatch returns false when no item trips', () => {
    expect(
      hasAnyManifestVsImportMismatch([
        {
          id: 'a',
          question: 'Plain question.',
          reason: 'Plain reason.',
          attempted_resolution: ['Read x.ts', 'Read y.ts'],
          impact: 'Concrete impact paragraph for the architecture section of ARCHITECTURE.md.',
        },
      ]),
    ).toBe(false);
  });

  it('returns false defensively on non-array / non-object inputs', () => {
    expect(hasManifestVsImportMismatch(null)).toBe(false);
    expect(hasManifestVsImportMismatch('oops')).toBe(false);
    expect(hasAnyManifestVsImportMismatch(undefined)).toBe(false);
    expect(hasAnyManifestVsImportMismatch({})).toBe(false);
  });
});
