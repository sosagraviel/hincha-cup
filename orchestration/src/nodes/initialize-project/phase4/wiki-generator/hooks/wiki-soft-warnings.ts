/**
 * Soft warnings for wiki-generator output.
 *
 * Unlike `validateWikiOutput` (which hard-fails the agent's Stop), these checks return
 * non-blocking warnings. They surface in the run's debug report but do not cause retries.
 *
 * Stack-agnostic: every check operates on the agent's text + a list of service IDs.
 */

export interface WikiSoftWarning {
  /** Stable code so consumers can switch on it. */
  code: 'low_wikilink_density';
  message: string;
}

/**
 * Fires when a page references a service ID more than `threshold` times in plain text
 * yet has zero wikilinks (`[[id]]`) for that ID. Configurable threshold; default is 2.
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

    const wikilinkCount = countMatches(text, new RegExp(`\\[\\[${escapeRegex(id)}\\]\\]`, 'g'));
    if (wikilinkCount > 0) continue;

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
  let out = text.replace(/```[\s\S]*?```/g, '');
  out = out.replace(/`[^`]*`/g, '');
  out = out.replace(/\[\[[^\]]+\]\]/g, '');
  return out;
}
