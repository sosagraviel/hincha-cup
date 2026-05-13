import type { PromptScriptHandler } from '../types.js';
import { getAllLanguages } from '../../language-config/index.js';

/**
 * Lists the language-config registry's display names + their primary
 * manifest / lock file. Used in prompts that reference "this language
 * family"-style instructions, so the agent reads the canonical list
 * instead of guessing.
 */
export const languageConfigSummary: PromptScriptHandler = {
  name: 'language-config-summary',
  description: 'Canonical list of supported languages with their manifests + lock files.',
  run() {
    const lines: string[] = [
      '### Supported language families',
      '',
      '| Language | Extensions | Manifests | Lock files |',
      '| -------- | ---------- | --------- | ---------- |',
    ];
    for (const lang of getAllLanguages()) {
      const exts = lang.extensions.map((e) => `.${e}`).join(' ');
      const manifests =
        lang.manifests.length > 0 ? lang.manifests.map((m) => `\`${m.kind}\``).join(' ') : '—';
      const locks =
        lang.lockFiles.length > 0 ? lang.lockFiles.map((l) => `\`${l.filename}\``).join(' ') : '—';
      lines.push(`| **${lang.displayName}** | ${exts} | ${manifests} | ${locks} |`);
    }
    return lines.join('\n');
  },
};
