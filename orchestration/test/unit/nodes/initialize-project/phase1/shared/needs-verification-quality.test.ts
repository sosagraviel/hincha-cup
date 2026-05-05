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
