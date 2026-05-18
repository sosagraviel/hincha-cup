/**
 * Stable validation error codes emitted by Stop-hook validators.
 *
 * Each entry has a compressed `VALIDATION_<code>: <what> | <fix>` form fed
 * back to the agent on retry, plus a long-form prose explanation rendered
 * by the debug store / transcript renderer. The LLM only sees the short
 * form (`formatValidationError`); developers reading debug HTML see the
 * long form (`formatValidationErrorLong`).
 *
 * Adding a new code: add an entry below + a unit test asserting its short
 * form fits in ≤180 chars. Never reuse a code.
 */

export interface ValidationCodeSpec {
  /** Stable identifier — never reused, present in every emitted feedback. */
  readonly code: string;
  /** Short summary written in the imperative (≤90 chars). */
  readonly what: (args: Record<string, string>) => string;
  /** One-line repair instruction (≤90 chars). */
  readonly fix: (args: Record<string, string>) => string;
  /** Long-form explanation for debug rendering (multi-line OK). */
  readonly long: (args: Record<string, string>) => string;
  /**
   * Override the default 180-char cap for codes whose `what` payload is a
   * diagnostic field-path that must not be truncated.
   */
  readonly maxLength?: number;
}

const arg = (args: Record<string, string>, key: string): string => args[key] ?? `<${key}?>`;

/**
 * The canonical code table. The keys MUST stay stable forever — they
 * are referenced from analyzer prompts and from operator-facing logs.
 *
 * Naming: `E<NNN>_<short_slug>`. The slug is purely human-readable;
 * external consumers should switch on the `E<NNN>` prefix only.
 */
