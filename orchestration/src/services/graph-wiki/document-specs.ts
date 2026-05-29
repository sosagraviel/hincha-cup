import type {
  WikiAnalyzerOutputs,
  WikiDigestedUpstream,
  WikiDocumentSpec,
  WikiGeneratorServiceOptions,
  WikiGraphState,
} from './types.js';
import { isRecord, slugifyServiceId, stableJsonStringify, uniqueStrings } from './utils.js';
import { sanitizeWikiUpstream, scopeUpstreamForService } from './wiki-input-sanitizer.js';

export function buildCoreSpecs(options: WikiGeneratorServiceOptions): WikiDocumentSpec[] {
  const { analyzers, stackProfile, graph, digestedUpstream } = options;
  const sanitizedUpstream = sanitizeWikiUpstream(digestedUpstream);
  return [architectureSpec(analyzers, stackProfile, graph, sanitizedUpstream)];
}

export function buildServiceSpec(
  service: Record<string, unknown>,
  analyzers: WikiAnalyzerOutputs,
  digestedUpstream?: WikiDigestedUpstream,
): WikiDocumentSpec {
  const serviceId = String(service.id ?? service.name);

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
    promptFocus: [
      `Document only the "${serviceId}" service.`,
      'Use the service-scoped analyzer slice as the inventory of facts. The',
      'agent-level guidance ("triage by enumeration size") decides when to',
      'enumerate inline vs. cite a graph-query pointer; follow that triage.',
      '',
      'Doc length target: **aim 120–250 lines**, hard cap 400. Lean is good —',
      'a sharp pointer-rich doc serves consumer agents better than an',
      'exhaustive prose dump.',
      '',
      'Required sections (every heading MUST appear; empty content is allowed',
      'with `(not determined by analysis)` ONLY when upstream + graph + Read',
      'all came up empty):',
      '',
      '  ## Purpose',
      '    One paragraph: what this service is responsible for.',
      '',
      '  ## Public API / Surface',
      "    The service's public entry points — HTTP routes, queue topics,",
      '    scheduled triggers, webhooks, exported library symbols, CLI',
      "    commands. Consume the analyzer slice's surface fields verbatim",
      "    when present. Apply the agent's enumeration triage: small bounded",
      '    surface (≤ ~10 entries) → enumerate inline; large or open-ended →',
      '    cite the graph-query pointer consumer agents can run themselves.',
      '',
      '  ## Internal Architecture',
      '    Layered structure inside this service: controllers → services → repos,',
      '    middleware order, guards/filters, dependency-injection container,',
      '    background workers, etc. Brief paragraph + key structural pointers.',
      '',
      '  ## Request Lifecycle (or Job Lifecycle)',
      '    Step-by-step flow for a typical request through this service. For',
      '    queue/worker services, describe the job pipeline instead. Consume',
      "    the analyzer slice's `request_lifecycle[]` field when present.",
      '',
      '  ## Data Layer',
      '    Owned collections / tables / queue topics / cache key prefixes /',
      "    object-store buckets. Consume the analyzer slice's owned-data-stores",
      '    fields verbatim when present. Same triage: small set → enumerate;',
      '    large set → graph-query pointer.',
      '',
      '  ## Configuration',
      '    Environment variables this service reads, with the behavior each',
      "    variable gates. Consume the analyzer slice's env-vars field",
      '    verbatim when present. Write `(no environment variables consumed)`',
      '    when genuinely empty.',
      '',
      '  ## Integrations',
      '    External services / APIs / message buses this service depends on, plus',
      '    inbound integrations (webhooks, etc.). Cross-reference [[wikilinks]]',
      '    to other service docs when this service calls another service.',
      '',
      '  ## Service-Specific Patterns',
      '    Recurring implementation patterns observed *inside this service* —',
      '    e.g. repository pattern, command bus, saga pattern, finite state',
      "    machine. DO NOT write prescriptive 'should/must' rules — describe",
      '    what IS, not what to DO.',
      '',
      `Service docs live under docs/llm-wiki/wiki/services/. Output filename: services/${slugifyServiceId(serviceId)}.md`,
    ],
    sourceContext: {
      service,
      service_id: serviceId,
      analyzers: sliceAnalyzersForService(serviceId, analyzers),
    },
    digestedUpstream: scoped,
    tags: deriveServiceTags(service),
    serviceId,
  };
}

