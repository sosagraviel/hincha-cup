/**
 * Normalized event schema — the shared event stream produced by every parser
 * (Claude JSONL, Codex rollout JSONL, DeepAgents message array). The HTML
 * renderer consumes this and nothing else, so it has zero provider-specific
 * branches.
 */

export type ProviderTag = 'claude' | 'codex' | 'deepagent';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  mediaType?: string;
  /** base64-encoded for `source.data`, or absolute URL if remote. */
  data?: string;
  url?: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string | object | Array<string | object>;
  isError?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  text: string;
}

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  serviceTier?: string;
  totalTokens?: number;
}

export interface BaseEvent {
  t: string;
  ts?: string;
  provider: ProviderTag;
  sessionId?: string;
}

export interface SessionStartEvent extends BaseEvent {
  t: 'session_start';
  model?: string;
  cwd?: string;
  agent?: string;
  cliVersion?: string;
  originator?: string;
}

export interface UserMessageEvent extends BaseEvent {
  t: 'user_message';
  content: ContentBlock[];
}

export interface AssistantMessageEvent extends BaseEvent {
  t: 'assistant_message';
  model?: string;
  content: ContentBlock[];
  usage?: Usage;
  stopReason?: string;
}

export interface ToolUseEvent extends BaseEvent {
  t: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultEvent extends BaseEvent {
  t: 'tool_result';
  toolUseId: string;
  content: string | object | Array<string | object>;
  isError?: boolean;
}

export interface ThinkingEvent extends BaseEvent {
  t: 'thinking';
  text: string;
}

export interface SystemEvent extends BaseEvent {
  t: 'system';
  subtype?: string;
  text?: string;
  level?: string;
}

export interface ValidationErrorEvent extends BaseEvent {
  t: 'validation_error';
  iteration?: number;
  errors: string[];
}

export interface ReasoningEvent extends BaseEvent {
  t: 'reasoning';
  summary?: string;
  text?: string;
}

export interface SessionEndEvent extends BaseEvent {
  t: 'session_end';
  outcome: 'success' | 'failure' | 'unknown';
  code?: number | null;
}

export type NormalizedEvent =
  | SessionStartEvent
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolUseEvent
  | ToolResultEvent
  | ThinkingEvent
  | SystemEvent
  | ValidationErrorEvent
  | ReasoningEvent
  | SessionEndEvent;

export function isMessageEvent(e: NormalizedEvent): e is UserMessageEvent | AssistantMessageEvent {
  return e.t === 'user_message' || e.t === 'assistant_message';
}