export const VALIDATION_CODES = {
  E001_no_assistant_message: {
    code: 'E001_no_assistant_message',
    what: () => 'transcript has no assistant message; cannot read agent output',
    fix: () => 'framework error — re-run the analyzer; check Claude CLI logs',
    long: () =>
      "The Stop hook ran but found no assistant message in the transcript. The agent hasn't produced any output yet. This is unexpected — the hook should only run after agent output.",
  },
  E002_invalid_content_structure: {
    code: 'E002_invalid_content_structure',
    what: () => 'last assistant message has no content[] array',
    fix: () => 'framework error — check Claude CLI version compatibility',
    long: () =>
      'The Stop hook expected the last assistant message to contain an array of content blocks. The transcript format may have changed; check Claude CLI compatibility.',
  },
  E003_no_text_in_response: {
    code: 'E003_no_text_in_response',
    what: () => 'response contains no text blocks (only tool_use / other)',
    fix: () => 'emit the JSON output as a text block in the final assistant turn',
    long: () =>
      'Your final assistant turn contained no text blocks. The JSON output must be emitted as a text block in the final message (after all tool_use calls have completed).',
  },
  E004_empty_output: {
    code: 'E004_empty_output',
    what: () => 'response text is empty',
    fix: () => 'output the required JSON object (must start with { and end with })',
    long: () =>
      'Your response text is empty. You must output JSON in the required format. First character must be `{` and last character must be `}`.',
  },
  E005_no_json_object: {
    code: 'E005_no_json_object',
    what: () => 'response contains no JSON object',
    fix: () => 'output ONLY raw JSON — no prose, no markdown fences, must start with {',
    long: () =>
      'No JSON object found in your response. Output ONLY raw JSON (no explanatory text). First character must be `{` and last character must be `}`. Do NOT wrap in markdown code blocks. Do NOT add text before or after the JSON.',
  },
  E006_json_parse_failed: {
    code: 'E006_json_parse_failed',
    what: (a) => `JSON.parse failed: ${truncate(arg(a, 'error'), 80)}`,
    fix: () => 'fix JSON syntax — check commas, quotes (double only), braces, no trailing commas',
    long: (a) =>
      `JSON parsing failed: ${arg(a, 'error')}\n\nCommon JSON syntax errors:\n  1. Missing or extra commas\n  2. Unclosed braces { } or brackets [ ]\n  3. Unquoted strings (all keys and values use double quotes "")\n  4. Trailing commas in objects or arrays\n  5. Single quotes instead of double quotes`,
  },
  E007_graph_use_fabricated: {
    code: 'E007_graph_use_fabricated',
    what: (a) =>
      `graph_queries_used claims ${arg(a, 'claimed')} entries but transcript shows zero mcp__code_graph__* tool_use events`,
    fix: () => 'either actually call a code-graph MCP tool OR set graph_queries_used to []',
    long: () =>
      'Your output claims graph_queries_used has entries but the transcript records zero `mcp__code_graph__*` tool_use events. You did not actually call any code-graph MCP tool. Either:\n  1. Call at least one tool from the "Available MCP tools" list in your CODE GRAPH CONTEXT, OR\n  2. Set graph_queries_used to [] and explain in your output why the graph was not used.\n\nThe Stop hook reads the transcript directly and will reject any future attempt that does not match what you actually executed.',
  },
  E008_schema_validation_failed: {
    code: 'E008_schema_validation_failed',
    maxLength: 480,
    what: (a) =>
      `Zod schema rejected output${arg(a, 'agent') ? ` for ${arg(a, 'agent')}` : ''}: ${truncate(arg(a, 'errors'), 360)}`,
    fix: () => 'fix the field(s) named above to match the schema skeleton in your prompt',
    long: (a) =>
      `Schema validation failed${arg(a, 'agent') ? ` for agent "${arg(a, 'agent')}"` : ''}. Fix these issues:\n\n${arg(a, 'errors')}\n\nThe exact field shapes (Zod-enforced) are in the "Output skeleton" section of your execution-instructions prompt. Copy that skeleton verbatim, then fill values.`,
  },
  E060_missing_attempted_resolution: {
    code: 'E060_missing_attempted_resolution',
    what: (a) =>
      `needs_verification[${arg(a, 'index')}].attempted_resolution insufficient (${arg(a, 'detail')})`,
    fix: () => 'run ≥2 tool calls (Read/Grep/Glob/Bash/mcp__code_graph__*) per item and list them',
    long: () =>
      'attempted_resolution must have at least 2 entries and at least one must be a tool invocation. Items without sufficient search provenance are blocked.',
  },
  E061_invalid_attempted_resolution_entry: {
    code: 'E061_invalid_attempted_resolution_entry',
    what: (a) =>
      `needs_verification[${arg(a, 'index')}].attempted_resolution invalid entry (${arg(a, 'detail')})`,
    fix: () =>
      'each entry must start with a tool token (Read/Grep/Glob/Bash/mcp__code_graph__*) OR `human:` + ≥20-char explanation',
    long: () =>
      'Each attempted_resolution entry must start with a recognised tool token (Read/Grep/Glob/Bash/mcp__code_graph__*) OR a `human:` prefix followed by a ≥20-char explanation. Prose like "I tried to find it" is rejected.',
  },
  E062_graph_internals_in_user_prose: {
    code: 'E062_graph_internals_in_user_prose',
    what: (a) =>
      `needs_verification[${arg(a, 'index')}] mentions graph internals ("${arg(a, 'match')}")`,
    fix: () => 'phrase questions in terms of project state, never tool internals',
    long: () =>
      'The user does not know what the graph is. Never mention "graph", "Class search", "semantic search", "community", or `mcp__code_graph__*` in question/reason.',
  },
  E063_fabricated_numbers_in_question: {
    code: 'E063_fabricated_numbers_in_question',
    what: (a) =>
      `needs_verification[${arg(a, 'index')}].question has fabricated number ("${arg(a, 'match')}")`,
    fix: () => 'compute the count deterministically (Glob + count) OR omit the number',
    long: () =>
      'Never ask the human to confirm `~N`, `≈N`, `approximately N`, or `roughly N`. Either compute the count deterministically or omit the number entirely.',
  },
  E064_missing_or_generic_impact: {
    code: 'E064_missing_or_generic_impact',
    what: (a) => `needs_verification[${arg(a, 'index')}].impact ${arg(a, 'detail')}`,
    fix: () =>
      'name the concrete artefact (wiki page / skill body / finding) AND what changes (≥40 chars)',
    long: () =>
      'The `impact` field MUST name a concrete artefact (wiki page / skill body / finding) the answer changes. ≥40 chars. "Important for documentation" / "useful to know" / "nice to have" are rejected.',
  },
  E065_found_no_evidence_yesno: {
    code: 'E065_found_no_evidence_yesno',
    what: (a) =>
      `needs_verification[${arg(a, 'index')}] self-contradicting (evidence already proves the answer)`,
    fix: () => 'record the absence in findings.<sub-field> as a fact, then drop the question',
    long: () =>
      'attempted_resolution already proves the answer (e.g. "Grep aws-sdk — zero matches"), and the question is a yes/no presence question. RECORD THE ABSENCE in the right `findings.<sub-field>` path, then drop the question. Examples: ci_cd.provider: "none", dependencies.<svc>.notable_absent: [...].',
  },
  E066_confessed_incomplete_search: {
    code: 'E066_confessed_incomplete_search',
    what: (a) =>
      `needs_verification[${arg(a, 'index')}] admits incomplete search ("${arg(a, 'match')}")`,
    fix: () => 'finish the Read/Grep/Glob you skipped, then record what you found in findings.*',
    long: () =>
      'attempted_resolution admits the search was incomplete ("file contents were not read", "did not inspect"). Two steps: (1) finish the search and (2) record what you found in the right `findings.<sub-field>` path. The framework cannot substitute the operator for an unfinished investigation.',
  },
  E067_speculative_out_of_scope: {
    code: 'E067_speculative_out_of_scope',
    what: (a) => `needs_verification[${arg(a, 'index')}] out of scope ("${arg(a, 'match')}")`,
    fix: () => 'drop the item — credentials / production state / external infra are out of scope',
    long: () =>
      'The question is about credentials / production endpoints / infrastructure managed outside the repo. The wiki/CLAUDE.md is generated from CODE; production state is out-of-scope by design. Drop this item entirely (do NOT rephrase to evade the rule).',
  },
  E010_automation_discovery_gap: {
    code: 'E010_automation_discovery_gap',
    what: (a) =>
      `findings.automation.${arg(a, 'bucket')} empty but found: ${truncate(arg(a, 'violations'), 70)}`,
    fix: () => 'Read each file and emit its targets / recipes / commands under that bucket',
    long: (a) =>
      `Automation discovery gap. The structure analyzer is required to discover the project's automation surface (Make / Just / Task / setup scripts / devcontainer) under findings.automation. The Stop hook checked the filesystem and found wrapper files that your output does NOT represent.\n\n${arg(a, 'violations')}\n\nFor Make/Just/Task targets, capture { name, group?, description? } per target with description copied verbatim from source comment. For shell scripts, set \`purpose\` to one of setup/bootstrap/dev/test/reset/unknown. For devcontainer hooks, copy postCreateCommand and postStartCommand exactly. For README run-sections, capture path, heading verbatim, body raw markdown, and fenced_blocks.`,
  },
  E011_port_discovery_gap: {
    code: 'E011_port_discovery_gap',
    what: (a) => `service ports incomplete: ${truncate(arg(a, 'violations'), 100)}`,
    fix: () =>
      'find the port (Dockerfile EXPOSE, server.listen, manifest scripts) or set explicit opt-out with reason+evidence',
    long: (a) =>
      `Per-service port discovery gap. Every backend service needs either a discovered port OR an explicit opt-out declaration with reason and ≥1 evidence entry.\n\n${arg(a, 'violations')}\n\nLook for: Dockerfile EXPOSE, docker-compose ports, app.listen() / server.listen() / serve(), framework config (settings.py PORT, application.yml, etc.), package.json scripts ("start": "node server.js --port 3000"). If genuinely no port (CLI tool, library), set port_opt_out: { reason: "<why>", evidence: ["<path>"] }.`,
  },
  E012_infrastructure_port_gap: {
    code: 'E012_infrastructure_port_gap',
    what: (a) => `infrastructure service ports incomplete: ${truncate(arg(a, 'violations'), 100)}`,
    fix: () =>
      'find the port (compose ports, default for the engine) or set explicit SaaS opt-out with ≥2 evidence',
    long: (a) =>
      `Infrastructure-service port gap. Every runtime infrastructure service (Postgres / Redis / Keycloak / Mailhog / etc.) needs either a discovered port OR an explicit SaaS opt-out with ≥2 evidence entries.\n\n${arg(a, 'violations')}\n\nLook for: docker-compose service ports, env-var defaults (REDIS_PORT=6379), engine canonical default ports.`,
  },
  E013_unknown_service_id: {
    code: 'E013_unknown_service_id',
    what: (a) =>
      `output references service IDs not in authoritative list: ${truncate(arg(a, 'offenders'), 100)}`,
    fix: (a) => `use only IDs from: ${truncate(arg(a, 'authoritative'), 100)}`,
    long: (a) =>
      `Service-ID consistency check failed. The structure-architecture-analyzer ran first and is the single source of truth for service discovery; you may not introduce new IDs.\n\nUnknown IDs found in your output:\n${arg(a, 'offenderList')}\n\nAuthoritative service IDs: ${arg(a, 'authoritative')}\n\nHow to fix:\n  - If a finding belongs to one of the authoritative services, use that service ID verbatim.\n  - If the finding is genuinely cross-cutting, put it under a top-level non-service key.\n  - If you believe an authoritative ID is missing entirely, the decision was made by analyzer 01 — surface it as a needs_verification item.`,
  },
  E014_hook_crashed: {
    code: 'E014_hook_crashed',
    what: (a) => `validation hook crashed: ${truncate(arg(a, 'error'), 100)}`,
    fix: () => 'framework error — re-run; report the issue if it persists',
    long: (a) =>
      `Hook crashed: ${arg(a, 'error')}\n\nThe validation hook encountered an unexpected error. This is a framework error. The output cannot be validated. Please report this issue if it persists.`,
  },
  E016_missing_service_paths: {
    code: 'E016_missing_service_paths',
    what: (a) =>
      `${arg(a, 'count')} manifest dir(s) missing from findings.services[]: ${truncate(arg(a, 'paths'), 100)}`,
    fix: () => 'add a services[] entry per path OR emit a needs_verification item citing the path',
    long: (a) =>
      `Service-completeness gap. The Stop hook globbed the project for every manifest pattern in the language registry and found ${arg(a, 'count')} directory(ies) that are not represented in your output.\n\nMissing candidates:\n  ${arg(a, 'paths')}\n\nHow to fix (pick one per directory):\n  1. Add the directory to \`findings.services[]\` with id / path / type / language inferred from the manifest.\n  2. If the directory is intentionally not a separate service (sub-module / generated code / shared library co-located in a parent service), surface a \`needs_verification\` item whose \`attempted_resolution\` cites the path verbatim and \`reason\` explains why it is not separate.\n\nStack-agnostic: the manifest patterns come from every language registered in \`services/framework/language-config/\`. Mobile apps (Android \`AndroidManifest.xml\`, iOS \`*.xcodeproj\` / \`Package.swift\` / \`Info.plist\`) are first-class — do not skip them.`,
  },
  E015_hook_transcript_missing: {
    code: 'E015_hook_transcript_missing',
    what: (a) =>
      arg(a, 'path') === '<path?>'
        ? 'hook received no transcript_path'
        : `hook transcript not found at ${arg(a, 'path')}`,
    fix: () => 'framework error — check Claude CLI hook integration',
    long: (a) =>
      `Hook transcript error. ${arg(a, 'path') === '<path?>' ? 'No transcript path was provided.' : `Expected transcript at: ${arg(a, 'path')}`}\n\nThis is a framework error. The validation hook requires a transcript to validate output.`,
  },

  E068_missing_judgment_field_for_service: {
    code: 'E068_missing_judgment_field_for_service',
    what: (a) =>
      `missing ${arg(a, 'field')} for ${arg(a, 'service_id')} (${arg(a, 'service_type')})`,
    fix: () => 'emit ≥1 cited entry (source_file+source_line) or surface needs_verification',
    long: (a) =>
      `Groundedness contract: every service of type ${arg(a, 'service_type')} must have a populated ${arg(a, 'field')} field. Service "${arg(a, 'service_id')}" emitted an empty or missing value.\n\nHow to fix:\n  1. Read at least one representative file from the service.\n  2. Emit ≥1 entry under \`findings.${arg(a, 'field_path')}\` with the verbatim code AND citation (\`source_file\` + \`source_line\`).\n  3. If the service genuinely has nothing for this field (e.g. an experimental scaffold with no tests yet), surface a \`needs_verification\` item that names the service and the field — the framework treats that as an explicit absence.`,
  },

  E020_consolidation_input_missing: {
    code: 'E020_consolidation_input_missing',
    what: (a) => `consolidation input missing: ${arg(a, 'detail')}`,
    fix: () => 'framework error — Phase 1 outputs must exist before Phase 2 runs',
    long: (a) =>
      `Consolidation input missing: ${arg(a, 'detail')}\n\nPhase 2 expects all four Phase 1 analyzer outputs at <tempDir>/phase1-outputs/. Re-run Phase 1 and check that each analyzer succeeded.`,
  },
  E021_consolidation_schema_failed: {
    code: 'E021_consolidation_schema_failed',
    what: (a) => `consolidation schema rejected: ${truncate(arg(a, 'errors'), 100)}`,
    fix: () => 'fix the named fields and re-emit the consolidated JSON',
    long: (a) =>
      `Phase 2 consolidation output failed schema validation:\n\n${arg(a, 'errors')}\n\nSchema: schemas/phase2-consolidated.schema.ts.`,
  },

  E030_synthesis_input_missing: {
    code: 'E030_synthesis_input_missing',
    what: (a) => `synthesis input missing: ${arg(a, 'detail')}`,
    fix: () => 'framework error — Phase 2 output must exist before Phase 3 runs',
    long: (a) =>
      `Synthesis input missing: ${arg(a, 'detail')}\n\nPhase 3 expects the consolidated Phase 2 output at <tempDir>/phase2-consolidated.json.`,
  },
  E031_synthesis_schema_failed: {
    code: 'E031_synthesis_schema_failed',
    what: (a) => `synthesis schema rejected: ${truncate(arg(a, 'errors'), 100)}`,
    fix: () => 'fix the named fields and re-emit the synthesis JSON',
    long: (a) =>
      `Phase 3 synthesis output failed schema validation:\n\n${arg(a, 'errors')}\n\nSchema: schemas/phase3-synthesis.schema.ts.`,
  },
  E032_synthesis_path_restricted: {
    code: 'E032_synthesis_path_restricted',
    what: (a) => `synthesizer attempted to Read ${arg(a, 'path')} (outside allowlist)`,
    fix: (a) => `Read only synthesizer-allowed paths: ${truncate(arg(a, 'allowed'), 100)}`,
    long: (a) =>
      `The synthesizer agent attempted to Read a file outside the allowlist: ${arg(a, 'path')}\n\nThe synthesizer is a closed-book step — it must only read its synthesizer input file and its own prior attempts. Allowed paths: ${arg(a, 'allowed')}`,
  },

  E040_wiki_output_invalid: {
    code: 'E040_wiki_output_invalid',
    what: (a) => `wiki output invalid: ${truncate(arg(a, 'detail'), 100)}`,
    fix: () => 'fix the issue and re-emit the wiki bundle',
    long: (a) =>
      `Wiki output failed validation: ${arg(a, 'detail')}\n\nThe wiki bundle must contain valid Markdown for every required page.`,
  },

  E050_path_outside_allowlist: {
    code: 'E050_path_outside_allowlist',
    what: (a) => `agent attempted to access ${arg(a, 'path')} (outside allowlist)`,
    fix: (a) => `restrict file access to: ${truncate(arg(a, 'allowed'), 100)}`,
    long: (a) =>
      `The agent attempted to access a path outside its allowlist: ${arg(a, 'path')}\n\nAllowed paths for this agent: ${arg(a, 'allowed')}`,
  },
} as const satisfies Record<string, ValidationCodeSpec>;

