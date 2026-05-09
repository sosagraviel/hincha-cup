/**
 * Plan v4 Phase F — reject "input unavailable" stub markers.
 *
 * Pre-fix the synthesizer would, on a missing composer view or
 * incomplete consolidation, write an apology stub like
 *
 *   > Insufficient data to complete this section.
 *
 * straight into the operator's CLAUDE.md / SKILL.md. The deny rule
 * fix (Plan v4 Phase A.1) closed the most common cause, but the
 * agent can still reach for the apology when a section's underlying
 * `present.<flag>` is false. This validator is the second-line
 * defence — it rejects the apology with feedback telling the agent
 * to skip the H2 entirely, not stub it.
 *
 * Stack-agnostic: the regex matches English-language framework-
 * emitted phrases the agent might mimic. Stack-specific stubs
 * (e.g. "no Laravel routes detected") are NOT rejected here — they
 * may be legitimate findings from the analyzer.
 */

const STUB_PHRASES: ReadonlyArray<RegExp> = [
  /\binsufficient\s+(data|information|context)\b/i,
  /\bdata\s+(is\s+)?(unavailable|not\s+available|missing)\b/i,
  /\binformation\s+(is\s+)?(unavailable|not\s+available|missing)\b/i,
  /\bunable\s+to\s+(determine|complete\s+this\s+section)\b/i,
  /\bcould\s+not\s+(determine|extract|find\s+enough)\b/i,
];

export function detectInputUnavailableStub(body: string): string | null {
  if (!body || body.trim().length === 0) return null;
  for (const re of STUB_PHRASES) {
    const match = body.match(re);
    if (!match) continue;
    return [
      `INPUT-UNAVAILABLE STUB DETECTED: "${match[0]}"`,
      '',
      '🔴 WHAT WENT WRONG:',
      '   You emitted an apology stub instead of a real section. The framework',
      "   never wants placeholder text in the operator's CLAUDE.md / SKILL.md.",
      '',
      '🟢 HOW TO FIX:',
      "   When a composer view's `present.<flag>` is false, SKIP the H2 entirely.",
      '   Emit a section header only when the input view has data to render.',
      '   Do NOT emit "Insufficient data", "Unable to determine", "Information not',
      '   available", "Could not extract", or any similar framework-emitted apology.',
    ].join('\n');
  }
  return null;
}
