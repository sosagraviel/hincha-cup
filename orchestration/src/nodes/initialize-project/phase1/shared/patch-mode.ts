/**
 * JSON Merge Patch (RFC 7396) infrastructure for Phase 1 analyzer outputs.
 *
 * The Phase 1 analyzers emit large JSON blobs (10–100 KB) that often need a
 * single field correction after stop-hook validation. Re-emitting the entire
 * blob costs 80–300 s of decode per retry. Patch mode lets the model send only
 * the diff in a deterministic envelope; the framework merges it into the
 * previous attempt's parsed output and re-validates.
 *
 * Envelope format (emitted by the model when the framework signals PATCH MODE):
 *
 *   {
 *     "_patch_format": "RFC7396",
 *     "_patch_target_agent": "structure-architecture-analyzer",
 *     "_patch": { ...changes... }
 *   }
 *
 * The `_patch_target_agent` field is the analyzer name; the framework uses it
 * to locate the baseline file under `phase1-outputs/`. The model copies it
 * verbatim from the analyzer prompt.
 *
 * Inside `_patch`, the rules of RFC 7396 apply:
 *   - Each key replaces (or sets) the same key in the target.
 *   - To delete a key, set it to `null`.
 *   - Arrays are replaced wholesale (no positional merge).
 *
 * Stack-agnostic by construction — the patch format does not encode any
 * project-shape assumptions; it operates over arbitrary JSON.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Envelope shape detected by `isPatchEnvelope`. The `_patch_format` token is
 * versioned so we can evolve the format without breaking earlier model
 * outputs.
 */
export interface PatchEnvelope {
  _patch_format: 'RFC7396';
  _patch_target_agent: string;
  _patch: Record<string, unknown>;
}

/**
 * Returns true when `data` matches the patch envelope shape exactly. We
 * deliberately require the literal `_patch_format` token so we never
 * misinterpret a malformed analyzer output as a patch.
 */
export function isPatchEnvelope(data: unknown): data is PatchEnvelope {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const rec = data as Record<string, unknown>;
  if (rec['_patch_format'] !== 'RFC7396') return false;
  if (typeof rec['_patch_target_agent'] !== 'string' || rec['_patch_target_agent'].length === 0) {
    return false;
  }
  const patch = rec['_patch'];
  return typeof patch === 'object' && patch !== null && !Array.isArray(patch);
}

/**
 * Build the PATCH MODE feedback block the framework appends to the stop-hook
 * rejection message after a baseline already exists. Inserts the absolute
 * baseline path AND the baseline's lifecycle stage so the model knows
 * whether the saved blob already passed schema validation.
 *
 * Returned string is empty when `baselinePath` is empty — caller short-circuits
 * on first-attempt failures where no baseline exists yet.
 */
export function buildPatchModeFeedback(
  baselinePath: string,
  agentName: string,
  stage: PatchBaselineStage = 'fully-clean',
): string {
  if (!baselinePath) return '';
  const stageNote =
    stage === 'partial'
      ? 'Baseline stage: PARTIAL — your previous output was parseable JSON but ' +
        'failed schema validation. Your patch must correct the schema-violating ' +
        'field(s) AND keep the rest of the structure intact.'
      : stage === 'schema-clean'
        ? 'Baseline stage: SCHEMA-CLEAN — your previous output passed Zod ' +
          'validation but failed a post-schema gate (needs_verification, port ' +
          'discovery, etc.). Your patch fixes the offending field(s) only.'
        : 'Baseline stage: FULLY-CLEAN — your previous output was fully accepted ' +
          'in an earlier attempt. The current rejection is on a re-emission.';
  return [
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'PATCH MODE — emit ONLY the diff next attempt',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    stageNote,
    '',
    'The framework saved your previous parsed output as the patch baseline at:',
    `  ${baselinePath}`,
    '',
    'Instead of regenerating the full JSON, emit a JSON-merge-patch envelope:',
    '',
    '  {',
    '    "_patch_format": "RFC7396",',
    `    "_patch_target_agent": "${agentName}",`,
    '    "_patch": {',
    '      "<dotted.path or top-level field>": <new value>',
    '      // To delete a key set its value to null',
    '      // Arrays are replaced wholesale (no positional merge)',
    '    }',
    '  }',
    '',
    'Rules:',
    '  - The envelope MUST be your only top-level JSON; no narration before/after.',
    '  - Include ONLY the keys that need to change relative to the baseline.',
    '  - Nested objects merge per RFC 7396; arrays replace.',
    '  - Set a value to null to remove that key from the baseline.',
    '',
    'If the issue requires a structural rewrite (new top-level layout), emit',
    'the COMPLETE output JSON (no envelope) and the framework will adopt it',
    'as a new baseline.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

/**
 * Apply a JSON Merge Patch (RFC 7396) to a target document. Returns a new
 * object — the inputs are not mutated.
 *
 * Semantics:
 *   - target is an object, patch is an object: recursive merge.
 *   - patch[key] === null: delete target[key].
 *   - patch[key] is a scalar / array / non-null object: replace target[key].
 *   - When patch itself is a non-object scalar/array, it replaces target wholesale.
 *
 * Inputs are JSON values (already parsed). The function never reads files or
 * performs network calls.
 */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null) return null;
  if (patch === undefined) return target;
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  const base: Record<string, unknown> =
    target && typeof target === 'object' && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === null) {
      delete base[key];
      continue;
    }
    base[key] = applyMergePatch(base[key], value);
  }
  return base;
}