export type ValidationCodeKey = keyof typeof VALIDATION_CODES;

const SHORT_MAX = 180;

/**
 * Format a validation error for agent retry feedback. The shape is:
 *
 *   `VALIDATION_<code>: <what> | <fix>`
 *
 * Always ≤180 chars total. The agent can switch on the `VALIDATION_<code>`
 * prefix in its retry handling without parsing prose.
 */
export function formatValidationError(
  code: ValidationCodeKey,
  args: Record<string, string> = {},
): string {
  const spec = VALIDATION_CODES[code];
  const what = spec.what(args);
  const fix = spec.fix(args);
  const out = `VALIDATION_${spec.code}: ${what} | ${fix}`;
  if (out.length > SHORT_MAX) {
    return out.slice(0, SHORT_MAX - 1) + '…';
  }
  return out;
}

/**
 * Long-form rendering used by the debug store / transcript renderer.
 * Returns the historical prose so developers reading debug HTML see
 * the full repair guidance the LLM no longer needs.
 */
export function formatValidationErrorLong(
  code: ValidationCodeKey,
  args: Record<string, string> = {},
): string {
  const spec = VALIDATION_CODES[code];
  return `VALIDATION_${spec.code}\n${spec.long(args)}`;
}

function truncate(text: string, n: number): string {
  if (typeof text !== 'string') return '';
  return text.length <= n ? text : text.slice(0, n - 1) + '…';
}

/**
 * Map a needs_verification sub-code (as emitted by
 * `NeedsVerificationViolation.code`) onto the corresponding stable
 * `E0xx_*` code key. Centralises the sub-code → table-key mapping so
 * callers don't drift.
 */
export const NEEDS_VERIFICATION_SUBCODE_TO_KEY: Record<string, ValidationCodeKey> = {
  missing_attempted_resolution: 'E060_missing_attempted_resolution',
  invalid_attempted_resolution_entry: 'E061_invalid_attempted_resolution_entry',
  graph_internals_in_user_prose: 'E062_graph_internals_in_user_prose',
  fabricated_numbers_in_question: 'E063_fabricated_numbers_in_question',
  missing_or_generic_impact: 'E064_missing_or_generic_impact',
  found_no_evidence_yesno: 'E065_found_no_evidence_yesno',
  confessed_incomplete_search: 'E066_confessed_incomplete_search',
  speculative_out_of_scope: 'E067_speculative_out_of_scope',
};
