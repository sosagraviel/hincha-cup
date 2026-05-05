/**
 * Soft warnings for wiki-generator output. Plan §C 3.1 of the
 * gira-exhaustive followup (2026-05-05).
 *
 * Unlike `validateWikiOutput` (which hard-fails the agent's Stop), these
 * checks return non-blocking warnings. They surface in the run's debug
 * report but do not cause the agent to retry. The intent is observability
 * for trends across many runs without breaking outputs that would be
 * acceptable in isolation.
 *
 * Stack-agnostic: every check operates on the agent's text + a list of
 * service IDs. No language, framework, or repo-shape assumption — the
 * service IDs are agent-discovered community names, independent of stack.
 */

export interface WikiSoftWarning {
  /** Stable code so consumers can switch on it. */
  code: 'low_wikilink_density';
  message: string;
}

/**
 * `low_wikilink_density` fires when a page references a known service ID
 * (plain text, case-sensitive on the id) MORE THAN 2 TIMES yet has ZERO
 * wikilinks (`[[id]]`) for that id anywhere in the body. Mentioning a
 * service three times without ever linking it to its per-service doc is a
 * sign the agent ignored the wikilink instruction in the architecture
 * spec's prompt focus.
 *
 * Configurable threshold so tests can drive it deterministically; default
 * matches the plan (>2 plain-text mentions, 0 wikilinks).
 */
export function computeWikiSoftWarnings(
  text: string,
  serviceIds: string[],
  options: { plainMentionThreshold?: number } = {},
): WikiSoftWarning[] {
  const warnings: WikiSoftWarning[] = [];
  const threshold = options.plainMentionThreshold ?? 2;

  const offenders: Array<{ id: string; plain: number }> = [];
  for (const id of serviceIds) {
    if (typeof id !== 'string' || id.length === 0) continue;

    // Count `[[id]]` (case-sensitive). Anchor on the brackets so we
    // don't false-positive on prose mentioning "[[" elsewhere.
    const wikilinkCount = countMatches(text, new RegExp(`\\[\\[${escapeRegex(id)}\\]\\]`, 'g'));
    if (wikilinkCount > 0) continue;

    // Plain text mentions exclude hits inside `[[...]]` and inside
    // backtick code spans / fenced blocks (those are legitimate code,
    // not prose). Word-boundary on each side so `web` doesn't match
    // `webhook`.
    const plain = countPlainTextMentions(text, id);
    if (plain > threshold) {
      offenders.push({ id, plain });
    }
  }

  if (offenders.length > 0) {
    const list = offenders.map(({ id, plain }) => `${id} (${plain} plain mentions)`).join(', ');
    warnings.push({
      code: 'low_wikilink_density',
      message: `Page mentions service id(s) ${list} more than ${threshold} times without any [[wikilink]]. Wrap the first mention of each id in [[<id>]] so the rendered page navigates to services/<id>.md.`,
    });
  }

  return warnings;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(text: string, pattern: RegExp): number {
  let count = 0;
  for (const _ of text.matchAll(pattern)) count += 1;
  return count;
}

/**
 * Count plain-text mentions of `id` in `text`, EXCLUDING:
 *   - mentions inside `[[...]]` (those are wikilinks, by definition);
 *   - mentions inside backtick spans (`...`);
 *   - mentions inside fenced code blocks.
 *
 * Word-boundary aware on both sides so `api` does not match `apiary`
 * or `legacy-api-v2` (the latter is a different identifier than `api`).
 */
function countPlainTextMentions(text: string, id: string): number {
  const stripped = stripCodeAndWikilinks(text);
  const pattern = new RegExp(`(?<![\\w-])${escapeRegex(id)}(?![\\w-])`, 'g');
  return countMatches(stripped, pattern);
}

function stripCodeAndWikilinks(text: string): string {
  // Drop fenced code blocks first (multiline).
  let out = text.replace(/```[\s\S]*?```/g, '');
  // Then inline backtick spans.
  out = out.replace(/`[^`]*`/g, '');
  // Then `[[...]]` wikilinks (we counted them separately).
  out = out.replace(/\[\[[^\]]+\]\]/g, '');
  return out;
}
