import { basename } from 'path';
import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';

export const AI_KNOWLEDGE_FILE_NAMES = [
  'index.md',
  'ARCHITECTURE.md',
  'SERVICES.md',
  'DATA-FLOWS.md',
  'PATTERNS.md',
] as const;

export const AI_KNOWLEDGE_CONTEXT_START = '<!-- AI_KNOWLEDGE_WIKI_START -->';
export const AI_KNOWLEDGE_CONTEXT_END = '<!-- AI_KNOWLEDGE_WIKI_END -->';

const NOT_DETECTED = 'Not detected in Phase 1 analysis.';

export interface AnalyzerDocument {
  agent_name?: string;
  timestamp?: string;
  graph_queries_used?: string[];
  findings?: unknown;
  [key: string]: unknown;
}

export interface WikiAnalyzerOutputs {
  structure_architecture?: AnalyzerDocument;
  tech_stack_dependencies?: AnalyzerDocument;
  code_patterns_testing?: AnalyzerDocument;
  data_flows_integrations?: AnalyzerDocument;
}

export interface WikiGraphState {
  available?: boolean;
  path?: string;
  mcpPort?: number;
  stats?: CodeGraphStats;
  error?: string;
}

export interface GenerateAiKnowledgeWikiInput {
  projectPath: string;
  generatedAt?: string;
  analyzers: WikiAnalyzerOutputs;
  stackProfile?: unknown;
  graph: WikiGraphState;
}

export interface GeneratedWikiFile {
  filename: (typeof AI_KNOWLEDGE_FILE_NAMES)[number];
  content: string;
}

export interface GeneratedAiKnowledgeWiki {
  files: GeneratedWikiFile[];
  contextSection: string;
}

export function generateAiKnowledgeWiki(
  input: GenerateAiKnowledgeWikiInput,
): GeneratedAiKnowledgeWiki {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const projectName = basename(input.projectPath);
  const graphQueries = collectGraphQueries(input.analyzers);

  const files: GeneratedWikiFile[] = [
    {
      filename: 'index.md',
      content: buildIndexDoc(projectName, generatedAt, input.graph, graphQueries),
    },
    {
      filename: 'ARCHITECTURE.md',
      content: buildArchitectureDoc(projectName, generatedAt, input),
    },
    {
      filename: 'SERVICES.md',
      content: buildServicesDoc(projectName, generatedAt, input.stackProfile),
    },
    {
      filename: 'DATA-FLOWS.md',
      content: buildDataFlowsDoc(projectName, generatedAt, input.analyzers.data_flows_integrations),
    },
    {
      filename: 'PATTERNS.md',
      content: buildPatternsDoc(projectName, generatedAt, input.analyzers.code_patterns_testing),
    },
  ];

  return {
    files,
    contextSection: buildContextSection(input.graph),
  };
}

export function upsertAiKnowledgeContextSection(content: string, section: string): string {
  const normalizedSection = section.trim();
  const sectionPattern = new RegExp(
    `${escapeRegExp(AI_KNOWLEDGE_CONTEXT_START)}[\\s\\S]*?${escapeRegExp(AI_KNOWLEDGE_CONTEXT_END)}`,
    'm',
  );

  if (sectionPattern.test(content)) {
    return ensureTrailingNewline(content.replace(sectionPattern, normalizedSection));
  }

  return ensureTrailingNewline(`${content.trimEnd()}\n\n${normalizedSection}`);
}

function buildIndexDoc(
  projectName: string,
  generatedAt: string,
  graph: WikiGraphState,
  graphQueries: string[],
): string {
  return joinSections([
    `# ${projectName} AI Knowledge Wiki`,
    `Generated: ${generatedAt}`,
    '',
    'This directory contains deterministic, AI-readable project notes generated during initialize-project. Use it as a first stop before broad code exploration.',
    '',
    '## Graph Status',
    renderGraphEvidence(graph),
    '',
    '## Pages',
    '- [Architecture](ARCHITECTURE.md)',
    '- [Services](SERVICES.md)',
    '- [Data flows](DATA-FLOWS.md)',
    '- [Patterns](PATTERNS.md)',
    '',
    '## How Agents Should Use This',
    '- Read the relevant page before making broad changes.',
    '- Use the wiki for orientation, then inspect source files for implementation details.',
    '- Prefer graph-backed evidence where `graph_queries_used` is listed.',
    '',
    '## Graph Queries Used During Analysis',
    renderStringList(graphQueries),
  ]);
}

