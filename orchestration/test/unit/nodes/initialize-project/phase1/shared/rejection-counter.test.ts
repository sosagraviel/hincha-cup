import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REJECTION_AUTO_DOWNGRADE_THRESHOLD,
  recordRejection,
  shouldAutoDowngrade,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/rejection-counter.js';

describe('rejection-counter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'rejection-counter-'));
    mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('starts at 0 for a fresh (agent, code) pair', () => {
    expect(shouldAutoDowngrade(tempDir, 'structure-architecture-analyzer', 'E068')).toBe(false);
  });

  it('increments the counter and persists across calls', () => {
    expect(recordRejection(tempDir, 'data-flows-integrations-analyzer', 'E068')).toBe(1);
    expect(recordRejection(tempDir, 'data-flows-integrations-analyzer', 'E068')).toBe(2);
    expect(recordRejection(tempDir, 'data-flows-integrations-analyzer', 'E068')).toBe(3);
  });

  it('returns true from shouldAutoDowngrade once the threshold is reached', () => {
    for (let i = 0; i < REJECTION_AUTO_DOWNGRADE_THRESHOLD; i++) {
      recordRejection(tempDir, 'code-patterns-testing-analyzer', 'E061');
    }
    expect(shouldAutoDowngrade(tempDir, 'code-patterns-testing-analyzer', 'E061')).toBe(true);
  });

  it('keeps per-(agent, code) state isolated', () => {
    // Record exactly threshold hits on (a, E060) — should downgrade.
    for (let i = 0; i < REJECTION_AUTO_DOWNGRADE_THRESHOLD; i++) {
      recordRejection(tempDir, 'a', 'E060');
    }
    // (a, E061) and (b, E060) have zero recordings — must NOT downgrade.
    expect(shouldAutoDowngrade(tempDir, 'a', 'E060')).toBe(true);
    expect(shouldAutoDowngrade(tempDir, 'a', 'E061')).toBe(false);
    expect(shouldAutoDowngrade(tempDir, 'b', 'E060')).toBe(false);
  });

  it('writes a JSON file next to phase1-outputs/<agent-output>.json', () => {
    recordRejection(tempDir, 'structure-architecture-analyzer', 'E068');
    const expectedPath = join(
      tempDir,
      'phase1-outputs',
      '01-structure-architecture.json.rejection-count.json',
    );
    expect(existsSync(expectedPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(expectedPath, 'utf-8'));
    expect(parsed).toEqual({ E068: 1 });
  });

  it('returns false from shouldAutoDowngrade when tempDir or agent or code is empty', () => {
    expect(shouldAutoDowngrade('', 'agent', 'code')).toBe(false);
    expect(shouldAutoDowngrade(tempDir, '', 'code')).toBe(false);
    expect(shouldAutoDowngrade(tempDir, 'agent', '')).toBe(false);
  });

  it('recovers gracefully from a malformed counter file', () => {
    const p = join(
      tempDir,
      'phase1-outputs',
      '01-structure-architecture.json.rejection-count.json',
    );
    require('fs').writeFileSync(p, '{not valid json', 'utf-8');
    expect(shouldAutoDowngrade(tempDir, 'structure-architecture-analyzer', 'E068')).toBe(false);
    expect(recordRejection(tempDir, 'structure-architecture-analyzer', 'E068')).toBe(1);
  });
});
