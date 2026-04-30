/**
 * Provider-aware placeholder substitution for skill files.
 *
 * Source skills under `skills/**` may contain `{{PLACEHOLDER}}` tokens that
 * Phase 5 (and the sync script) replace with provider-specific values before
 * writing into the target project's config directory.
 *
 * Why: Most skills only diverge between providers in paths (`.claude-temp/`
 * vs `.codex-temp/`) and the instruction-file name (`CLAUDE.md` vs
 * `AGENTS.md`). Templating keeps those skills in a single source file instead
 * of forcing a `.claude.md` / `.codex.md` split.
 *
 * Rule: Unknown placeholders throw — fail closed so authoring typos are
 * caught at copy time instead of shipping a literal `{{FOO}}` to a user.
 */
import { Provider } from '../providers/types.js';

export type PlaceholderKey = 'TEMP_DIR' | 'CONFIG_DIR' | 'INSTRUCTION_FILE' | 'PROVIDER_NAME';

type PlaceholderMap = Record<PlaceholderKey, Record<Provider, string>>;

export const PLACEHOLDERS: PlaceholderMap = {
  TEMP_DIR: {
    [Provider.CLAUDE]: '.claude-temp',
    [Provider.CODEX]: '.codex-temp',
  },
  CONFIG_DIR: {
    [Provider.CLAUDE]: '.claude',
    [Provider.CODEX]: '.codex',
  },
  INSTRUCTION_FILE: {
    [Provider.CLAUDE]: 'CLAUDE.md',
    [Provider.CODEX]: 'AGENTS.md',
  },
  PROVIDER_NAME: {
    [Provider.CLAUDE]: 'Claude Code',
    [Provider.CODEX]: 'Codex CLI',
  },
};

const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/**
 * Replace `{{PLACEHOLDER}}` tokens with provider-specific values.
 *
 * @param content - Raw skill file content (may contain placeholders)
 * @param provider - Provider whose values should be substituted in
 * @returns Content with all known placeholders replaced
 * @throws Error when an unknown placeholder appears — prevents silent shipping
 *   of a typo as a literal `{{FOO}}`.
 */
export function substitutePlaceholders(content: string, provider: Provider): string {
  const unknown = new Set<string>();

  const result = content.replace(PLACEHOLDER_PATTERN, (match, rawKey: string) => {
    const key = rawKey as PlaceholderKey;
    const entry = PLACEHOLDERS[key];
    if (!entry) {
      unknown.add(rawKey);
      return match;
    }
    return entry[provider];
  });

  if (unknown.size > 0) {
    const keys = Array.from(unknown).sort().join(', ');
    throw new Error(
      `Unknown placeholder(s) in skill content: ${keys}. ` +
        `Known placeholders: ${Object.keys(PLACEHOLDERS).join(', ')}.`,
    );
  }

  return result;
}

/**
 * Returns true if content contains any `{{PLACEHOLDER}}` tokens.
 * Cheap check used before substituting — avoids work on placeholder-free files.
 */
export function hasPlaceholders(content: string): boolean {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return PLACEHOLDER_PATTERN.test(content);
}
