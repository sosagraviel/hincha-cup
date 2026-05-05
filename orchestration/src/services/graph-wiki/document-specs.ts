import type {
  WikiAnalyzerOutputs,
  WikiDigestedUpstream,
  WikiDocumentSpec,
  WikiGeneratorServiceOptions,
  WikiGraphState,
} from './types.js';
import {
  discoverCommunityId,
  discoverDependencies,
  discoverEntryPoints,
} from './service-discovery.js';
import { normalizeGraphQueriesUsed } from './query-name-normalizer.js';
import {
  isEmptyValue,
  isRecord,
  slugifyServiceId,
  stableJsonStringify,
  uniqueStrings,
} from './utils.js';
import { sanitizeWikiUpstream, scopeUpstreamForService } from './wiki-input-sanitizer.js';

export function buildCoreSpecs(options: WikiGeneratorServiceOptions): WikiDocumentSpec[] {
  const { analyzers, stackProfile, graph, digestedUpstream } = options;
  // Strip framework-internal jargon ("the X tool overflowed", "automated
  // run", etc.) BEFORE every downstream slicer so no consumer can reintroduce
  // it. See wiki-input-sanitizer.ts + plans/2026-04-29-gira-init-run-audit-refactor
  // finding F15.
  //
  // Only ARCHITECTURE.md is rendered as a cross-cutting LLM-generated wiki
  // page. Data flows are now described per-service in `wiki/services/<id>.md`
  // (where they have actual context), and patterns moved to the prescriptive
  // `code-conventions` and `testing-conventions` skills (where they belong —
  // patterns describe what to DO, not what IS).
  const sanitizedUpstream = sanitizeWikiUpstream(digestedUpstream);
  return [architectureSpec(analyzers, stackProfile, graph, sanitizedUpstream)];
}

