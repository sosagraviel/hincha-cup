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
  const sanitizedUpstream = sanitizeWikiUpstream(digestedUpstream);
  return [
    architectureSpec(analyzers, stackProfile, graph, sanitizedUpstream),
    dataFlowsSpec(analyzers, stackProfile, sanitizedUpstream),
    patternsSpec(analyzers, stackProfile, sanitizedUpstream),
  ];
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
    graphQueriesUsed: normalizeGraphQueriesUsed([
      ...((analyzers.structure_architecture?.graph_queries_used ?? []) as string[]),
      ...((analyzers.tech_stack_dependencies?.graph_queries_used ?? []) as string[]),
    ]),
    promptFocus: [
      `Document only the "${serviceId}" service.`,
      'Use the service-scoped analyzer slice as the inventory of facts about this service.',
      'Cover purpose, entry points, dependencies, and any data-flow or pattern signals that mention this service.',
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

export function buildPrompt(spec: WikiDocumentSpec, projectPath: string): string {
  const lines: string[] = [
    `Generate ${spec.title} as narrative markdown for ${projectPath}.`,
    '',
    'Closed-book synthesis instructions:',
    '- You have NO tools. Synthesize the page from the structured input below only.',
    '- If a fact the page should carry is not in the input, write `(not determined by analysis)` and continue. Do not invent.',
    '- Provenance lives in YAML frontmatter (`sources:` + `confidence:`), auto-injected by the framework. DO NOT emit inline `^[...]` citation markers in the body — they are non-standard markdown and the Stop hook rejects them. For in-wiki cross-references use `[[wikilinks]]`; for gaps write `(not determined by analysis)`.',
    '- Return markdown body only. Do not include YAML frontmatter. Do not wrap the response in code fences.',
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
  if (upstream.projectContext && upstream.projectContext.trim().length > 0) {
    sections.push('--- begin: project-context skill (relevant excerpt) ---');
    sections.push(upstream.projectContext.trim());
    sections.push('--- end: project-context skill ---');
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
  return {
    filename: 'ARCHITECTURE.md',
    documentType: 'architecture',
    title: 'Architecture',
    graphQueriesUsed: normalizeGraphQueriesUsed(
      (analyzers.structure_architecture?.graph_queries_used ?? []) as string[],
    ),
    promptFocus: [
      'Describe monorepo / multi-repo shape, service boundaries, communities, and high-level relationships.',
      'Use `structure_architecture` analyzer findings as the structural ground truth.',
      'Architecture docs live under docs/llm-wiki/wiki/. Output filename: ARCHITECTURE.md',
    ],
    sourceContext: {
      graph_stats: graph.stats ?? null,
      stack_profile: stackProfile,
      structure_architecture: analyzers.structure_architecture,
    },
    digestedUpstream: scopeDigestedUpstream(digestedUpstream, [
      'architecture',
      'topology',
      'monorepo',
      'workspace',
      'services',
    ]),
    tags: deriveCoreTags('architecture', stackProfile),
  };
}

function dataFlowsSpec(
  analyzers: WikiAnalyzerOutputs,
  stackProfile: unknown,
  digestedUpstream: WikiDigestedUpstream | undefined,
): WikiDocumentSpec {
  return {
    filename: 'DATA-FLOWS.md',
    documentType: 'data-flow',
    title: 'Data Flows',
    graphQueriesUsed: normalizeGraphQueriesUsed(
      (analyzers.data_flows_integrations?.graph_queries_used ?? []) as string[],
    ),
    promptFocus: [
      'Describe request lifecycles, auth, persistence, integrations, and middleware ordering.',
      'Use `data_flows_integrations` analyzer findings as the structural ground truth.',
      'Highlight the highest-signal flows in narrative markdown — do not enumerate every endpoint.',
      'Data flow docs live under docs/llm-wiki/wiki/. Output filename: DATA-FLOWS.md',
    ],
    sourceContext: {
      data_flows_integrations: analyzers.data_flows_integrations,
      stack_profile: stackProfile,
    },
    digestedUpstream: scopeDigestedUpstream(digestedUpstream, [
      'data flow',
      'request',
      'auth',
      'middleware',
      'persistence',
      'integration',
      'flow',
      'lifecycle',
    ]),
    tags: deriveCoreTags('data-flow', stackProfile),
  };
}

function patternsSpec(
  analyzers: WikiAnalyzerOutputs,
  stackProfile: unknown,
  digestedUpstream: WikiDigestedUpstream | undefined,
): WikiDocumentSpec {
  return {
    filename: 'PATTERNS.md',
    documentType: 'pattern',
    title: 'Patterns',
    graphQueriesUsed: normalizeGraphQueriesUsed(
      (analyzers.code_patterns_testing?.graph_queries_used ?? []) as string[],
    ),
    promptFocus: [
      'Describe recurring implementation patterns, conventions, code style, and testing approach.',
      'Use `code_patterns_testing` analyzer findings as the structural ground truth.',
      'Call out patterns observed at scale — not one-off exceptions.',
      'Pattern docs live under docs/llm-wiki/wiki/. Output filename: PATTERNS.md',
    ],
    sourceContext: {
      code_patterns_testing: analyzers.code_patterns_testing,
      stack_profile: stackProfile,
    },
    digestedUpstream: scopeDigestedUpstream(digestedUpstream, [
      'pattern',
      'convention',
      'testing',
      'test',
      'style',
      'lint',
      'quality',
    ]),
    tags: deriveCoreTags('pattern', stackProfile),
  };
}

/**
 * Curated tag set for core docs. Pulls the project's main languages from the
 * stack profile services so the architecture/data-flows/patterns index entries
 * can be filtered by stack at a glance. Bounded to ~5 tags per page.
 */
function deriveCoreTags(
  documentType: 'architecture' | 'data-flow' | 'pattern',
  stackProfile: unknown,
): string[] {
  const seedByType: Record<typeof documentType, string[]> = {
    architecture: ['architecture', 'topology'],
    'data-flow': ['data-flow', 'integrations'],
    pattern: ['patterns', 'testing'],
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
): WikiDigestedUpstream | undefined {
  if (!upstream) return undefined;

  return {
    synthesis: upstream.synthesis
      ? extractRelevantMarkdownSections(upstream.synthesis, keywords)
      : undefined,
    claudeMd: upstream.claudeMd
      ? extractRelevantMarkdownSections(upstream.claudeMd, keywords)
      : undefined,
    projectContext: upstream.projectContext
      ? extractRelevantMarkdownSections(upstream.projectContext, keywords)
      : undefined,
  };
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
