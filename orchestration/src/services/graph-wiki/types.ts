import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';
import type { Provider } from '../../providers/types.js';

export const LLM_WIKI_FILE_NAMES = [
  'index.md',
  'ARCHITECTURE.md',
  'SERVICES.md',
  'DATA-FLOWS.md',
  'PATTERNS.md',
] as const;

// Core docs that are LLM-generated in parallel. SERVICES.md is intentionally
// excluded — it is now a deterministic catalog assembled in the finalization step.
export const LLM_WIKI_CORE_GENERATION_ORDER = [
  'ARCHITECTURE.md',
  'DATA-FLOWS.md',
  'PATTERNS.md',
] as const;

export const LLM_WIKI_CONTEXT_START = '<!-- LLM_WIKI_START -->';
export const LLM_WIKI_CONTEXT_END = '<!-- LLM_WIKI_END -->';

export const GRAPH_DISCIPLINE_CONTEXT_START = '<!-- GRAPH_DISCIPLINE_START -->';
export const GRAPH_DISCIPLINE_CONTEXT_END = '<!-- GRAPH_DISCIPLINE_END -->';

/**
 * Maps each supported provider to the schema filename it auto-discovers.
 * Exactly one of these files exists in docs/llm-wiki/ at any time.
 */
export const SCHEMA_FILENAME_BY_PROVIDER: Record<Provider, 'CLAUDE.md' | 'AGENTS.md'> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
};

/**
 * All schema filenames that may ever exist in docs/llm-wiki/.
 * Used by the cleanup sweep to remove stale variants on provider switch.
 * Includes COPILOT.md so a stale file from any future provider gets swept.
 */
export const ALL_SCHEMA_FILENAMES = ['CLAUDE.md', 'AGENTS.md', 'COPILOT.md'] as const;

export const LLM_WIKI_ROOT_FILE_NAMES_BASE = ['CHANGELOG.md', 'log.md', '.state.json'] as const;
export const LLM_WIKI_RAW_SUBDIRS = ['external', 'snapshots'] as const;

export const GENERATED_BY = 'ai-agentic-framework';
export const WIKI_AGENT_NAME = 'wiki-generator';
export const WIKI_AGENT_FILE = '07-wiki-generator.md';

export const REQUIRED_ANALYZERS = [
  'structure_architecture',
  'tech_stack_dependencies',
  'code_patterns_testing',
  'data_flows_integrations',
] as const;

export type CoreLlmDocumentType = 'architecture' | 'data-flow' | 'pattern';

export type CoreWikiFileName = (typeof LLM_WIKI_FILE_NAMES)[number];
export type SchemaFileName = (typeof ALL_SCHEMA_FILENAMES)[number];
export type GeneratedWikiFilename =
  | CoreWikiFileName
  | SchemaFileName
  | `wiki/${string}`
  | `services/${string}.md`
  | 'CHANGELOG.md'
  | 'log.md'
  | '.state.json'
  | `raw/${string}`;

export interface WikiSource {
  path: string;
  sha256: string;
  ingested_at: string;
  commit: string;
}

export interface WikiPageFrontmatter {
  document_type:
    | 'architecture'
    | 'data-flow'
    | 'pattern'
    | 'service'
    | 'services'
    | 'index'
    | 'schema';
  generated_at: string;
  generated_by: string;
  graph_version: string;
  graph_commit: string;
  graph_queries_used: string[];
  summary: string;
  sources: WikiSource[];
  confidence: 'high' | 'medium' | 'low';
  related: string[];
  last_verified: string;
  /**
   * Optional curated tags. Source: analyzer findings (service language /
   * framework / type for service docs; analyzer-derived top tags for core
   * docs). Used by `index.md` to render summary catalog entries inline so
   * Tier 1 retrieval is one read instead of N frontmatter scans.
   */
  tags?: string[];
  service_id?: string;
  entry_points?: string[];
  dependencies?: Record<string, unknown>;
  community_id?: string;
}

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
  stats?: CodeGraphStats;
  error?: string;
}

export interface WikiAgentInvocation {
  documentType: string;
  filename: GeneratedWikiFilename;
  prompt: string;
}

export type WikiAgentInvoker = (invocation: WikiAgentInvocation) => Promise<string>;

/**
 * Digested upstream artifacts piped into the closed-book wiki-generator.
 * All four are produced by earlier phases of the same workflow and live on
 * disk before Phase 4b runs:
 *   - analyzer JSONs in `.<provider>-temp/initialize-project/phase1-outputs/`
 *   - `synthesis-raw.md` in `.<provider>-temp/initialize-project/`
 *   - generated CLAUDE.md / AGENTS.md at the project root
 *   - generated project-context/SKILL.md under `.<provider>/skills/`
 *
 * The wiki-generator agent has no filesystem access — these strings are the
 * sole source of truth for every page it renders.
 */
export interface WikiDigestedUpstream {
  synthesis?: string;
  claudeMd?: string;
  projectContext?: string;
}

export interface WikiGeneratorServiceOptions {
  projectPath: string;
  frameworkPath: string;
  provider: Provider;
  generatedAt?: string;
  analyzers: WikiAnalyzerOutputs;
  stackProfile?: unknown;
  graph: WikiGraphState;
  digestedUpstream?: WikiDigestedUpstream;
  /**
   * Maximum number of per-service docs the generator may render concurrently.
   * Service docs are LLM-backed; unbounded fan-out left half the sessions in
   * `pending` state during the gira smoke run. Default 3.
   */
  serviceDocConcurrency?: number;
  /**
   * Live MCP tool catalog from the running code-review-graph server. Templated
   * into the schema doc (router) so its "available graph tools" section can
   * never drift from server reality. Empty array when graph is unavailable.
   */
  codeGraphToolCatalog?: Array<{ name: string; description: string }>;
  agentInvoker?: WikiAgentInvoker;
}

export interface GeneratedWikiFile {
  filename: GeneratedWikiFilename;
  content: string;
}

export interface GeneratedLlmWiki {
  files: GeneratedWikiFile[];
  contextSection: string;
}

export interface WikiDocumentSpec {
  filename: GeneratedWikiFilename;
  documentType: string;
  title: string;
  /**
   * Graph queries the upstream Phase 1 analyzers ran while producing the JSON
   * that grounds this page. Surfaced verbatim into frontmatter for traceability.
   * The wiki-generator itself does NOT call graph tools — that work is upstream.
   */
  graphQueriesUsed: string[];
  promptFocus: string[];
  /**
   * Structured upstream context the agent synthesizes from. Includes the
   * relevant analyzer slice, stack profile slice, and (for core docs) sliced
   * narrative from synthesis / CLAUDE.md / project-context.
   */
  sourceContext: Record<string, unknown>;
  /**
   * Sliced narrative excerpts (markdown) from the digested upstream. Rendered
   * into the prompt verbatim so the agent does not have to re-derive structure
   * from the raw analyzer JSON when a synthesis paragraph already says it.
   */
  digestedUpstream?: {
    synthesis?: string;
    claudeMd?: string;
    projectContext?: string;
  };
  /**
   * Curated tags rendered into the page frontmatter (`tags:` field). Used by
   * `index.md` to enrich its summary catalog without re-deriving structure.
   */
  tags?: string[];
  frontmatterExtras?: Record<string, unknown>;
}
