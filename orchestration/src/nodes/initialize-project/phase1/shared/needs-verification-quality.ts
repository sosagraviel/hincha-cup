/**
 * Heuristic quality gates for `needs_verification` items.
 *
 * The 2026-05-04 gira run (plan 13 §C 4.3) showed analyzers
 * shipping speculative items the framework rule already excluded.
 * The 2026-05-05 gira re-run (plan 14, this module) showed those
 * items evading the original prose-token detector by paraphrasing
 * — synonyms ("infrastructure repository", "external system"),
 * graph-internals leakage ("Class search returned 0", "during
 * graph parsing"), fabricated numbers ("~180 files"), and
 * missing search-attempt provenance.
 *
 * Plan 14 (`/ai-documentation-strategy/14-needs-verification-quality-hardening/plan.md`)
 * goes structural. This module exposes:
 *
 *   - The legacy prose-token detector
 *     (`hasSpeculativeNeedsVerification` / `findSpeculativeNeedsVerification`)
 *     for back-compat with §C 4.3's `speculative_needs_verification`
 *     soft warning.
 *   - Four new validators (Plan 14 §C.1, C.2, C.3, C.7) that target
 *     the structural failure modes:
 *       - missing or insufficient `attempted_resolution`
 *       - graph-internals language in user-facing prose
 *       - fabricated numbers in question text
 *       - missing or generic `impact` text
 *   - A unified `validateNeedsVerificationProse` aggregator that
 *     returns hard violation messages for the Stop hook.
 *
 * Every detector is stack-agnostic — pattern matching on text
 * shape, no language-family or framework-specific tokens.
 */

const SPECULATIVE_TOKENS: Array<{ pattern: RegExp; reason: string }> = [
  // Credentials / secrets — always external by design.
  {
    pattern:
      /\b(?:credentials?|api\s+keys?|secrets?|tokens?|dsn|connection\s+strings?|passwords?)\b/i,
    reason: 'credentials are always external — repos intentionally do not contain them',
  },
  // Things outside the repo — CI/CD elsewhere, vendor systems, etc.
  {
    pattern: /\boutside\s+(?:this\s+)?(?:repository|repo|codebase)\b/i,
    reason: 'items outside this repo cannot be verified by reading this repo',
  },
  {
    pattern: /\b(?:configured|managed|maintained)\s+(?:outside|by\s+another\s+team|elsewhere)\b/i,
    reason: 'items managed outside this repo cannot be verified by reading this repo',
  },
  // Plan 14 §C.5 synonym expansion (gira-exhaustive-followup-2,
  // 2026-05-05): the Q4 question "managed in a separate
  // infrastructure repository or external system" should have
  // fired the original "outside this repository" rule but evaded
  // it by phrasing. These synonym patterns close the gap.
  {
    pattern: /\b(?:infrastructure|separate|another|sibling)\s+repository\b/i,
    reason:
      'sibling / infrastructure repositories are by definition outside this repo and cannot be verified from here',
  },
  {
    pattern: /\bvendor\s+portal\b/i,
    reason: 'vendor portals are not part of the repo and cannot be inspected',
  },
  {
    pattern: /\bexternal\s+(?:system|infrastructure|service\s+managed\s+by)\b/i,
    reason: 'external systems / infrastructure / vendor-managed services live outside this repo',
  },
  {
    pattern: /\binfrastructure\s+managed\s+(?:elsewhere|outside|by\s+(?:another|a\s+different))/i,
    reason: 'infrastructure managed elsewhere is, by definition, not in this repo',
  },
  // Build-environment reachability is a network-state question,
  // not a repo question — the repo has no way to know whether host
  // X is reachable from CI runner Y.
  {
    pattern:
      /\b(?:from|in)\s+(?:production\s+)?(?:build|ci|deployment)\s+environments?\b.*\b(?:reachable|accessible)/i,
    reason: 'reachability from build / CI environments is network state, not repository state',
  },
  {
    pattern:
      /\b(?:reachable|accessible)\s+from\s+(?:production\s+)?(?:build|ci|deployment)\s+environments?\b/i,
    reason: 'reachability from build / CI environments is network state, not repository state',
  },
  // Production deployment / infra topology that lives elsewhere.
  {
    pattern: /\bproduction\s+(?:deployment|infrastructure|environment|server|host|url|endpoint)\b/i,
    reason:
      'production deployment / infrastructure details live outside the repo (vendor portal / IaC repo)',
  },
  {
    pattern: /\bdeployment\s+server\b/i,
    reason: 'deployment server details live outside the repo',
  },
];

