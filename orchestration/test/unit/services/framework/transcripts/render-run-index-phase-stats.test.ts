import { describe, expect, it } from 'vitest';
import type {
  RunManifest,
  AttemptMeta,
} from '../../../../../src/services/framework/debug-store/types.js';
import { renderRunIndexHtml } from '../../../../../src/services/framework/transcripts/renderer/render-run-index.js';

/**
 * Phase-statistics table in the run index.
 *
 * Each phase gets a row showing attempts / avg duration / max
 * duration / outcome breakdown. Stack-agnostic: all values come from
 * the framework-defined AttemptMeta fields, not from project-specific
 * data.
 */

const MANIFEST: RunManifest = {
  runId: 'test-run-id',
  workflow: 'initialize-project',
  projectPath: '/test/project',
  provider: 'claude',
  debug: false,
  startedAt: '2026-05-05T00:00:00Z',
};

function attempt(
  partial: Partial<AttemptMeta> & {
    phaseId: string;
    phaseLabel: string;
    durationMs: number;
    outcome: AttemptMeta['outcome'];
  },
): { meta: AttemptMeta; htmlHref: string | null } {
  return {
    meta: {
      agentName: partial.agentName ?? 'analyzer',
      sessionId: partial.sessionId ?? 'session',
      attemptNumber: partial.attemptNumber ?? 1,
      phaseId: partial.phaseId,
      phaseNumber: partial.phaseNumber ?? 1,
      phaseLabel: partial.phaseLabel,
      runId: partial.runId ?? 'test-run-id',
      workflow: partial.workflow ?? 'initialize-project',
      outcome: partial.outcome,
      provider: partial.provider ?? 'claude',
      startedAt: partial.startedAt ?? '2026-05-05T00:00:00Z',
      durationMs: partial.durationMs,
    },
    htmlHref: null,
  };
}

describe('renderRunIndexHtml — phase-statistics table', () => {
  it('omits the table when no attempts are passed', async () => {
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts: [] });
    expect(html).not.toContain('Phase statistics');
  });

  it('renders a row per phase with attempts / avg / max / outcomes', async () => {
    const attempts = [
      attempt({
        phaseId: 'phase1',
        phaseLabel: 'Phase 1: Analysis',
        durationMs: 1000,
        outcome: 'success',
        attemptNumber: 1,
      }),
      attempt({
        phaseId: 'phase1',
        phaseLabel: 'Phase 1: Analysis',
        durationMs: 3000,
        outcome: 'success',
        attemptNumber: 2,
      }),
      attempt({
        phaseId: 'phase2',
        phaseLabel: 'Phase 2: Consolidation',
        durationMs: 500,
        outcome: 'failure',
        attemptNumber: 1,
        phaseNumber: 2,
      }),
    ];
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts });

    expect(html).toContain('Phase statistics');
    // Phase 1: 2 attempts, avg 2.0s, max 3.0s, outcomes success: 2.
    expect(html).toContain('Phase 1: Analysis');
    expect(html).toContain('<td>2</td>'); // attempts
    expect(html).toContain('2.0s'); // avg
    expect(html).toContain('3.0s'); // max
    expect(html).toContain('success: 2');

    // Phase 2: 1 attempt, avg/max 500ms, outcomes failure: 1.
    expect(html).toContain('Phase 2: Consolidation');
    expect(html).toContain('500ms');
    expect(html).toContain('failure: 1');
  });

  it('handles attempts without durationMs gracefully (treats as 0)', async () => {
    const attempts = [
      attempt({
        phaseId: 'p',
        phaseLabel: 'P',
        durationMs: 0,
        outcome: 'success',
      }),
    ];
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts });
    expect(html).toContain('Phase statistics');
    expect(html).toContain('<td>P</td>');
  });

  it('groups by phaseLabel even when phaseIds differ', async () => {
    // The grouping key is phaseLabel (falling back to phaseId), so two
    // attempts with the same display label are aggregated.
    const attempts = [
      attempt({
        phaseId: 'phase4a',
        phaseLabel: 'Phase 4: Wiki',
        durationMs: 2000,
        outcome: 'success',
      }),
      attempt({
        phaseId: 'phase4b',
        phaseLabel: 'Phase 4: Wiki',
        durationMs: 4000,
        outcome: 'success',
      }),
    ];
    const html = await renderRunIndexHtml({ manifest: MANIFEST, attempts });
    // Avg should be 3.0s, max 4.0s, attempts 2.
    expect(html).toContain('Phase 4: Wiki');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('3.0s');
    expect(html).toContain('4.0s');
  });
});
