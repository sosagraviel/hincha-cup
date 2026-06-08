import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { contextVerificationNode } from '../../../../../src/nodes/initialize-project/phase3_5/context-verification.node.js';
import type { InitializeProjectState } from '../../../../../src/state/schemas/initialize-project.schema.js';

/**
 * The Phase 3.5 verifier is best-effort and non-blocking. These tests cover the
 * fast skip paths that require no agent runtime: nothing to verify on disk, and
 * a synthesis blob with no cheat-sheet section. In both cases the node must
 * return without throwing and without mutating the Phase 3 output.
 */

function makeState(tempDir: string): InitializeProjectState {
  return {
    project_path: tempDir,
    framework_path: tempDir,
    current_phase: 'phase3_synthesis',
    errors: [],
    warnings: [],
    phase1_retry_tracking: {},
    temp_dir: tempDir,
  } as InitializeProjectState;
}

describe('contextVerificationNode (best-effort skip paths)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-verify-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns an empty update when there is no synthesis on disk', async () => {
    const result = await contextVerificationNode(makeState(tempDir));
    expect(result).toEqual({});
  });

  it('returns an empty update when the synthesis blob has no cheat-sheet section', async () => {
    writeFileSync(
      join(tempDir, 'synthesis-raw.md'),
      '# Architectural Narrative Content\n\nNo cheat sheet here.',
    );
    const result = await contextVerificationNode(makeState(tempDir));
    expect(result).toEqual({});
  });
});