/**
 * Inspect a `needs_verification` array. Returns true when at least
 * one item matches a speculative pattern. The caller surfaces a
 * `speculative_needs_verification` soft warning so the operator can
 * spot trends.
 *
 * Bounded to the documented format: each item has a `question` and
 * a `reason` string. Anything else is treated as already-malformed
 * (the schema validator handles structural issues).
 */
export function hasSpeculativeNeedsVerification(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const text = [
      typeof rec.question === 'string' ? rec.question : '',
      typeof rec.reason === 'string' ? rec.reason : '',
    ]
      .filter((s) => s.length > 0)
      .join(' ');
    if (text.length === 0) continue;
    for (const { pattern } of SPECULATIVE_TOKENS) {
      if (pattern.test(text)) return true;
    }
  }
  return false;
}

/**
 * For diagnostic / debug-store output: return the per-item match
 * details so the run report can attribute the soft warning to a
 * specific question. Empty array when nothing matches.
 */
export interface SpeculativeMatch {
  index: number;
  question: string;
  reason: string;
}

export function findSpeculativeNeedsVerification(items: unknown): SpeculativeMatch[] {
  if (!Array.isArray(items)) return [];
  const out: SpeculativeMatch[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const question = typeof rec.question === 'string' ? rec.question : '';
    const itemReason = typeof rec.reason === 'string' ? rec.reason : '';
    const text = [question, itemReason].filter((s) => s.length > 0).join(' ');
    if (text.length === 0) continue;
    for (const { pattern, reason } of SPECULATIVE_TOKENS) {
      if (pattern.test(text)) {
        out.push({ index: i, question, reason });
        break;
      }
    }
  }
  return out;
}

// ============================================================================
// PLAN 14 — STRUCTURAL VALIDATORS
// ============================================================================

/** A hard-violation entry the Stop hook surfaces back to the agent. */
export interface NeedsVerificationViolation {
  /** Stable code so consumers can switch on / aggregate it. */
  code:
    | 'missing_attempted_resolution'
    | 'invalid_attempted_resolution_entry'
    | 'graph_internals_in_user_prose'
    | 'fabricated_numbers_in_question'
    | 'missing_or_generic_impact';
  /** Index into the `needs_verification` array (or -1 when array-shape). */
  index: number;
  /** Human-readable agent-facing message. */
  message: string;
}

/**
 * Banned graph-internals phrases. These leak the framework's
 * implementation detail (graph DB / MCP tool internals) into
 * user-facing prose. The user does NOT know what the graph is;
 * questions phrased in graph-tool terms are unanswerable.
 *
 * Stack-agnostic: every phrase describes graph-tool plumbing,
 * not language-specific concepts.
 */
const GRAPH_INTERNALS_PATTERNS: RegExp[] = [
  /\bgraph\s+(?:traversal|parsing|data|community|nodes?|search|index|result|returned|payload)\b/i,
  /\b(?:during|after)\s+graph\s+(?:traversal|parsing|search)\b/i,
  /\bgraph\s+data\s+alone\b/i,
  /\bmay\s+have\s+been\s+missed\s+during\s+graph\s+(?:parsing|traversal)\b/i,
  /\b(?:Class|Function|File)\s+search\s+returned\b/i,
  /\bsemantic\s+search\s+returned\b/i,
  /mcp__code_graph__\w+/i,
  /\bcommunity\s+(?:size|sizes|member|members|payload|payloads|name|names)\b/i,
  /\bmember\s+analysis\b/i,
  /\bcommunity-\d+\b/i,
];

/**
 * Banned fabricated-number patterns in `question` text. These ask
 * the human to confirm a count the agent invented — almost always
 * unanswerable AND unnecessary (the count is computable
 * deterministically).
 */
