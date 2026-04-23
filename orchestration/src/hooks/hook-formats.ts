/**
 * Hook format types for multi-provider support.
 *
 * Defines the framework-internal hook format and both provider-specific formats
 * (Claude settings.json and Codex hooks.json).
 */

/**
 * Framework-internal hook definition (provider-agnostic)
 */
export interface FrameworkHook {
  event: 'Stop' | 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit';
  matcher?: string;
  command: string;
}

/**
 * Claude settings.json hook format
 */
export interface ClaudeHookConfig {
  hooks: {
    [event: string]: Array<{
      matcher: string;
      hooks: Array<{
        type: 'command';
        if?: string;
        command: string;
      }>;
    }>;
  };
}

/**
 * Codex hooks.json hook format
 */
export interface CodexHookConfig {
  hooks: Array<{
    event: string;
    match?: Array<{
      type: string;
      tool_name_re?: string;
    }>;
    handler: {
      type: 'command';
      command: string;
    };
  }>;
}
