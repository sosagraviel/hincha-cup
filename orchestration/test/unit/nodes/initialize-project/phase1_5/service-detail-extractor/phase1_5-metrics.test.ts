/**
 * Plan v4 Phase I — Phase 1.5 metrics builder unit tests.
 *
 * Asserts:
 *   - empty outcomes → all zeros, sane shape.
 *   - durations_ms keyed by canonical service id; max + sum + avg
 *     computed correctly.
 *   - failed and timed-out service ids surface separately, sorted.
 *   - in_flight_max = min(cap, services_total).
 *   - the metrics object validates its own invariants
 *     (services_total = completed + failed + timed_out for runs that
 *     fully drain).
 */

import { describe, expect, it } from 'vitest';
import {
  buildPhase1_5Metrics,
  type SliceOutcome,
} from '../../../../../../src/nodes/initialize-project/phase1_5/service-detail-extractor/service-detail-extractor.node.js';

describe('buildPhase1_5Metrics', () => {
  it('returns all zeros + empty maps when outcomes is empty', () => {
    const m = buildPhase1_5Metrics(0, [], 8);
    expect(m.services_total).toBe(0);
    expect(m.services_completed).toBe(0);
    expect(m.services_failed).toBe(0);
    expect(m.services_timed_out).toBe(0);
    expect(m.durations_ms).toEqual({});
    expect(m.aggregate.max_duration_ms).toBe(0);
    expect(m.aggregate.sum_duration_ms).toBe(0);
    expect(m.aggregate.avg_duration_ms).toBe(0);
    expect(m.parallelism.cap).toBe(8);
    expect(m.parallelism.in_flight_max).toBe(0);
    expect(m.failed_service_ids).toEqual([]);
    expect(m.timed_out_service_ids).toEqual([]);
  });

  it('aggregates durations correctly across mixed outcomes', () => {
    const outcomes: SliceOutcome[] = [
      {
        serviceId: 'api',
        status: 'completed',
        durationMs: 100,
        slicePath: 'service-details/api.json',
      },
      {
        serviceId: 'web',
        status: 'completed',
        durationMs: 60,
        slicePath: 'service-details/web.json',
      },
      {
        serviceId: 'auth',
        status: 'completed',
        durationMs: 200,
        slicePath: 'service-details/auth.json',
      },
    ];
    const m = buildPhase1_5Metrics(3, outcomes, 8);
    expect(m.services_total).toBe(3);
    expect(m.services_completed).toBe(3);
    expect(m.durations_ms).toEqual({ api: 100, web: 60, auth: 200 });
    expect(m.aggregate.max_duration_ms).toBe(200);
    expect(m.aggregate.sum_duration_ms).toBe(360);
    expect(m.aggregate.avg_duration_ms).toBe(120); // 360 / 3
  });

  it('partitions failures and timeouts into separate sorted id arrays', () => {
    const outcomes: SliceOutcome[] = [
      { serviceId: 'api', status: 'completed', durationMs: 100 },
      { serviceId: 'zeta', status: 'failed', durationMs: 50, error: 'boom' },
      { serviceId: 'auth', status: 'failed', durationMs: 60, error: 'boom' },
      { serviceId: 'web', status: 'timed_out', durationMs: 300000, error: 'timeout' },
    ];
    const m = buildPhase1_5Metrics(4, outcomes, 8);
    expect(m.services_completed).toBe(1);
    expect(m.services_failed).toBe(2);
    expect(m.services_timed_out).toBe(1);
    expect(m.failed_service_ids).toEqual(['auth', 'zeta']); // sorted
    expect(m.timed_out_service_ids).toEqual(['web']);
    // avg only counts completed runs (the spec — failed/timed-out
    // durations are not representative of normal-path wall-clock).
    expect(m.aggregate.avg_duration_ms).toBe(100);
  });

  it('computes parallelism.in_flight_max = min(cap, services_total)', () => {
    expect(buildPhase1_5Metrics(2, [], 8).parallelism.in_flight_max).toBe(2);
    expect(buildPhase1_5Metrics(20, [], 8).parallelism.in_flight_max).toBe(8);
    expect(buildPhase1_5Metrics(5, [], 5).parallelism.in_flight_max).toBe(5);
  });

  it('preserves verbatim durations regardless of magnitude — stack-agnostic', () => {
    // A 60s sub-agent on one service and a 300s sub-agent on another
    // should not be normalised, scaled, or capped.
    const outcomes: SliceOutcome[] = [
      { serviceId: 'tiny', status: 'completed', durationMs: 60_000 },
      { serviceId: 'large', status: 'completed', durationMs: 300_000 },
    ];
    const m = buildPhase1_5Metrics(2, outcomes, 8);
    expect(m.durations_ms.tiny).toBe(60_000);
    expect(m.durations_ms.large).toBe(300_000);
    expect(m.aggregate.max_duration_ms).toBe(300_000);
  });

  it('emits an ISO-8601 timestamp', () => {
    const m = buildPhase1_5Metrics(0, [], 8);
    expect(m.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
