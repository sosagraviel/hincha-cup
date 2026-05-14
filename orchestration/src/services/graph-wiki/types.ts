import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';
import type { Provider } from '../../providers/types.js';
import type { PhaseSlot } from '../framework/debug-store/index.js';

export const LLM_WIKI_FILE_NAMES = ['index.md', 'ARCHITECTURE.md', 'SERVICES.md'] as const;

export const LLM_WIKI_CORE_GENERATION_ORDER = ['ARCHITECTURE.md'] as const;

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
 */
export const ALL_SCHEMA_FILENAMES = ['CLAUDE.md', 'AGENTS.md', 'COPILOT.md'] as const;

export const LLM_WIKI_ROOT_FILE_NAMES_BASE = ['.state.json'] as const;
export const LLM_WIKI_RAW_SUBDIRS = ['external', 'snapshots'] as const;

export const WIKI_AGENT_NAME = 'wiki-generator';
export const WIKI_AGENT_FILE = '07-wiki-generator.md';

export const REQUIRED_ANALYZERS = [
  'structure_architecture',
  'tech_stack_dependencies',
  'code_patterns_testing',
  'data_flows_integrations',
] as const;

export type CoreLlmDocumentType = 'architecture';

export type CoreWikiFileName = (typeof LLM_WIKI_FILE_NAMES)[number];
export type SchemaFileName = (typeof ALL_SCHEMA_FILENAMES)[number];
export type GeneratedWikiFilename =
  | CoreWikiFileName
  | SchemaFileName
  | `wiki/${string}`
  | `services/${string}.md`
  | '.state.json'
  | `raw/${string}`;

/**
 * Frontmatter contract for every wiki page. Kept deliberately small — the
 * larger contract (sources, confidence, graph_version, etc.) was retired in
 * the 2026-05 wiki simplification pass. `index.md` reads `summary`/`tags`/
 * `related` to build the Tier-1 catalog; `last_updated` is the only timestamp.
 */
export interface WikiPageFrontmatter {
  document_type: 'architecture' | 'service' | 'services' | 'index';
  summary: string;
  last_updated: string;
  tags?: string[];
  related?: string[];
  service_id?: string;
}

/**
 * Wiki state file shape (`docs/llm-wiki/.state.json`). `repos` is a map keyed
 * by repo identifier — `"."` for single-repo, child directory name for
 * multi-repo — to the commit sha the wiki was last refreshed against. All
 * graph state (graph_sha / graph_commit / pipeline_version / graph_stats)
 * lives in `.code-review-graph/.state.json`, not here.
 */
export interface WikiStateJson {
  repos: Record<string, string>;
  last_refresh_at: string;
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
 * All four are produced by earlier phases and live on disk before Phase 4b
 * runs. The wiki-generator agent has no filesystem access — these strings
 * are the sole source of truth for every page it renders.
 */
export interface WikiDigestedUpstream {
  synthesis?: string;
  claudeMd?: string;
  architecturalNarrative?: string;
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
   * Default 3.
   */
  serviceDocConcurrency?: number;
  agentInvoker?: WikiAgentInvoker;
  /**
   * Phase coordinate threaded through to the per-attempt debug bucket.
   * When absent, debug attempts are bucketed under `phase-unknown/`.
   */
  phase?: PhaseSlot;
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
  documentType: 'architecture' | 'service' | 'services' | 'index';
  title: string;
  promptFocus: string[];
  /**
   * Structured upstream context the agent synthesizes from. Includes the
   * relevant analyzer slice, stack profile slice, and (for core docs) sliced
   * narrative from synthesis / CLAUDE.md / architectural-narrative.
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
    architecturalNarrative?: string;
  };
  /**
   * Curated tags rendered into the page frontmatter (`tags:` field). Used by
   * `index.md` to enrich its summary catalog without re-deriving structure.
   */
  tags?: string[];
  /**
   * Service docs only — passed through to frontmatter as `service_id`.
   */
  serviceId?: string;
}
