/**
 * Hook translator for multi-provider support.
 *
 * Converts between framework-internal hook format and provider-specific formats.
 * Handles both Claude settings.json and Codex hooks.json formats.
 */

import { readFileSync } from 'fs';
import { Provider } from '../providers/types.js';
import type { FrameworkHook, ClaudeHookConfig, CodexHookConfig } from './hook-formats.js';

/**
 * Parse a Claude settings.json file into framework hooks
 */
export function parseClaudeSettingsToFrameworkHooks(settingsPath: string): FrameworkHook[] {
  const content = readFileSync(settingsPath, 'utf-8');
  const settings: ClaudeHookConfig = JSON.parse(content);
  const hooks: FrameworkHook[] = [];

  if (!settings.hooks) return hooks;

  for (const [event, entries] of Object.entries(settings.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        hooks.push({
          event: event as FrameworkHook['event'],
          matcher: entry.matcher,
          command: hook.command,
        });
      }
    }
  }

  return hooks;
}

/**
 * Translate framework hooks to provider-specific format
 */
export function translateHooksToProvider(
  hooks: FrameworkHook[],
  provider: Provider,
  frameworkPath: string,
): string {
  const resolvedHooks = hooks.map((hook) => ({
    ...hook,
    command: hook.command.replace(/\$\{FRAMEWORK_PATH\}|\$FRAMEWORK_PATH/g, frameworkPath),
  }));

  switch (provider) {
    case Provider.CLAUDE:
      return JSON.stringify(toClaudeFormat(resolvedHooks), null, 2);
    case Provider.CODEX:
      return JSON.stringify(toCodexFormat(resolvedHooks), null, 2);
  }
}

/**
 * Convert to Claude settings.json format
 */
function toClaudeFormat(hooks: FrameworkHook[]): ClaudeHookConfig {
  const result: ClaudeHookConfig = { hooks: {} };

  for (const hook of hooks) {
    if (!result.hooks[hook.event]) {
      result.hooks[hook.event] = [];
    }
    result.hooks[hook.event].push({
      matcher: hook.matcher || '.*',
      hooks: [{ type: 'command', command: hook.command }],
    });
  }

  return result;
}

/**
 * Convert to Codex hooks.json format
 */
function toCodexFormat(hooks: FrameworkHook[]): CodexHookConfig {
  return {
    hooks: hooks.map((hook) => ({
      event: hook.event,
      ...(hook.matcher
        ? {
            match: [{ type: 'tool_use', tool_name_re: '.*' }],
          }
        : {}),
      handler: {
        type: 'command' as const,
        command: hook.command,
      },
    })),
  };
}
