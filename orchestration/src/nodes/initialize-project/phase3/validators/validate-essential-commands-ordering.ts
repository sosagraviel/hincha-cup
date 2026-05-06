/**
 * Plan 15 §D.8.2 — hard validator: `Essential Commands` MUST list
 * wrapper-tier rows before package_manager-tier rows for the same
 * operation.
 *
 * The closed-book synthesizer receives a pre-built `command_catalog`
 * with deterministic tier ordering. If the rendered CLAUDE.md ends
 * up listing `pnpm --filter backend test` BEFORE `make tests` (when
 * both exist in the catalog), this validator fires and the agent
 * retries with feedback.
 *
 * Stack-agnostic: operates on `command_catalog` entries, not on
 * specific tools. Works the same for Make/Just/Task/script wrappers
 * and any package-manager fallback.
 */

import type {
  CommandCatalog,
  CommandCatalogEntry,
  CommandCatalogOperation,
} from '../../../../schemas/stack-profile.schema.js';

export interface OrderingViolation {
  operation: CommandCatalogOperation;
  wrapper_command: string;
  wrapper_line: number; // 1-based, or -1 if absent
  offending_command: string;
  offending_line: number; // 1-based
}

/**
 * Validate that for every operation with both wrapper-tier and
 * package_manager-tier candidates, the wrapper appears in the
 * CLAUDE.md body BEFORE any package-manager candidate.
 *
 * Returns an array of violations. Empty array = valid.
 */
export function detectEssentialCommandsOrderingViolations(
  claudeMdBody: string,
  catalog: CommandCatalog,
): OrderingViolation[] {
  const violations: OrderingViolation[] = [];
  const lines = claudeMdBody.split('\n');

  for (const [op, entries] of Object.entries(catalog) as Array<
    [CommandCatalogOperation, CommandCatalogEntry[]]
  >) {
    const wrappers = entries.filter((e) => e.tier === 'wrapper');
    const pkgs = entries.filter((e) => e.tier === 'package_manager');
    if (wrappers.length === 0 || pkgs.length === 0) continue;

    // First-occurrence line index for any wrapper command on this op.
    // We use the SHORTEST wrapper line as the bar — if the wrapper is
    // absent entirely we cannot conclude the synthesizer omitted it
    // legitimately (it might be unrendered for valid reasons), so we
    // skip the check for that case rather than over-fire.
    const wrapperLine = firstLineContainingAny(
      lines,
      wrappers.map((w) => w.command),
    );
    if (wrapperLine === -1) continue;

    for (const pkg of pkgs) {
      const pkgLine = firstLineContaining(lines, pkg.command);
      if (pkgLine === -1) continue; // synthesizer omitted this fallback — fine
      if (pkgLine < wrapperLine) {
        violations.push({
          operation: op,
          wrapper_command: matchingWrapperFor(wrappers, lines, wrapperLine),
          wrapper_line: wrapperLine + 1, // 1-based for human-readable reports
          offending_command: pkg.command,
          offending_line: pkgLine + 1,
        });
      }
    }
  }

  return violations;
}

/**
 * Format a list of violations as agent-facing retry feedback.
 *
 * Returned as `string[]` of lines so it can be appended directly
 * to the existing synthesis validator's error array.
 */
export function formatOrderingViolations(violations: OrderingViolation[]): string[] {
  if (violations.length === 0) return [];

  const out: string[] = [
    'ESSENTIAL COMMANDS ORDERING VIOLATION',
    '',
    '🔴 WHAT WENT WRONG:',
    '   The Essential Commands section lists package-manager commands BEFORE',
    '   their wrapper equivalents for the same operation. The framework built',
    '   a `command_catalog` with explicit tier ordering — wrapper > readme >',
    '   package_manager > ci — and you must render that ordering verbatim.',
    '',
    '🟡 SPECIFIC VIOLATIONS:',
  ];
  for (const v of violations) {
    out.push(
      `   • Operation \`${v.operation}\`: \`${v.offending_command}\` appears at ` +
        `line ${v.offending_line}, before the wrapper \`${v.wrapper_command}\` ` +
        `at line ${v.wrapper_line}.`,
    );
  }
  out.push(
    '',
    '🟢 HOW TO FIX:',
    '   Re-render the Essential Commands table grouping rows by tier:',
    '     1. Wrapper-tier rows first (Make / Just / Task targets, scripts).',
    '     2. Then a "Per-service commands (low-level)" subtable for the',
    '        package-manager fallbacks, prefixed with the warning sentence',
    '        from synthesis-instructions.md §"Essential Commands rendering rule".',
    '',
    '   Do NOT delete or reorder package-manager commands — keep them, but',
    '   move them BELOW the wrapper rows.',
  );
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstLineContaining(lines: string[], needle: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i;
  }
  return -1;
}

function firstLineContainingAny(lines: string[], needles: string[]): number {
  let earliest = -1;
  for (const needle of needles) {
    const idx = firstLineContaining(lines, needle);
    if (idx === -1) continue;
    if (earliest === -1 || idx < earliest) earliest = idx;
  }
  return earliest;
}

function matchingWrapperFor(
  wrappers: CommandCatalogEntry[],
  lines: string[],
  wrapperLineIndex: number,
): string {
  // Return the wrapper command whose first occurrence is on this line
  // (used to make the violation message specific).
  for (const w of wrappers) {
    if (lines[wrapperLineIndex]?.includes(w.command)) return w.command;
  }
  return wrappers[0]?.command ?? '<wrapper>';
}