/**
 * Tags surfaced into a service page's frontmatter and into `index.md`'s
 * summary catalog. Bounded to a small curated set.
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
 * Normalize a free-form `frameworks.main` string into clean lowercase tag
 * tokens. Split on `+`, strip version constraints, drop `@scope/`, lowercase,
 * dash-slugify whitespace.
 */
function cleanFrameworkTokens(raw: string): string[] {
  const parts = raw.split('+').map((p) => p.trim());
  const out: string[] = [];
  for (const part of parts) {
    if (part.length === 0) continue;
    let cleaned = part.replace(/\s+[\^~>=<]?[\d][\w.\-*]*\s*$/, '').trim();
    if (cleaned.length === 0) continue;
    cleaned = cleaned.replace(/^@[^/]+\//, '');
    cleaned = cleaned.toLowerCase().replace(/\s+/g, '-');
    if (cleaned.length === 0 || cleaned.length > 30) continue;
    out.push(cleaned);
  }
  return out;
}

/**
 * Byte-identical cache-eligible prefix shared by every wiki-gen prompt in this run.
 * Constant framing placed at the start so the provider prefix cache hits on calls 2..N.
 */
export function buildWikiSharedPrefix(projectPath: string): string {
  return [
    `Closed-book synthesis instructions for the LLM-wiki page generators in ${projectPath}:`,
    '',
    '- You have NO tools. Synthesize the page from the structured input below only.',
    '- If a fact the page should carry is not in the input, write `(not determined by analysis)` and continue. Do not invent.',
    '- For in-wiki cross-references use `[[wikilinks]]`. Do NOT emit inline `^[...]` citation markers — they are non-standard markdown and the Stop hook rejects them.',
    '- Return markdown body only. Do not include YAML frontmatter. Do not wrap the response in code fences. The framework injects the frontmatter (`document_type`, `summary`, `last_updated`, `tags`, `related`, `service_id`) automatically — never write any of those keys yourself.',
    '',
  ].join('\n');
}

export function buildPrompt(spec: WikiDocumentSpec, projectPath: string): string {
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
    'Doc length target: **aim 200–500 lines**, hard cap 700. Each major',
    'section should be 2–4 paragraphs; lists of services / communities can',
    'be longer but should be tabular, not prose.',
    'When you mention a discovered service ID (any `id` from `structure_architecture.findings.services`), wrap the FIRST mention of each ID in `[[<id>]]` so it links to the per-service doc at `services/<id>.md`. Subsequent mentions of the same id may be plain text or `[[<id>]]`. Do NOT wikilink ids that were not discovered by the structure analyzer.',
    '',
    'Required sections (every heading MUST appear; mark with `(not determined by analysis)` when the upstream + graph + Read all came up empty):',
    '',
    '  ## Monorepo / Repository Shape',
    '    Repository type (monorepo / polyrepo / multi-repo), workspace tool,',
    '    top-level layout. List every workspace and service in a table.',
    '',
    '  ## Service Inventory',
    '    Table listing every real service with: id, type, language, port,',
    '    role (one line). Every id wikilinked on first mention.',
    '',
    '  ## Service Communication',
    '    EXHAUSTIVE list of every inter-service call: source → target,',
    '    protocol (HTTP / gRPC / queue / event / WebSocket / etc.),',
    '    data-shape reference. Use the graph (`mcp__code_graph__query_graph_tool`)',
    '    to enumerate cross-service edges when the upstream lacks them.',
    '',
    '  ## External Integrations',
    '    EXHAUSTIVE list of every external vendor / API / SDK the project',
    '    talks to: vendor name, in-repo client wrapper path, auth mechanism,',
    '    environments served. Stripe, Auth0, Sentry, etc.',
    '',
    '  ## Authentication & Authorisation',
    '    Flow per identity provider, token shape, session lifecycle, role /',
    '    permission registry. Walk the auth flow end-to-end: how a user',
    '    request becomes an authenticated session, where tokens are minted',
    '    and validated, how roles flow into authorisation checks.',
    '',
    '  ## Request Lifecycle',
    '    For the most common request path in this project, narrate the',
    '    step-by-step flow citing where each step lives. When the project',
    '    has materially-different lifecycles for different surfaces',
    '    (e.g. browser request vs queue-triggered job), include one walk',
    '    per lifecycle.',
    '',
    '  ## Data Architecture',
    '    Operational data stores (databases, caches, queues, object stores).',
    '    For each: technology, ownership boundary, schema-management approach',
    '    (migrations / hand-rolled / generated), local-dev story.',
    '',
    '  ## Deployment Topology',
    '    Every deployment target (Cloud Run / Lambda / Kubernetes / serverless /',
    '    on-prem / etc.) with the service it hosts and the trigger that',
    '    deploys it (CI workflow, manual command, etc.).',
    '',
    '  ## Local Development',
    '    How a developer runs the full local stack: docker-compose? Make',
    '    targets? Emulators (Firebase / DynamoDB local / etc.)? Ports?',
    '',
    '  ## Automation & CI',
    '    Primary automation interface (Makefile / Justfile / Taskfile /',
    '    npm scripts / etc.) and CI provider with the workflows it runs.',
  ];

  if (hasCouplingHotspots(analyzers.structure_architecture)) {
    promptFocus.push(
      'Include a "## Coupling hotspots" section listing the hub and bridge nodes from `structure_architecture.findings.architecture.coupling`. For each entry render `- \\`<qualified_name>\\` (<kind>, score <score>)`. Use the qualified_name verbatim — do not invent or rename.',
    );
  }

  return {
    filename: 'ARCHITECTURE.md',
    documentType: 'architecture',
    title: 'Architecture',
    promptFocus,
    sourceContext: {
      stack_profile: stackProfile,
      structure_architecture: pruneWikiUnusedFields(analyzers.structure_architecture),
    },
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
 * languages from the stack profile so the index entry can be filtered by stack
 * at a glance.
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
 * any of the provided keywords. Keeps the prompt tight.
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

function extractRelevantMarkdownSections(markdown: string, keywords: string[]): string {
  const lines = markdown.split('\n');
  const lower = keywords.map((k) => k.toLowerCase());
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  const preamble: string[] = [];

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
 * prompt for service A doesn't carry every fact about service B.
 */
function sliceAnalyzersForService(
  serviceId: string,
  analyzers: WikiAnalyzerOutputs,
): WikiAnalyzerOutputs {
  return {
    structure_architecture: pruneWikiUnusedFields(
      sliceAnalyzerForService(analyzers.structure_architecture, serviceId),
    ),
    tech_stack_dependencies: pruneWikiUnusedFields(
      sliceAnalyzerForService(analyzers.tech_stack_dependencies, serviceId),
    ),
    code_patterns_testing: pruneWikiUnusedFields(
      sliceAnalyzerForService(analyzers.code_patterns_testing, serviceId),
    ),
    data_flows_integrations: pruneWikiUnusedFields(
      sliceAnalyzerForService(analyzers.data_flows_integrations, serviceId),
    ),
  };
}

/**
 * Drop debug-only or verbose fields the wiki-generator prompt does not need.
 * Removes top-level telemetry (`graph_queries_used`, `agent_name`, `timestamp`),
 * full dep lists (`production`, `development`, `shared_across_services`), and
 * verbose test-file regexes (`file_pattern`, `file_patterns`).
 */
function pruneWikiUnusedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneWikiUnusedFields(entry)) as unknown as T;
  }
  if (!isRecord(value)) return value;
  const TOP_LEVEL_DROP = new Set(['graph_queries_used', 'agent_name', 'timestamp']);
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (TOP_LEVEL_DROP.has(key)) continue;
    if (key === 'production' || key === 'development' || key === 'shared_across_services') {
      continue;
    }
    if (key === 'file_pattern' || key === 'file_patterns') {
      continue;
    }
    next[key] = pruneWikiUnusedFields(raw);
  }
  return next as T;
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
