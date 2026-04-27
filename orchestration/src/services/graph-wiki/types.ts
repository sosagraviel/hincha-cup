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

export interface WikiGeneratorServiceOptions {
  projectPath: string;
  frameworkPath: string;
  provider: Provider;
  generatedAt?: string;
  analyzers: WikiAnalyzerOutputs;
  stackProfile?: unknown;
  graph: WikiGraphState;
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
  graphQueriesUsed: string[];
  graphTools: string[];
  promptFocus: string[];
  sourceContext: Record<string, unknown>;
  frontmatterExtras?: Record<string, unknown>;
}