const FABRICATED_NUMBER_PATTERNS: RegExp[] = [
  // Tilde / approx prefix immediately before a number
  /[~≈]\s*\d+/,
  /\bapproximately\s+\d+/i,
  /\broughly\s+\d+/i,
  /\baround\s+\d+\s+(?:files?|functions?|classes?|lines?|tests?|services?|packages?|modules?|endpoints?|routes?|controllers?|gateways?)\b/i,
  /\babout\s+\d+\s+(?:files?|functions?|classes?|lines?|tests?|services?|packages?|modules?|endpoints?|routes?|controllers?|gateways?)\b/i,
  // Multi-number guess block: "backend ~180, web-frontend ~120, shared ~25"
  /[~≈]\s*\d+[^?]{0,40}[~≈]\s*\d+/,
];

/**
 * Generic / non-actionable impact phrasing. The `impact` field MUST
 * name a concrete artefact (wiki page / skill / finding) the answer
 * changes; vague phrases like "important for documentation" don't
 * tell us what changes if the answer flips.
 */
const GENERIC_IMPACT_PATTERNS: RegExp[] = [
  /\bimportant\s+for\b/i,
  /\buseful\s+(?:to|for)\b/i,
  /\bhelpful\s+for\b/i,
  /\bgood\s+to\s+know\b/i,
  /\bnice\s+to\s+have\b/i,
  /\bfor\s+completeness\b/i,
  /\bprovides?\s+context\b/i,
  /\baffects?\s+the\s+analysis\b/i,
  /\bgeneral\s+understanding\b/i,
];

const IMPACT_MIN_LENGTH = 40;
const ATTEMPTED_RESOLUTION_MIN_ENTRIES = 2;
const ATTEMPTED_RESOLUTION_ENTRY_MIN_LENGTH = 10;
const HUMAN_PREFIX_MIN_EXPLANATION_LENGTH = 20;

/**
 * Recognised tool-invocation tokens an `attempted_resolution` entry
 * may reference. Stack-agnostic — every tool listed is
 * framework-defined and language-neutral.
 */
const TOOL_TOKEN_PATTERNS: RegExp[] = [
  /^\s*(?:Read|Grep|Glob|Bash|Edit|Write|MultiEdit|NotebookEdit)\b/,
  /^\s*mcp__code_graph__\w+/,
  /^\s*(?:grep|find|ls|cat|head|tail|rg)\b/i,
];

/**
 * Inspect every `needs_verification` item and return hard-violation
 * messages. Empty array = pass.
 *
 * Used by the Stop hook (validate-analyzer-json.hook.ts) to reject
 * outputs that fail the structural rules. The same checks live in
 * the analyzer prompt (verification-format.md) as a self-check
 * checklist; this module is the deterministic enforcement layer.
 */
export function validateNeedsVerificationProse(items: unknown): NeedsVerificationViolation[] {
  if (!Array.isArray(items)) return [];
  const violations: NeedsVerificationViolation[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    violations.push(...validateAttemptedResolution(item as Record<string, unknown>, i));
    violations.push(...validateNoGraphInternals(item as Record<string, unknown>, i));
    violations.push(...validateNoFabricatedNumbers(item as Record<string, unknown>, i));
    violations.push(...validateImpactField(item as Record<string, unknown>, i));
  }
  return violations;
}

