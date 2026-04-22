import type { CodeGraphStats } from '../../state/schemas/initialize-project.schema.js';

export const AI_KNOWLEDGE_FILE_NAMES = [
  'index.md',
  'ARCHITECTURE.md',
  'SERVICES.md',
  'DATA-FLOWS.md',
  'PATTERNS.md',
] as const;

// Core docs that are LLM-generated in parallel. SERVICES.md is intentionally
// excluded — it is now a deterministic catalog assembled in the finalization step.
export const AI_KNOWLEDGE_CORE_GENERATION_ORDER = [
  'ARCHITECTURE.md',
  'DATA-FLOWS.md',
  'PATTERNS.md',
] as const;

export type CoreLlmDocumentType = 'architecture' | 'data-flow' | 'pattern';

export const AI_KNOWLEDGE_CONTEXT_START = '<!-- AI_KNOWLEDGE_WIKI_START -->';
export const AI_KNOWLEDGE_CONTEXT_END = '<!-- AI_KNOWLEDGE_WIKI_END -->';

export const GENERATED_BY = 'ai-agentic-framework';
export const WIKI_AGENT_NAME = 'wiki-generator';
export const WIKI_AGENT_FILE = '07-wiki-generator.md';

export const REQUIRED_ANALYZERS = [
  'structure_architecture',
  'tech_stack_dependencies',
  'code_patterns_testing',
  'data_flows_integrations',
] as const;

export type CoreWikiFileName = (typeof AI_KNOWLEDGE_FILE_NAMES)[number];
export type GeneratedWikiFilename = CoreWikiFileName | `services/${string}.md`;

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

export interface WikiAgentInvocation {
  documentType: string;
  filename: GeneratedWikiFilename;
  prompt: string;
}

export type WikiAgentInvoker = (invocation: WikiAgentInvocation) => Promise<string>;

export interface WikiGeneratorServiceOptions {
  projectPath: string;
  frameworkPath: string;
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

export interface GeneratedAiKnowledgeWiki {
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