export function buildServiceSpec(
  service: Record<string, unknown>,
  analyzers: WikiAnalyzerOutputs,
  digestedUpstream?: WikiDigestedUpstream,
): WikiDocumentSpec {
  const serviceId = String(service.id ?? service.name);
  const entryPoints = discoverEntryPoints(serviceId, service, analyzers);
  const dependencies = discoverDependencies(serviceId, service, analyzers);
  const communityId = discoverCommunityId(serviceId, service, analyzers);

  const frontmatterExtras: Record<string, unknown> = { service_id: serviceId };
  if (entryPoints.length > 0) frontmatterExtras.entry_points = entryPoints;
  if (!isEmptyValue(dependencies)) frontmatterExtras.dependencies = dependencies;
  if (communityId) frontmatterExtras.community_id = communityId;

  // Per-service upstream scoping: the prompt for service A must not carry
  // every paragraph about service B. First strip framework-internal jargon,
  // then narrow to sections mentioning the target service's id / name / path
  // leaf. Stack-agnostic — string-token matching only, no role mappings.
  // See wiki-input-sanitizer.ts + plans/2026-04-29-gira-init-run-audit-refactor
  // finding F3 (the prior wiki-generator passed digestedUpstream verbatim
  // to every service doc, inflating each prompt by ~64 KB of cross-service
  // narrative).
  const sanitized = sanitizeWikiUpstream(digestedUpstream);
  const scoped = scopeUpstreamForService(sanitized, {
    id: serviceId,
    name: typeof service.name === 'string' ? service.name : undefined,
    path: typeof service.path === 'string' ? service.path : undefined,
  });

  return {
    filename: `services/${slugifyServiceId(serviceId)}.md`,
    documentType: 'service',
    title: `Service: ${serviceId}`,
    // Plan §C 3.2 (gira-exhaustive followup, 2026-05-05): per-page
    // graph_queries_used carries only the queries from analyzers that
    // actually have findings for THIS service id. Pre-fix, every
    // service doc unioned all four analyzers' queries — leaking
    // architectural-overview tools into a per-service page that never
    // touched them. Now: structure-arch always contributes (it's the
    // discovery source), and the other three contribute only if their
    // by_service / by_package map has an entry for this id.
    graphQueriesUsed: scopeQueriesToService(serviceId, analyzers),
    promptFocus: [
      `Document only the "${serviceId}" service.`,
      'Use the service-scoped analyzer slice as the inventory of facts about this service.',
      '',
      'Required sections (omit a section ONLY when the analyzer slice has nothing to say about it):',
      '',
      '  ## Purpose',
      '    One paragraph: what this service is responsible for.',
      '',
      '  ## Public API / Surface',
      '    What other services/clients call this service. List entry points,',
      '    HTTP route bases, exposed event topics, public SDK functions, etc.',
      '    DO NOT enumerate every endpoint — call out the surface shape and',
      '    a representative subset. Cite analyzer evidence.',
      '',
      '  ## Internal Architecture',
      '    Layered structure inside this service: controllers → services → repos,',
      '    middleware order, guards/filters, dependency-injection container,',
      "    background workers, etc. Use the structure-analyzer's slice.",
      '',
      '  ## Request Lifecycle (or Job Lifecycle)',
      '    Step-by-step flow for a typical request through this service. For',
      '    queue/worker services, describe the job pipeline instead. Use the',
      "    data-flows-analyzer's slice.",
      '',
      '  ## Data Layer',
      '    Persistence backends this service owns or talks to (DB, cache, queue,',
      '    object store), with table/key namespaces if discoverable. Use the',
      '    tech-stack and data-flows analyzer slices.',
      '',
      '  ## Integrations',
      '    External services / APIs / message buses this service depends on, plus',
      "    inbound integrations (webhooks, etc.). Use the data-flows analyzer's",
      '    slice. Cross-reference [[wikilinks]] to other service docs when this',
      '    service calls another service in the project.',
      '',
      '  ## Service-Specific Patterns',
      '    Recurring implementation patterns observed *inside this service* —',
      '    e.g. repository pattern, command bus, saga pattern, finite state',
      "    machine. Use the code-patterns-testing analyzer's slice. DO NOT",
      "    write prescriptive 'should/must' rules — those belong in the",
      '    code-conventions skill, not the wiki. Describe what IS, not what',
      '    to DO.',
      '',
      'For very large services (≥ ~50 entry points or ≥ ~30 modules), you MAY',
      'add `## Sub-Areas` with one short paragraph per major sub-area (e.g.',
      '"Auth", "Reporting", "Webhooks") so consumers can locate the right',
      'corner of the service without paging the whole doc.',
      '',
      `Service docs live under docs/llm-wiki/wiki/services/. Output filename: services/${slugifyServiceId(serviceId)}.md`,
    ],
    sourceContext: {
      service,
      service_id: serviceId,
      entry_points: entryPoints,
      dependencies,
      community_id: communityId,
      analyzers: sliceAnalyzersForService(serviceId, analyzers),
    },
    digestedUpstream: scoped,
    tags: deriveServiceTags(service),
    frontmatterExtras,
  };
}

/**
 * Tags surfaced into a service page's frontmatter and into `index.md`'s
 * summary catalog. Bounded to a small curated set: language, main framework,
 * service type, plus a `service` marker. No free-form tags so the index entries
 * stay scannable.
 */
function deriveServiceTags(service: Record<string, unknown>): string[] {
  const tags: string[] = ['service'];
  if (typeof service.language === 'string' && service.language.length > 0) {
    tags.push(service.language.toLowerCase());
  }
  if (typeof service.type === 'string' && service.type.length > 0) {
    tags.push(service.type.toLowerCase());
  }
  if (isRecord(service.frameworks)) {
    const main = service.frameworks.main;
    if (typeof main === 'string' && main.length > 0) {
      tags.push(...cleanFrameworkTokens(main));
    }
  }
  return uniqueStrings(tags).slice(0, 5);
}

/**
 * Normalize a free-form `frameworks.main` string (e.g.
 *   `"NestJS ^11.0.11"`
 *   `"class-transformer ^0.5.1 + class-validator ^0.14.1"`
 *   `"@keycloak/keycloak-admin-client ^26.1.4"`
 * ) into a small set of clean lowercase tag tokens.
 *
 * Split on `+` (multi-package joiners). For each part: strip version
 * constraints (`^x.y.z`, `~x.y.z`, bare `x.y.z`), drop the leading
 * `@scope/` prefix, lowercase, replace whitespace with `-`. Drop any
 * candidate longer than 30 chars or empty after cleanup.
 */
