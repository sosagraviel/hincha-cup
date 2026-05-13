import type { PromptScriptHandler } from './types.js';
import { inspectionSummary } from './scripts/inspection-summary.js';
import { languageConfigSummary } from './scripts/language-config-summary.js';
import { schemaSkeleton } from './scripts/schema-skeleton.js';

/**
 * Registered prompt-script handlers. To add a new script: create
 * `scripts/<name>.ts` exporting a `PromptScriptHandler` and add one
 * entry here. Prompts can then reference it via `<<script:<name>>>`.
 */
export const PROMPT_SCRIPT_REGISTRY: ReadonlyArray<PromptScriptHandler> = [
  inspectionSummary,
  languageConfigSummary,
  schemaSkeleton,
];

export function getPromptScript(name: string): PromptScriptHandler | undefined {
  return PROMPT_SCRIPT_REGISTRY.find((s) => s.name === name);
}
