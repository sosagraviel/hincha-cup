/**
 * Canonical texts for Phase 1 analyzer prompts (plan §G, 2026-05-05).
 *
 * The cache-eligible prefix built by `buildPhase1SharedPrefix` is
 * byte-identical across all four analyzer prompts. That guarantee is
 * what unlocks Anthropic's automatic prompt cache — but it only holds
 * as long as the canonical text blocks live in ONE place. The moment
 * an analyzer's `agent.md` or `execution-instructions.md` re-states
 * any of the constants below verbatim, the prefix grows, the body
 * shrinks, and the same content is paid for twice.
 *
 * This module is the single source of truth for the canonical
 * fragments. The regression test in
 * `test/unit/nodes/initialize-project/phase1/shared/canonical-texts.test.ts`
 * scans every Phase 1 analyzer prompt file to confirm none of these
 * fragments leak in.
 *
 * Re-exports from `services/graph-wiki/graph-navigation-discipline`
 * are also gathered here so callers have a single import surface.
 */

export {
  GRAPH_NAVIGATION_DISCIPLINE_HEADING,
  GRAPH_NAVIGATION_DISCIPLINE_TEXT,
} from '../../../../services/graph-wiki/graph-navigation-discipline.js';

/**
 * Sentinel fragments that, if found in any analyzer's `agent.md` or
 * `execution-instructions.md`, indicate accidental duplication of
 * canonical content. The test in `canonical-texts.test.ts` greps each
 * analyzer prompt for these strings and fails with a pointer to the
 * canonical home.
 *
 * Add a fragment here whenever you move shared content into the
 * cache-eligible prefix or into `graph-navigation-discipline.ts`.
 * Keep each fragment SHORT and DISTINCTIVE — a substring that would
 * never legitimately appear in an analyzer-specific body.
 */
export const FORBIDDEN_FRAGMENTS_IN_ANALYZER_PROMPTS: ReadonlyArray<{
  readonly fragment: string;
  readonly canonicalHome: string;
  readonly rationale: string;
}> = [
  {
    fragment: 'Top-down, never breadth-first',
    canonicalHome:
      'orchestration/src/services/graph-wiki/graph-navigation-discipline.ts (GRAPH_NAVIGATION_DISCIPLINE_TEXT)',
    rationale:
      'The graph navigation discipline body is templated into the cache-eligible prefix via the CODE GRAPH CONTEXT block. Analyzer prompts must reference it indirectly ("see the discipline in your system prompt"); restating any line breaks byte-determinism.',
  },
  {
    fragment: 'tool_use_error: No such tool available',
    canonicalHome:
      'orchestration/src/services/graph-wiki/graph-navigation-discipline.ts (first-call startup race)',
    rationale:
      'The first-call startup-race retry guidance is part of the discipline body. Analyzer prompts must NOT inline a second copy.',
  },
  {
    // Use a distinctive line from the rendered body, not the bare
    // tag — analyzer prompts may legitimately *reference* the block
    // (e.g. "see the <excluded_directories> block in your prefix")
    // without re-emitting the body.
    fragment: 'The directories below are off-limits',
    canonicalHome:
      'orchestration/src/utils/shared/context-tags.ts (buildExcludedDirsTag) — emitted from the cache-eligible prefix.',
    rationale:
      'The excluded-directories block body is rendered into the prefix once per init run. Analyzer prompts may reference the block name; they MUST NOT inline the body.',
  },
];
