/**
 * Phase 5: Resources Constants
 *
 * All language-specific defaults (default commands, implementer-agent gate)
 * are derived from the centralized language-config registry. Adding a new
 * language is a one-file change under
 * `services/framework/language-config/languages/`.
 */

import type { CommandSet } from './types.js';
import {
  commandDefaultsByLanguage,
  languagesWithImplementerAgent,
} from '../../../services/framework/language-config/index.js';

/**
 * Default lint / format / typecheck / test / build commands per language —
 * used by the Phase 5 implementer-agent generator when the project's
 * manifest carries no script overrides. Derived from each language's
 * `commandDefaults` field in the language-config registry.
 */
export const COMMAND_DEFAULTS: Record<string, CommandSet> = (() => {
  const out: Record<string, CommandSet> = {};
  for (const [key, defaults] of Object.entries(commandDefaultsByLanguage())) {
    out[key] = {
      lint: defaults.lint ?? '',
      format: defaults.format ?? '',
      typecheck: defaults.typecheck ?? '',
      test: defaults.test ?? '',
      build: defaults.build ?? '',
    };
  }
  return out;
})();

/**
 * Language keys for which Phase 5 generates a dedicated implementer agent
 * (e.g. `implementer-typescript`, `implementer-python`). Languages outside
 * this set are handled by `implementer-generic`. Derived from the
 * registry's `hasImplementerAgent` flag.
 */
export const SUPPORTED_IMPLEMENTER_LANGUAGES: ReadonlyArray<string> =
  languagesWithImplementerAgent();
