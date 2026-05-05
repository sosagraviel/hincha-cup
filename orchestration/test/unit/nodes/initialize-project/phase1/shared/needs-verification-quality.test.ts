import { describe, expect, it } from 'vitest';
import {
  hasSpeculativeNeedsVerification,
  findSpeculativeNeedsVerification,
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
