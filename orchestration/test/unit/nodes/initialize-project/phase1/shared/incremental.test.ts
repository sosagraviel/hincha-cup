import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkIncrementalEligibility,
  recordIncrementalState,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/incremental.service.js';

/**
 * Incremental Phase 1 opt-in fast path.
 *
 * The fast path skips Phase 1 entirely when the graph SHA hasn't
 * changed since the prior run AND every prior output file is still
 * on disk. Default OFF (per the plan): operators opt in via
 * `--incremental` so framework upgrades that change analyzer
 * behaviour aren't silently masked by the cache.
 *
 * Stack-agnostic: every check is on bytes (graph DB hash) and file
 * existence (Phase 1 output JSONs). No language assumption.
 */

let tempDir: string;
let graphDbPath: string;
let phase1OutputsDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'incremental-phase1-'));
  graphDbPath = join(tempDir, 'graph.db');
  phase1OutputsDir = join(tempDir, 'phase1-outputs');
  mkdirSync(phase1OutputsDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeAllPhase1Outputs(): void {
  for (const f of [
    '01-structure-architecture.json',
    '02-tech-stack-dependencies.json',
    '03-code-patterns-testing.json',
    '04-data-flows-integrations.json',
  ]) {
    writeFileSync(join(phase1OutputsDir, f), '{}', 'utf-8');
  }
}

describe('checkIncrementalEligibility — default OFF', () => {
  it('returns canSkip=false when enabled is not set (default OFF)', () => {
    writeFileSync(graphDbPath, 'graph-bytes', 'utf-8');
    const result = checkIncrementalEligibility(graphDbPath, phase1OutputsDir);
    expect(result.canSkip).toBe(false);
    expect(result.reason).toMatch(/disabled.*default OFF/);
  });

  it('returns canSkip=false when enabled is explicitly false', () => {
    writeFileSync(graphDbPath, 'graph-bytes', 'utf-8');
    const result = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, {
      enabled: false,
    });
    expect(result.canSkip).toBe(false);
    expect(result.reason).toMatch(/disabled/);
  });
});

describe('checkIncrementalEligibility — opt-in path', () => {
  it('returns canSkip=false when graph DB does not exist', () => {
    const result = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    expect(result.canSkip).toBe(false);
    expect(result.reason).toMatch(/graph DB not found/);
  });

  it('returns canSkip=false on first run (no prior state)', () => {
    writeFileSync(graphDbPath, 'graph-bytes', 'utf-8');
    const result = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    expect(result.canSkip).toBe(false);
    expect(result.reason).toMatch(/no prior incremental state/);
    expect(result.currentGraphSha).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns canSkip=true when SHA matches and every prior output exists', () => {
    writeFileSync(graphDbPath, 'graph-bytes', 'utf-8');
    writeAllPhase1Outputs();
    const first = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    recordIncrementalState(phase1OutputsDir, first.currentGraphSha);

    const second = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    expect(second.canSkip).toBe(true);
    expect(second.reason).toMatch(/SHA matches prior run/);
  });

  it('returns canSkip=false when graph SHA changed', () => {
    writeFileSync(graphDbPath, 'graph-bytes', 'utf-8');
    writeAllPhase1Outputs();
    const first = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    recordIncrementalState(phase1OutputsDir, first.currentGraphSha);

    // Mutate the graph DB → SHA changes.
    writeFileSync(graphDbPath, 'different-graph-bytes', 'utf-8');
    const second = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    expect(second.canSkip).toBe(false);
    expect(second.reason).toMatch(/graph SHA changed/);
  });

  it('returns canSkip=false when a prior output file is missing', () => {
    writeFileSync(graphDbPath, 'graph-bytes', 'utf-8');
    writeAllPhase1Outputs();
    const first = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    recordIncrementalState(phase1OutputsDir, first.currentGraphSha);

    // Wipe one of the four outputs.
    rmSync(join(phase1OutputsDir, '02-tech-stack-dependencies.json'));

    const second = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    expect(second.canSkip).toBe(false);
    expect(second.reason).toMatch(/prior output missing.*02-tech-stack-dependencies/);
  });

  it('returns canSkip=false when the state file is malformed', () => {
    writeFileSync(graphDbPath, 'graph-bytes', 'utf-8');
    writeAllPhase1Outputs();
    writeFileSync(join(phase1OutputsDir, '.incremental-state.json'), 'not json', 'utf-8');
    const result = checkIncrementalEligibility(graphDbPath, phase1OutputsDir, { enabled: true });
    expect(result.canSkip).toBe(false);
    expect(result.reason).toMatch(/unreadable.*malformed/);
  });
});

describe('recordIncrementalState', () => {
  it('writes a JSON state file with graphSha + recordedAt + outputs', () => {
    recordIncrementalState(phase1OutputsDir, 'abc123');
    const stateFile = join(phase1OutputsDir, '.incremental-state.json');
    const parsed = JSON.parse(readFileSync(stateFile, 'utf-8'));
    expect(parsed.graphSha).toBe('abc123');
    expect(typeof parsed.recordedAt).toBe('string');
    expect(parsed.outputs).toHaveProperty('01-structure-architecture.json');
    expect(parsed.outputs).toHaveProperty('02-tech-stack-dependencies.json');
    expect(parsed.outputs).toHaveProperty('03-code-patterns-testing.json');
    expect(parsed.outputs).toHaveProperty('04-data-flows-integrations.json');
  });

  it('creates the outputs directory if it does not exist', () => {
    const fresh = join(tempDir, 'new-dir');
    recordIncrementalState(fresh, 'xyz');
    expect(readFileSync(join(fresh, '.incremental-state.json'), 'utf-8')).toContain('xyz');
  });

  it('no-ops when graphSha is empty (defensive)', () => {
    recordIncrementalState(phase1OutputsDir, '');
    const stateFile = join(phase1OutputsDir, '.incremental-state.json');
    expect(() => readFileSync(stateFile, 'utf-8')).toThrow();
  });
});
