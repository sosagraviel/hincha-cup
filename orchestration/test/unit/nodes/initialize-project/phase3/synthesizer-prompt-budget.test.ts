/**
 * Plan v4 Phase H — synthesizer prompt-size budget.
 *
 * The synthesizer's static instruction body (`synthesis-instructions.md`)
 * lands inside every Phase 3 prompt. With composer views (Phase E +
 * Phase F) the synthesizer no longer needs the open-book "Read code,
 * walk the tree, decide" guidance that bloated the file historically.
 *
 * Plan v4 §H acceptance: synthesizer first-attempt prompt ≤ 7 KB. Today
 * the static instruction body is ~26 KB (with consolidation JSON +
 * provider override appended at runtime). The eventual ≤ 7 KB target
 * is achieved by Phase H's *content* slim — moving the per-output
 * recipe to a Read-on-demand resource (analogue of v3 §F.1 cookbook
 * move) and trimming the open-book branches Phase F's path-restriction
 * hook now blocks anyway.
 *
 * For now this test ratchets the upper bound at the current measured
 * size (~26.4 KB) so any silent regrowth fails. Subsequent ratchets
 * lower this number as Phase H's content cuts land.
 */

import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const SYNTHESIS_INSTRUCTIONS = join(
  __dirname,
  '../../../../../src/nodes/initialize-project/phase3/prompts/synthesis-instructions.md',
);

const SYNTHESIS_AGENT_FRONTMATTER = join(
  __dirname,
  '../../../../../src/nodes/initialize-project/phase3/prompts/agent.md',
);

describe('synthesizer prompt-size budget — Plan v4 Phase H ratchet', () => {
  it('synthesis-instructions.md stays under the current ratchet (≤ 27 KB)', () => {
    const size = statSync(SYNTHESIS_INSTRUCTIONS).size;
    // Current measured size: 26369. Ratchet at 27 KB so future small
    // edits have headroom but a 1 KB regrowth fails the test.
    // The eventual Phase H target is ≤ 7 KB — see file header.
    expect(size).toBeLessThanOrEqual(27000);
  });

  it('agent.md frontmatter prompt stays compact (≤ 4 KB)', () => {
    // The agent.md is the static role prompt — frontmatter + role
    // description. It does NOT contain step-by-step instructions
    // (those live in synthesis-instructions.md). Keep it minimal.
    const size = statSync(SYNTHESIS_AGENT_FRONTMATTER).size;
    expect(size).toBeLessThanOrEqual(4000);
  });

  it("synthesis-instructions.md does NOT mention open-book Read patterns Phase F's hook now blocks", () => {
    // Plan v4 Phase F's restrict-synthesizer-reads hook rejects Read
    // outside <tempDir>/ + every Glob/Bash/Write/Edit/MultiEdit/LS/
    // NotebookEdit. Any "you may walk the source tree" / "Glob the
    // services directory" guidance in the instructions is now
    // contradictory and confusing for the agent.
    const body = readFileSync(SYNTHESIS_INSTRUCTIONS, 'utf-8');

    // Anti-regression — these phrases historically encouraged the
    // synthesizer to investigate the source tree. Phase F made them
    // structurally impossible; the prompt should not mention them.
    expect(body).not.toMatch(/walk\s+the\s+(source|project)\s+tree/i);
    expect(body).not.toMatch(/glob\s+the\s+services\s+directory/i);
    expect(body).not.toMatch(/you\s+may\s+(read|walk)\s+any\s+file/i);
  });
});