function validateAttemptedResolution(
  item: Record<string, unknown>,
  index: number,
): NeedsVerificationViolation[] {
  const violations: NeedsVerificationViolation[] = [];
  const raw = item.attempted_resolution;

  if (!Array.isArray(raw)) {
    violations.push({
      code: 'missing_attempted_resolution',
      index,
      message: `needs_verification[${index}].attempted_resolution is missing. Run AT LEAST ${ATTEMPTED_RESOLUTION_MIN_ENTRIES} concrete tool calls (Read / Grep / Glob / Bash / mcp__code_graph__*) trying to answer the question, and list them here. Each entry must be a tool invocation, not prose.`,
    });
    return violations;
  }
  if (raw.length < ATTEMPTED_RESOLUTION_MIN_ENTRIES) {
    violations.push({
      code: 'missing_attempted_resolution',
      index,
      message: `needs_verification[${index}].attempted_resolution has only ${raw.length} entrie(s); minimum is ${ATTEMPTED_RESOLUTION_MIN_ENTRIES}. Items without sufficient search provenance are blocked.`,
    });
  }

  let hasToolEntry = false;
  for (let j = 0; j < raw.length; j++) {
    const entry = raw[j];
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      violations.push({
        code: 'invalid_attempted_resolution_entry',
        index,
        message: `needs_verification[${index}].attempted_resolution[${j}] is empty or non-string.`,
      });
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length < ATTEMPTED_RESOLUTION_ENTRY_MIN_LENGTH) {
      violations.push({
        code: 'invalid_attempted_resolution_entry',
        index,
        message: `needs_verification[${index}].attempted_resolution[${j}] is too short ("${trimmed}"); each entry must be a concrete tool invocation or a "human:"-prefixed explanation.`,
      });
      continue;
    }
    if (looksLikeToolInvocation(trimmed)) {
      hasToolEntry = true;
      continue;
    }
    if (looksLikeHumanEntry(trimmed)) {
      continue;
    }
    violations.push({
      code: 'invalid_attempted_resolution_entry',
      index,
      message: `needs_verification[${index}].attempted_resolution[${j}] ("${truncate(trimmed, 80)}") doesn't reference a recognised tool (Read/Grep/Glob/Bash/mcp__code_graph__*) and isn't a "human:"-prefixed entry. Use a concrete tool invocation, e.g. \`Grep "@aws-sdk" services/\`.`,
    });
  }
  if (raw.length >= ATTEMPTED_RESOLUTION_MIN_ENTRIES && !hasToolEntry) {
    violations.push({
      code: 'invalid_attempted_resolution_entry',
      index,
      message: `needs_verification[${index}].attempted_resolution has no tool invocation entries. At least one entry MUST be a concrete tool call; "human:"-prefixed entries supplement, not replace, tool entries.`,
    });
  }
  return violations;
}

function validateNoGraphInternals(
  item: Record<string, unknown>,
  index: number,
): NeedsVerificationViolation[] {
  const text = [
    typeof item.question === 'string' ? item.question : '',
    typeof item.reason === 'string' ? item.reason : '',
  ]
    .filter((s) => s.length > 0)
    .join(' ');
  if (!text) return [];
  for (const pattern of GRAPH_INTERNALS_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return [
        {
          code: 'graph_internals_in_user_prose',
          index,
          message: `needs_verification[${index}] leaks graph internals ("${match[0]}") into user-facing prose. The user does not know what the graph is — phrase questions in terms of project state ("does X integrate with Y?"), never tool internals.`,
        },
      ];
    }
  }
  return [];
}

function validateNoFabricatedNumbers(
  item: Record<string, unknown>,
  index: number,
): NeedsVerificationViolation[] {
  const text = typeof item.question === 'string' ? item.question : '';
  if (!text) return [];
  for (const pattern of FABRICATED_NUMBER_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return [
        {
          code: 'fabricated_numbers_in_question',
          index,
          message: `needs_verification[${index}].question contains a fabricated number ("${match[0]}"). Either compute the count deterministically (Glob + count) or omit the number entirely; do not ask the human to confirm a guess.`,
        },
      ];
    }
  }
  return [];
}

function validateImpactField(
  item: Record<string, unknown>,
  index: number,
): NeedsVerificationViolation[] {
  const violations: NeedsVerificationViolation[] = [];
  const impact = item.impact;
  if (typeof impact !== 'string' || impact.trim().length === 0) {
    violations.push({
      code: 'missing_or_generic_impact',
      index,
      message: `needs_verification[${index}].impact is missing. Name the concrete artefact (wiki page / skill body / finding) the answer changes, e.g. "Determines whether the testing-conventions skill body lists 'enforced 80% coverage' or 'no enforced threshold'." (≥${IMPACT_MIN_LENGTH} chars).`,
    });
    return violations;
  }
  if (impact.trim().length < IMPACT_MIN_LENGTH) {
    violations.push({
      code: 'missing_or_generic_impact',
      index,
      message: `needs_verification[${index}].impact is too short (${impact.trim().length} chars; minimum ${IMPACT_MIN_LENGTH}). Spell out which downstream artefact the answer changes.`,
    });
    return violations;
  }
  for (const pattern of GENERIC_IMPACT_PATTERNS) {
    const match = pattern.exec(impact);
    if (match) {
      violations.push({
        code: 'missing_or_generic_impact',
        index,
        message: `needs_verification[${index}].impact uses generic phrasing ("${match[0]}"). Replace with a concrete reference: which wiki page / skill body / finding does the answer change, and how?`,
      });
      return violations;
    }
  }
  return violations;
}