function cleanFrameworkTokens(raw: string): string[] {
  const parts = raw.split('+').map((p) => p.trim());
  const out: string[] = [];
  for (const part of parts) {
    if (part.length === 0) continue;

    // Strip version-like trailing tokens. Examples we kill:
    //   "NestJS ^11.0.11"     → "NestJS"
    //   "class-transformer ~0.5.1" → "class-transformer"
    //   "pg 8.13.1"           → "pg"
    //   "Foo >=2.0"           → "Foo"
    let cleaned = part.replace(/\s+[\^~>=<]?[\d][\w.\-*]*\s*$/, '').trim();
    if (cleaned.length === 0) continue;

    // Drop scope prefix `@scope/` so e.g. `@keycloak/keycloak-admin-client`
    // becomes `keycloak-admin-client` (the package name is what readers grep).
    cleaned = cleaned.replace(/^@[^/]+\//, '');

    // Slugify whitespace runs to dashes; drop residual non-tag characters.
    cleaned = cleaned.toLowerCase().replace(/\s+/g, '-');

    if (cleaned.length === 0 || cleaned.length > 30) continue;
    out.push(cleaned);
  }
  return out;
}

/**
 * Plan §I.5 (gira-exhaustive followup, 2026-05-05): byte-identical
 * cache-eligible prefix shared by every wiki-gen prompt in this run.
 *
 * The prefix carries the constant framing (closed-book synthesis
 * rules + the project path) that does NOT vary across the 5+
 * wiki-gen calls a typical run makes. Putting these constant
 * sentences AT THE START of every prompt makes the Anthropic /
 * OpenAI prefix cache hit on calls 2..N — the agent re-uses the
 * cached tokens for the framing and only pays for the spec-specific
 * tail.
 *
 * Stack-agnostic: every line is general framing; no
 * project-shape assumptions.
 */
export function buildWikiSharedPrefix(projectPath: string): string {
  return [
    `Closed-book synthesis instructions for the LLM-wiki page generators in ${projectPath}:`,
    '',
    '- You have NO tools. Synthesize the page from the structured input below only.',
    '- If a fact the page should carry is not in the input, write `(not determined by analysis)` and continue. Do not invent.',
    '- Provenance lives in YAML frontmatter (`sources:` + `confidence:`), auto-injected by the framework. DO NOT emit inline `^[...]` citation markers in the body — they are non-standard markdown and the Stop hook rejects them. For in-wiki cross-references use `[[wikilinks]]`; for gaps write `(not determined by analysis)`.',
    '- Return markdown body only. Do not include YAML frontmatter. Do not wrap the response in code fences.',
    '',
  ].join('\n');
}

export function buildPrompt(spec: WikiDocumentSpec, projectPath: string): string {
  // Byte-identical prefix first (cache-eligible across all wiki-gen
  // calls in this run). Spec-specific framing comes AFTER the
  // prefix so the cache key advances only at the divergence point.
  const lines: string[] = [
    buildWikiSharedPrefix(projectPath),
    `Generate ${spec.title} as narrative markdown.`,
    '',
    'Document-specific focus:',
    ...spec.promptFocus.map((focus) => `- ${focus}`),
    '',
  ];

  if (spec.digestedUpstream) {
    const sections = renderDigestedUpstream(spec.digestedUpstream);
    if (sections.length > 0) {
      lines.push('Digested upstream (narrative):');
      lines.push('');
      lines.push(...sections);
      lines.push('');
    }
  }

  lines.push('Digested upstream (structured):');
  lines.push('```json');
  lines.push(stableJsonStringify(spec.sourceContext));
  lines.push('```');

  return lines.join('\n');
}

function renderDigestedUpstream(upstream: WikiDigestedUpstream): string[] {
  const sections: string[] = [];
  if (upstream.synthesis && upstream.synthesis.trim().length > 0) {
    sections.push('--- begin: phase 3 synthesis (relevant excerpt) ---');
    sections.push(upstream.synthesis.trim());
    sections.push('--- end: phase 3 synthesis ---');
    sections.push('');
  }
  if (upstream.claudeMd && upstream.claudeMd.trim().length > 0) {
    sections.push('--- begin: generated CLAUDE.md (relevant excerpt) ---');
    sections.push(upstream.claudeMd.trim());
    sections.push('--- end: generated CLAUDE.md ---');
    sections.push('');
  }
  if (upstream.architecturalNarrative && upstream.architecturalNarrative.trim().length > 0) {
    sections.push('--- begin: architectural narrative (relevant excerpt) ---');
    sections.push(upstream.architecturalNarrative.trim());
    sections.push('--- end: architectural narrative ---');
    sections.push('');
  }
  return sections;
}

function architectureSpec(
  analyzers: WikiAnalyzerOutputs,
  stackProfile: unknown,
  graph: WikiGraphState,
  digestedUpstream: WikiDigestedUpstream | undefined,
): WikiDocumentSpec {
  const promptFocus: string[] = [
    'Describe monorepo / multi-repo shape, service boundaries, communities, and high-level relationships.',
    'Use `structure_architecture` analyzer findings as the structural ground truth.',
    'Architecture docs live under docs/llm-wiki/wiki/. Output filename: ARCHITECTURE.md',
    // Plan §C 3.1 (gira-exhaustive followup): wikilink every discovered
    // service ID so the rendered page navigates to the per-service docs.
    // Stack-agnostic — service IDs are agent-discovered (community
    // names from the structure analyzer), independent of language.
    'When you mention a discovered service ID (any `id` from `structure_architecture.findings.services`), wrap the FIRST mention of each ID in `[[<id>]]` so it links to the per-service doc at `services/<id>.md`. Subsequent mentions of the same id may be plain text or `[[<id>]]`. Do NOT wikilink ids that were not discovered by the structure analyzer.',
  ];

  // Plan §C 2.4 (gira-exhaustive followup): when the structure analyzer
  // surfaced architecture.coupling, instruct the wiki-gen agent to emit
  // a "Coupling hotspots" section listing the top hubs and bridges by
  // qualified_name. Stack-agnostic — graph-native fields only.
  if (hasCouplingHotspots(analyzers.structure_architecture)) {
    promptFocus.push(
      'Include a "## Coupling hotspots" section listing the hub and bridge nodes from `structure_architecture.findings.architecture.coupling`. For each entry render `- \\`<qualified_name>\\` (<kind>, score <score>)`. Use the qualified_name verbatim from the analyzer slice — do not invent or rename. Hubs are the most-connected nodes in the graph; bridges sit on shortest paths between communities.',
    );
  }

  return {
    filename: 'ARCHITECTURE.md',
    documentType: 'architecture',
    title: 'Architecture',
    graphQueriesUsed: normalizeGraphQueriesUsed(
      (analyzers.structure_architecture?.graph_queries_used ?? []) as string[],
    ),
    promptFocus,
    sourceContext: {
      graph_stats: graph.stats ?? null,
      stack_profile: stackProfile,
      structure_architecture: analyzers.structure_architecture,
    },
    // Plan §C 3.3 (gira-exhaustive followup): the architecture page is
    // descriptive — convention-skill sections (which are prescriptive
    // "should/must" rules) don't belong in its prompt. Drop them
    // explicitly. The keep-keywords list pulls in architecture/topology/
    // monorepo/workspace/services sections; the drop tokens strip
    // convention-skill sections by their canonical heading tokens.
    digestedUpstream: scopeDigestedUpstream(
      digestedUpstream,
      ['architecture', 'topology', 'monorepo', 'workspace', 'services'],
      {
        dropHeadings: [
          'code conventions',
          'code-conventions',
          'multi-file workflows',
          'multi-file-workflows',
          'testing conventions',
          'testing-conventions',
          'convention skill',
        ],
      },
    ),
    tags: deriveCoreTags('architecture', stackProfile),
  };
}

/**
 * Scope graph_queries_used to the analyzers that have findings for the
 * given service id. Plan §C 3.2 of the gira-exhaustive followup — the
 * union-everything approach over-attributed queries to per-service docs.
 *
 * Rules:
 *   - structure-architecture is ALWAYS included — it's the discovery
 *     source for every service id.
 *   - The other three analyzers are included only when their findings
 *     carry an entry keyed by this service id (in any of the conventional
 *     by-service map names: `by_service`, `by_package`, `<topic>.<id>`,
 *     `dependencies.by_service.<id>`, `testing.<id>`, etc.).
 *
 * Stack-agnostic: the check is a string-key lookup; no language
 * assumption.
 */
function scopeQueriesToService(serviceId: string, analyzers: WikiAnalyzerOutputs): string[] {
  const queries: string[] = [];

  // structure-arch is always relevant (it's the source of truth for ids).
  queries.push(...((analyzers.structure_architecture?.graph_queries_used ?? []) as string[]));

  for (const analyzerKey of [
    'tech_stack_dependencies',
    'code_patterns_testing',
    'data_flows_integrations',
  ] as const) {
    const analyzer = analyzers[analyzerKey];
    if (analyzer && analyzerHasFindingsForService(analyzer, serviceId)) {
      queries.push(...((analyzer.graph_queries_used ?? []) as string[]));
    }
  }

  return normalizeGraphQueriesUsed(queries);
}

function analyzerHasFindingsForService(analyzer: unknown, serviceId: string): boolean {
  if (!isRecord(analyzer)) return false;
  const findings = analyzer.findings;
  if (!isRecord(findings)) return false;
  return objectHasServiceKey(findings, serviceId);
}

/**
 * Recursively look for any nested object whose keys include `serviceId`.
 * Matches the conventional by-service shapes the analyzers emit
 * (`by_service`, `by_package`, `testing`, `build_tools`, etc.) without
 * hardcoding a list — a future analyzer that emits `cache_by_service`
 * gets picked up automatically.
 *
 * Bounded depth (4) — analyzer findings nest at most 3 levels deep in
 * practice; a deeper nesting is almost certainly noise.
 */
function objectHasServiceKey(obj: unknown, serviceId: string, depth = 0): boolean {
  if (depth >= 4) return false;
  if (!isRecord(obj)) return false;
  for (const [key, value] of Object.entries(obj)) {
    if (key === serviceId) return true;
    if (isRecord(value) && objectHasServiceKey(value, serviceId, depth + 1)) return true;
  }
  return false;
}

function hasCouplingHotspots(structureAnalyzer: unknown): boolean {
  if (!isRecord(structureAnalyzer)) return false;
  const findings = structureAnalyzer.findings;
  if (!isRecord(findings)) return false;
  const architecture = findings.architecture;
  if (!isRecord(architecture)) return false;
  const coupling = architecture.coupling;
  if (!isRecord(coupling)) return false;
  const hubs = Array.isArray(coupling.hubs) ? coupling.hubs : [];
  const bridges = Array.isArray(coupling.bridges) ? coupling.bridges : [];
  return hubs.length > 0 || bridges.length > 0;
}

/**
 * Curated tag set for the architecture page. Pulls the project's main
 * languages from the stack profile services so the index entry can be
 * filtered by stack at a glance. Bounded to ~5 tags.
 *
 * The previous version supported `'data-flow'` and `'pattern'` document
 * types; both were retired alongside DATA-FLOWS.md / PATTERNS.md.
 */
function deriveCoreTags(documentType: 'architecture', stackProfile: unknown): string[] {
  const seedByType: Record<typeof documentType, string[]> = {
    architecture: ['architecture', 'topology'],
  };
  const tags: string[] = [...seedByType[documentType]];

  if (isRecord(stackProfile) && Array.isArray(stackProfile.services)) {
    for (const service of stackProfile.services) {
      if (!isRecord(service)) continue;
      if (typeof service.language === 'string' && service.language.length > 0) {
        tags.push(service.language.toLowerCase());
      }
      if (isRecord(service.frameworks)) {
        const main = service.frameworks.main;
        if (typeof main === 'string' && main.length > 0) {
          tags.push(...cleanFrameworkTokens(main));
        }
      }
    }
  }

  return uniqueStrings(tags).slice(0, 5);
}

/**
 * Restrict the digested-upstream excerpts to sections whose headings reference
 * any of the provided keywords. Keeps the prompt tight: the architecture page
 * does not need the testing-patterns paragraphs and vice versa.
 *
 * The matching is intentionally lenient — narrative documents from human
 * authors don't follow a fixed heading vocabulary. If no headings match, the
 * full excerpt is returned (better to over-include than to starve the agent).
 */
function scopeDigestedUpstream(
  upstream: WikiDigestedUpstream | undefined,
  keywords: string[],
  options: { dropHeadings?: string[] } = {},
): WikiDigestedUpstream | undefined {
  if (!upstream) return undefined;

  const dropHeadings = options.dropHeadings ?? [];
  const trim = (text: string) => {
    let out = extractRelevantMarkdownSections(text, keywords);
    if (dropHeadings.length > 0) {
      out = dropMarkdownSections(out, dropHeadings);
    }
    return out;
  };

  return {
    synthesis: upstream.synthesis ? trim(upstream.synthesis) : undefined,
    claudeMd: upstream.claudeMd ? trim(upstream.claudeMd) : undefined,
    architecturalNarrative: upstream.architecturalNarrative
      ? trim(upstream.architecturalNarrative)
      : undefined,
  };
}

/**
 * Walk a markdown document by `## ` headings; drop any section whose
 * heading line contains any of the provided drop tokens (case-insensitive).
 * Used by the architecture spec to strip convention-skill sections from
 * the digested upstream — those skills are prescriptive rules that don't
 * belong in a descriptive architecture page (plan §C 3.3,
 * gira-exhaustive followup).
 */
function dropMarkdownSections(markdown: string, dropTokens: string[]): string {
  const lower = dropTokens.map((t) => t.toLowerCase());
  const lines = markdown.split('\n');
  const out: string[] = [];
  let dropping = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      const headingLower = line.toLowerCase();
      dropping = lower.some((t) => headingLower.includes(t));
      if (dropping) continue;
    }
    if (!dropping) {
      out.push(line);
    }
  }
  return out.join('\n').trim();
}