function buildArchitectureDoc(
  projectName: string,
  generatedAt: string,
  input: GenerateAiKnowledgeWikiInput,
): string {
  const structureFindings = getFindings(input.analyzers.structure_architecture);
  const services = getServices(input.stackProfile);

  return joinSections([
    `# ${projectName} Architecture`,
    `Generated: ${generatedAt}`,
    '',
    '## Graph Evidence',
    renderGraphEvidence(input.graph),
    '',
    '## Services And Directories',
    renderServiceBullets(services),
    '',
    '## Structure Analyzer Evidence',
    renderSelectedFindings(structureFindings, [
      'project_structure',
      'directory_structure',
      'services',
      'architecture_patterns',
      'architectural_patterns',
      'patterns',
      'monorepo',
      'workspaces',
      'entry_points',
    ]),
    '',
    '## Graph Queries Used',
    renderStringList(input.analyzers.structure_architecture?.graph_queries_used ?? []),
  ]);
}

function buildServicesDoc(projectName: string, generatedAt: string, stackProfile: unknown): string {
  const services = getServices(stackProfile);

  return joinSections([
    `# ${projectName} Services`,
    `Generated: ${generatedAt}`,
    '',
    '## Service Inventory',
    renderServiceTable(services, stackProfile),
  ]);
}

function buildDataFlowsDoc(
  projectName: string,
  generatedAt: string,
  dataFlowsAnalyzer?: AnalyzerDocument,
): string {
  const findings = getFindings(dataFlowsAnalyzer);

  return joinSections([
    `# ${projectName} Data Flows`,
    `Generated: ${generatedAt}`,
    '',
    '## Flow Evidence',
    renderSelectedFindings(findings, [
      'routes',
      'api_routes',
      'endpoints',
      'controllers',
      'flows',
      'data_flows',
      'integrations',
      'external_integrations',
      'persistence',
      'database',
      'auth',
      'authentication',
    ]),
    '',
    '## Graph Queries Used',
    renderStringList(dataFlowsAnalyzer?.graph_queries_used ?? []),
  ]);
}

function buildPatternsDoc(
  projectName: string,
  generatedAt: string,
  patternsAnalyzer?: AnalyzerDocument,
): string {
  const findings = getFindings(patternsAnalyzer);

  return joinSections([
    `# ${projectName} Patterns`,
    `Generated: ${generatedAt}`,
    '',
    '## Pattern Evidence',
    renderSelectedFindings(findings, [
      'patterns',
      'code_patterns',
      'testing',
      'testing_frameworks',
      'test_strategy',
      'conventions',
      'quality',
      'large_functions',
      'anti_patterns',
    ]),
    '',
    '## Graph Queries Used',
    renderStringList(patternsAnalyzer?.graph_queries_used ?? []),
  ]);
}

function buildContextSection(graph: WikiGraphState): string {
  const graphLine = graph.available
    ? `- Graph-backed docs: generated from ${graph.path ? relativeGraphPath(graph.path) : '.code-graph.db'} and graph-enhanced analyzer outputs.`
    : '- Graph-backed docs: generated from analyzer outputs; code graph was unavailable for this run.';

  return [
    AI_KNOWLEDGE_CONTEXT_START,
    '## AI Knowledge Wiki',
    '- Wiki: `docs/ai-knowledge/index.md`',
    graphLine,
    '- Before broad code changes, consult the relevant `docs/ai-knowledge/` page, then inspect source files for details.',
    AI_KNOWLEDGE_CONTEXT_END,
  ].join('\n');
}

function renderGraphEvidence(graph: WikiGraphState): string {
  const lines = [
    `- Available: ${graph.available ? 'yes' : 'no'}`,
    graph.path ? `- Database: ${relativeGraphPath(graph.path)}` : undefined,
    graph.mcpPort ? `- MCP port: ${graph.mcpPort}` : undefined,
    graph.error ? `- Error: ${graph.error}` : undefined,
  ].filter(Boolean) as string[];

  if (graph.stats) {
    const stats = graph.stats;
    const statsParts = [
      stats.files !== undefined ? `files=${stats.files}` : undefined,
      stats.functions !== undefined ? `functions=${stats.functions}` : undefined,
      stats.classes !== undefined ? `classes=${stats.classes}` : undefined,
      stats.edges !== undefined ? `edges=${stats.edges}` : undefined,
      stats.languages?.length ? `languages=${stats.languages.join(', ')}` : undefined,
      stats.build_time_ms !== undefined ? `build_time_ms=${stats.build_time_ms}` : undefined,
    ].filter(Boolean);

    if (statsParts.length > 0) {
      lines.push(`- Stats: ${statsParts.join('; ')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : NOT_DETECTED;
}

function renderSelectedFindings(findings: unknown, preferredKeys: string[]): string {
  if (!isRecord(findings)) {
    return NOT_DETECTED;
  }

  const sections: string[] = [];
  const usedKeys = new Set<string>();

  for (const key of preferredKeys) {
    const value = findValueByKey(findings, key);
    if (value === undefined || isEmptyValue(value)) {
      continue;
    }

    usedKeys.add(key);
    sections.push(`### ${formatTitle(key)}`);
    sections.push(renderMarkdownValue(value));
  }

  if (sections.length === 0) {
    const fallbackKeys = Object.keys(findings)
      .filter((key) => !usedKeys.has(key))
      .slice(0, 8);
    for (const key of fallbackKeys) {
      const value = findings[key];
      if (isEmptyValue(value)) {
        continue;
      }
      sections.push(`### ${formatTitle(key)}`);
      sections.push(renderMarkdownValue(value));
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : NOT_DETECTED;
}

function renderMarkdownValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return NOT_DETECTED;
    }
    return value.map((item) => `- ${summarizeValue(item)}`).join('\n');
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, entryValue]) => !isEmptyValue(entryValue));
    if (entries.length === 0) {
      return NOT_DETECTED;
    }

    return entries
      .slice(0, 12)
      .map(([key, entryValue]) => `- ${formatTitle(key)}: ${summarizeValue(entryValue)}`)
      .join('\n');
  }

  return `- ${summarizeValue(value)}`;
}

