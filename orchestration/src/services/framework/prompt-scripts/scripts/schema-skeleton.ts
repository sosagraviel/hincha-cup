/**
 * `<<script:schema-skeleton agent=NAME>>` renders the Zod schema of
 * agent `NAME` as a JSONC skeleton. The prompt's "expected output"
 * section comes from the same Zod schema the Stop hook validates
 * against, so the two cannot drift.
 *
 * Usage in an analyzer prompt:
 *
 *     ## Output
 *
 *     ```jsonc
 *     <<script:schema-skeleton agent=structure-architecture-analyzer>>
 *     ```
 *
 * The renderer fills in the JSONC body verbatim (no surrounding fence
 * — the prompt author owns the fence and the surrounding hook hints).
 */

import { AGENT_OUTPUT_SCHEMAS } from '../../../../schemas/phase1-agent-outputs.schema.js';
import { renderSchemaSkeleton } from '../../schema-skeleton/render-skeleton.js';
import type { PromptScriptHandler } from '../types.js';

export const schemaSkeleton: PromptScriptHandler = {
  name: 'schema-skeleton',
  description:
    "Render an agent's Zod output schema as a JSONC skeleton with field names, " +
    'types, enum vocabularies, optionality markers (`"name?"`), and constraint ' +
    'comments. Sourced from `AGENT_OUTPUT_SCHEMAS` — always in sync with the Stop hook.',
  run(args) {
    const agent = args.agent;
    if (!agent) {
      return `<!-- prompt-script 'schema-skeleton': missing 'agent' arg -->`;
    }
    const schema = (AGENT_OUTPUT_SCHEMAS as Record<string, unknown>)[agent];
    if (!schema) {
      return `<!-- prompt-script 'schema-skeleton': unknown agent '${agent}' -->`;
    }
    return renderSchemaSkeleton(schema as Parameters<typeof renderSchemaSkeleton>[0]);
  },
};