function looksLikeToolInvocation(entry: string): boolean {
  for (const pattern of TOOL_TOKEN_PATTERNS) {
    if (pattern.test(entry)) return true;
  }
  return false;
}

// ============================================================================
// PLAN 14 §C.4 — manifest-vs-import cross-check (soft warning)
// ============================================================================

/**
 * Heuristic: the item references a manifest-declared dependency
 * shape ("declared as dependencies", "in package.json", "in
 * pyproject.toml", "from go.mod", etc.) BUT none of the
 * `attempted_resolution` entries searches for actual import sites.
 *
 * The agent saw the dependency name in the manifest but never
 * searched for `import`/`require`/`use` statements referencing
 * it — the answer to "is X actually used?" is in the import sites,
 * not the manifest.
 *
 * Stack-agnostic: every manifest format and every import-statement
 * shape is covered by token alternation (no language-family
 * branches).
 */
const MANIFEST_DECLARATION_PATTERNS: RegExp[] = [
  /\bdeclared\s+(?:as\s+)?(?:a\s+)?dependenc(?:y|ies)\b/i,
  /\bin\s+(?:package\.json|pyproject\.toml|cargo\.toml|gemfile|composer\.json|go\.mod|pom\.xml|build\.gradle|mix\.exs|\*\.csproj)\b/i,
  /\bonly\s+declared\s+as\s+(?:a\s+)?dependenc/i,
  /\bpresent\s+in\s+(?:runtime\s+)?dependencies\b/i,
  /\bappears?\s+in\s+(?:the\s+)?manifest\b/i,
];

const IMPORT_SEARCH_PATTERNS: RegExp[] = [
  // Tool patterns that look like an import-site search across stacks.
  /\b(?:Grep|grep|rg|ripgrep)\b[^\n]*\b(?:import|require|use|using|from|include|@import)\b/i,
  // Search by package name with a string match shape — often a Grep / find.
  /(?:Grep|grep|rg)\b[^\n]*['"]\s*[@\w][\w./-]+\s*['"]/,
  // mcp__code_graph__semantic_search with the package name in the query.
  /mcp__code_graph__semantic_search_nodes_tool/i,
];

/**
 * Inspect a needs_verification item. Returns true when the item
 * looks like "manifest-declared but no import-site search done".
 * Used as a SOFT warning; the operator sees a `manifest_declared_but_no_import_search`
 * code on the run report when the rate spikes.
 */
export function hasManifestVsImportMismatch(item: unknown): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const rec = item as Record<string, unknown>;
  const text = [
    typeof rec.question === 'string' ? rec.question : '',
    typeof rec.reason === 'string' ? rec.reason : '',
  ]
    .filter((s) => s.length > 0)
    .join(' ');
  if (!text) return false;
  const declaresManifest = MANIFEST_DECLARATION_PATTERNS.some((p) => p.test(text));
  if (!declaresManifest) return false;
  const resolution = Array.isArray(rec.attempted_resolution) ? rec.attempted_resolution : [];
  for (const entry of resolution) {
    if (typeof entry !== 'string') continue;
    if (IMPORT_SEARCH_PATTERNS.some((p) => p.test(entry))) return false;
  }
  return true;
}

/**
 * Returns true when ANY item in the array trips the manifest-vs-
 * import heuristic. The caller surfaces a
 * `manifest_declared_but_no_import_search` soft warning.
 */
export function hasAnyManifestVsImportMismatch(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some(hasManifestVsImportMismatch);
}

function looksLikeHumanEntry(entry: string): boolean {
  if (!/^\s*human:/i.test(entry)) return false;
  const explanation = entry.replace(/^\s*human:\s*/i, '').trim();
  return explanation.length >= HUMAN_PREFIX_MIN_EXPLANATION_LENGTH;
}

function truncate(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}
