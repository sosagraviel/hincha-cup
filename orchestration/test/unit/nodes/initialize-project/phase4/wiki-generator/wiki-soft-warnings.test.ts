import { describe, expect, it } from 'vitest';
import { computeWikiSoftWarnings } from '../../../../../../src/nodes/initialize-project/phase4/wiki-generator/hooks/wiki-soft-warnings.js';

/**
 * `low_wikilink_density` soft warning.
 *
 * The architecture spec's promptFocus tells the wiki-gen agent to wrap
 * discovered service ids in `[[id]]`. When the agent ignores that
 * instruction, the page can mention a service many times without ever
 * linking to its per-service doc. The soft warning surfaces this trend
 * for the run report — non-blocking by design.
 *
 * Stack-agnostic: every fixture uses ids that could come from any
 * language family (e.g. "auth-svc", "billing-worker", "frontend") —
 * we never tie the test to a single stack.
 */

describe('computeWikiSoftWarnings — low_wikilink_density', () => {
  it('does not fire when every mentioned service id has at least one wikilink', () => {
    const text = `# Architecture\n\nThe [[auth-svc]] talks to billing-worker. The auth-svc is small.`;
    const warnings = computeWikiSoftWarnings(text, ['auth-svc', 'billing-worker']);
    expect(warnings).toHaveLength(0);
  });

  it('fires when a service id has > 2 plain mentions and 0 wikilinks', () => {
    const text = [
      '# Architecture',
      '',
      'The auth-svc handles authentication. The auth-svc lives in svc-a/.',
      '',
      'Whenever the auth-svc receives a request it consults the cache.',
    ].join('\n');
    const warnings = computeWikiSoftWarnings(text, ['auth-svc']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('low_wikilink_density');
    expect(warnings[0].message).toContain('auth-svc');
    expect(warnings[0].message).toContain('3 plain mentions');
  });

  it('does NOT fire when there are exactly 2 plain mentions (threshold is >, not >=)', () => {
    // Mentioning a service twice without a wikilink is fine — for
    // example a single sentence can mention the same id twice for
    // readability. Three is the trigger.
    const text = `# Architecture\n\nThe billing-worker reads from the queue. billing-worker writes to the DB.`;
    const warnings = computeWikiSoftWarnings(text, ['billing-worker']);
    expect(warnings).toHaveLength(0);
  });

  it('counts only word-bounded mentions (does not match prefixes inside other ids)', () => {
    // `api-v2` should not increment the count for `api`.
    const text = [
      '# Architecture',
      '',
      'The api-v2 service is the new endpoint.',
      'The legacy-api service is being retired.',
      'The microscopic-api-utils package is unrelated.',
    ].join('\n');
    const warnings = computeWikiSoftWarnings(text, ['api']);
    // Zero true `api` mentions — every hit is part of a longer token.
    expect(warnings).toHaveLength(0);
  });

  it('ignores mentions inside fenced code blocks', () => {
    const text = [
      '# Architecture',
      '',
      'Run the auth-svc startup command:',
      '',
      '```',
      'auth-svc --config prod.yml',
      'auth-svc reload',
      'auth-svc tail-logs',
      'auth-svc inspect-tokens',
      '```',
      '',
      'See the per-service doc for details.',
    ].join('\n');
    const warnings = computeWikiSoftWarnings(text, ['auth-svc']);
    // Only the prose mention of "auth-svc" outside the fence (zero) counts.
    expect(warnings).toHaveLength(0);
  });

  it('ignores mentions inside inline backtick spans', () => {
    const text = [
      '# Architecture',
      '',
      'Use `auth-svc --version` to print the build SHA.',
      'Use `auth-svc reload` to reload config.',
      'Use `auth-svc tail` to follow logs.',
      'Use `auth-svc inspect` to inspect tokens.',
    ].join('\n');
    const warnings = computeWikiSoftWarnings(text, ['auth-svc']);
    expect(warnings).toHaveLength(0);
  });

  it('reports multiple offenders in a single warning', () => {
    const text = [
      '# Architecture',
      '',
      'The auth-svc talks to billing-worker.',
      'The auth-svc reads from the queue. auth-svc handles tokens too.',
      'billing-worker writes to the DB. billing-worker has its own retry policy.',
      // legitimate id with wikilink — should NOT show up.
      'The [[frontend]] consumes the API.',
    ].join('\n');
    const warnings = computeWikiSoftWarnings(text, ['auth-svc', 'billing-worker', 'frontend']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('auth-svc');
    expect(warnings[0].message).toContain('billing-worker');
    expect(warnings[0].message).not.toContain('frontend');
  });

  it('no-op on empty service list (defensive)', () => {
    expect(computeWikiSoftWarnings('# Anything\n\nHello.', [])).toEqual([]);
  });

  it('no-op on empty text (defensive)', () => {
    expect(computeWikiSoftWarnings('', ['svc-a'])).toEqual([]);
  });

  it('threshold is configurable for tests / future tuning', () => {
    const text = `# Architecture\n\nworker. worker.`;
    expect(computeWikiSoftWarnings(text, ['worker'])).toHaveLength(0);
    // With threshold 1, two mentions exceeds.
    expect(computeWikiSoftWarnings(text, ['worker'], { plainMentionThreshold: 1 })).toHaveLength(1);
  });

  it('does not double-count when wikilink and plain mentions coexist (wikilink presence is the gate)', () => {
    // Five plain mentions + one wikilink = pass. The presence of ANY
    // wikilink for the id flips the gate; the warning is about
    // "agent never linked this id once," not about "majority unlinked."
    const text = [
      '# Architecture',
      '',
      'See [[auth-svc]] below.',
      'The auth-svc handles tokens.',
      'The auth-svc talks to the queue.',
      'auth-svc reads from cache.',
      'auth-svc starts on port 8080.',
      'auth-svc owns the JWT lifecycle.',
    ].join('\n');
    const warnings = computeWikiSoftWarnings(text, ['auth-svc']);
    expect(warnings).toHaveLength(0);
  });
});
