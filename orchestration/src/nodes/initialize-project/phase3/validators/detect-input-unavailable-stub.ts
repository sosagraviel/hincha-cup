/**
 * Rejects "input unavailable" apology stubs in synthesis output.
 *
 * When a composer view is empty or incomplete, the synthesizer may emit
 * phrases like "Insufficient data to complete this section" instead of
 * simply omitting the H2. This validator detects those stubs and returns
 * feedback telling the agent to skip the section entirely.
 *
 * Stack-agnostic: matches English-language framework-emitted phrases only.
 * Stack-specific findings (e.g. "no Laravel routes detected") are not
 * rejected here.
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