/**
 * Deterministic on-disk locations for the patch-mode bookkeeping artefacts of
 * one Phase 1 analyzer. The baseline file holds the most-recent successfully
 * parsed JSON; subsequent patch envelopes merge against it.
 *
 * Lives next to the canonical analyzer output (`phase1-outputs/<id>.json`) so
 * an operator inspecting a run sees both files in the same directory.
 */
export interface PatchPaths {
  baselinePath: string;
}

/**
 * Canonical filename suffix for the patch baseline. Keeping a dedicated suffix
 * (vs. `.attempt-N.json`) makes the file's role obvious and avoids races with
 * the existing attempt-N artefacts that `enhanced-retry` writes.
 */
export const PATCH_BASELINE_SUFFIX = '.patch-baseline.json';

/**
 * Map an analyzer name to the output filename used in `phase1-outputs/`. The
 * mapping mirrors the literal filenames used by each analyzer node.
 */
const AGENT_TO_OUTPUT_FILENAME: Record<string, string> = {
  'structure-architecture-analyzer': '01-structure-architecture.json',
  'tech-stack-dependencies-analyzer': '02-tech-stack-dependencies.json',
  'code-patterns-testing-analyzer': '03-code-patterns-testing.json',
  'data-flows-integrations-analyzer': '04-data-flows-integrations.json',
};

/**
 * Resolve patch-mode artefact paths for `agentName` under `tempDir`.
 *
 * `tempDir` is the same `<project>/.claude-temp/initialize-project/` (or
 * codex variant) that analyzer nodes already use. The baseline lives at
 * `<tempDir>/phase1-outputs/<agent-output-filename>.patch-baseline.json`.
 *
 * Unknown agent names fall back to `<agentName>.patch-baseline.json` so the
 * helper never throws — callers that need to know the agent is unsupported
 * inspect `getPatchPaths(...).baselinePath` for a sane filename.
 */
export function getPatchPaths(tempDir: string, agentName: string): PatchPaths {
  const outputFilename = AGENT_TO_OUTPUT_FILENAME[agentName] ?? `${agentName}.json`;
  return {
    baselinePath: join(tempDir, 'phase1-outputs', `${outputFilename}${PATCH_BASELINE_SUFFIX}`),
  };
}

/**
 * Lifecycle stage tagged on the baseline file. The stop hook writes each
 * stage as soon as the corresponding gate clears:
 *
 *   - `partial`      — JSON parsed but Zod schema not yet validated. Lets a
 *                      schema-failing retry still patch against the parsed
 *                      shape.
 *   - `schema-clean` — Zod schema validated successfully; post-schema gates
 *                      (needs_verification prose, automation completeness,
 *                      port discovery, judgment fields, …) not yet run.
 *   - `fully-clean`  — every gate has passed. This baseline matches what
 *                      Phase 2 consumes.
 */
export type PatchBaselineStage = 'partial' | 'schema-clean' | 'fully-clean';

/**
 * The on-disk shape of a patch-baseline file. Authoritative `data` payload
 * plus metadata; the model never sees this wrapper — it's framework-internal.
 */
export interface PatchBaselineFile {
  _stage: PatchBaselineStage;
  _written_at: string;
  data: unknown;
}

/**
 * Persist `data` as the baseline for the next patch attempt. Best-effort;
 * a write failure logs but does NOT abort the agent run. The on-disk file
 * carries the `_stage` tag (see `PatchBaselineStage`) so the next retry's
 * PATCH MODE feedback can tell the model whether the prior baseline already
 * passed schema or not.
 */
export function writePatchBaseline(
  baselinePath: string,
  data: unknown,
  stage: PatchBaselineStage = 'fully-clean',
): void {
  try {
    mkdirSync(dirname(baselinePath), { recursive: true });
    const wrapper: PatchBaselineFile = {
      _stage: stage,
      _written_at: new Date().toISOString(),
      data,
    };
    writeFileSync(baselinePath, JSON.stringify(wrapper, null, 2), 'utf-8');
  } catch {
    // Non-fatal — the next attempt simply won't have a baseline to patch
    // against, and the framework will emit a fresh-full-output prompt.
  }
}

/**
 * Load the previous baseline. Returns `undefined` when the file is missing
 * or malformed. The caller treats `undefined` as "no prior attempt — patches
 * are unsupported until a full output is accepted."
 *
 * Backwards-compatible with the pre-stage baseline format (raw `data` payload
 * with no `_stage` wrapper) — old files load as `{ stage: 'fully-clean', data }`.
 */
export function readPatchBaseline(
  baselinePath: string,
): { data: unknown; stage: PatchBaselineStage } | undefined {
  if (!existsSync(baselinePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(baselinePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && '_stage' in parsed && 'data' in parsed) {
      const wrapper = parsed as PatchBaselineFile;
      return { data: wrapper.data, stage: wrapper._stage };
    }
    return { data: parsed, stage: 'fully-clean' };
  } catch {
    return undefined;
  }
}

/**
 * Maximum cumulative output-token count a single agent session may emit
 * before the framework treats the run as a regeneration runaway and aborts
 * (surfaced as `regeneration_runaway` warning). The cap is high enough to
 * cover one healthy full-output emit on the largest realistic projects, but
 * low enough that 4–5 full regenerations trigger the abort.
 */
export const MAX_AGENT_OUTPUT_TOKENS = 30_000;