function renderServiceTable(services: Record<string, unknown>[], stackProfile: unknown): string {
  if (services.length === 0) {
    return NOT_DETECTED;
  }

  const packageManager = isRecord(stackProfile) ? stringOrDash(stackProfile.package_manager) : '-';
  const header = '| ID | Path | Type | Language | Main Framework | Testing | Package Manager |';
  const divider = '| --- | --- | --- | --- | --- | --- | --- |';
  const rows = services.map((service) => {
    const frameworks = isRecord(service.frameworks) ? service.frameworks : {};
    return [
      stringOrDash(service.id ?? service.name),
      stringOrDash(service.path),
      stringOrDash(service.type),
      stringOrDash(service.language),
      stringOrDash(frameworks.main),
      stringOrDash(frameworks.testing),
      stringOrDash(service.package_manager ?? packageManager),
    ]
      .map(escapeTableCell)
      .join(' | ');
  });

  return [header, divider, ...rows.map((row) => `| ${row} |`)].join('\n');
}

function renderServiceBullets(services: Record<string, unknown>[]): string {
  if (services.length === 0) {
    return NOT_DETECTED;
  }

  return services.map((service) => `- ${summarizeValue(service)}`).join('\n');
}

function renderStringList(values: string[]): string {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  return uniqueValues.length > 0
    ? uniqueValues.map((value) => `- ${value}`).join('\n')
    : NOT_DETECTED;
}

function collectGraphQueries(analyzers: WikiAnalyzerOutputs): string[] {
  return [
    ...(analyzers.structure_architecture?.graph_queries_used ?? []),
    ...(analyzers.tech_stack_dependencies?.graph_queries_used ?? []),
    ...(analyzers.code_patterns_testing?.graph_queries_used ?? []),
    ...(analyzers.data_flows_integrations?.graph_queries_used ?? []),
  ].filter(Boolean);
}

function getFindings(analyzer?: AnalyzerDocument): unknown {
  return analyzer?.findings;
}

function getServices(stackProfile: unknown): Record<string, unknown>[] {
  if (!isRecord(stackProfile) || !Array.isArray(stackProfile.services)) {
    return [];
  }

  return stackProfile.services.filter(isRecord);
}

function findValueByKey(value: Record<string, unknown>, targetKey: string): unknown {
  if (Object.prototype.hasOwnProperty.call(value, targetKey)) {
    return value[targetKey];
  }

  const normalizedTarget = normalizeKey(targetKey);
  for (const [key, entryValue] of Object.entries(value)) {
    if (normalizeKey(key) === normalizedTarget) {
      return entryValue;
    }
  }

  return undefined;
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return NOT_DETECTED;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return truncate(String(value));
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return NOT_DETECTED;
    }
    return truncate(value.map(summarizeValue).join('; '));
  }

  if (isRecord(value)) {
    const preferred = [
      'id',
      'name',
      'path',
      'type',
      'language',
      'framework',
      'main',
      'method',
      'route',
      'source',
      'target',
      'description',
    ];
    const parts: string[] = [];

    for (const key of preferred) {
      const entryValue = findValueByKey(value, key);
      if (!isEmptyValue(entryValue)) {
        parts.push(`${formatTitle(key)}: ${summarizeValue(entryValue)}`);
      }
    }

    if (parts.length > 0) {
      return truncate(parts.join(', '));
    }

    return truncate(JSON.stringify(value));
  }

  return truncate(String(value));
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatTitle(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeKey(key: string): string {
  return key.replace(/[_-\s]/g, '').toLowerCase();
}

function stringOrDash(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '-';
  }
  return String(value);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function truncate(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function relativeGraphPath(graphPath: string): string {
  return graphPath.endsWith('/.code-graph.db') ? '.code-graph.db' : graphPath;
}

function joinSections(sections: string[]): string {
  return ensureTrailingNewline(sections.join('\n'));
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