/**
 * Walk a markdown document by `## ` headings; return only sections whose
 * heading line contains any of the provided keywords (case-insensitive). When
 * nothing matches, return the input unchanged.
 */
function extractRelevantMarkdownSections(markdown: string, keywords: string[]): string {
  const lines = markdown.split('\n');
  const lower = keywords.map((k) => k.toLowerCase());
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  let preamble: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current);
      current = { heading: line, body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  const matched = sections.filter((s) => {
    const heading = s.heading.toLowerCase();
    return lower.some((k) => heading.includes(k));
  });

  if (matched.length === 0) {
    return markdown;
  }

  const out: string[] = [];
  if (preamble.some((l) => l.trim().length > 0)) {
    out.push(preamble.join('\n').trimEnd());
    out.push('');
  }
  for (const section of matched) {
    out.push(section.heading);
    out.push(...section.body);
  }
  return out.join('\n').trim();
}

/**
 * For per-service docs: drop unrelated services from analyzer findings so the
 * prompt for service A doesn't carry every fact about service B. Keeps
 * top-level keys (e.g. `findings`, `services`) but recursively narrows
 * service-keyed records and `services` arrays to the target service.
 */
function sliceAnalyzersForService(
  serviceId: string,
  analyzers: WikiAnalyzerOutputs,
): WikiAnalyzerOutputs {
  return {
    structure_architecture: sliceAnalyzerForService(analyzers.structure_architecture, serviceId),
    tech_stack_dependencies: sliceAnalyzerForService(analyzers.tech_stack_dependencies, serviceId),
    code_patterns_testing: sliceAnalyzerForService(analyzers.code_patterns_testing, serviceId),
    data_flows_integrations: sliceAnalyzerForService(analyzers.data_flows_integrations, serviceId),
  };
}

function sliceAnalyzerForService<T>(value: T, serviceId: string): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sliceAnalyzerForService(entry, serviceId)) as unknown as T;
  }
  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'services' && Array.isArray(raw)) {
      next[key] = raw.filter(
        (entry) =>
          isRecord(entry) &&
          (entry.id === serviceId || entry.name === serviceId || entry.path === serviceId),
      );
      continue;
    }
    if (key === 'by_service' && isRecord(raw)) {
      next[key] = serviceId in raw ? { [serviceId]: raw[serviceId] } : {};
      continue;
    }
    next[key] = sliceAnalyzerForService(raw, serviceId);
  }
  return next as T;
}
