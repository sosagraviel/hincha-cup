import { describe, it, expect, vi } from 'vitest';
import {
  translateHooksToProvider,
  parseClaudeSettingsToFrameworkHooks,
} from '../../../src/hooks/hook-translator.js';
import { Provider } from '../../../src/providers/types.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

describe('hook-translator', () => {
  describe('parseClaudeSettingsToFrameworkHooks', () => {
    it('should parse Claude settings.json into framework hooks', async () => {
      const { readFileSync } = await import('fs');
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [
              {
                matcher: 'structure-architecture-analyzer',
                hooks: [
                  {
                    type: 'command',
                    command: '${FRAMEWORK_PATH}/orchestration/hooks/validate.ts',
                  },
                ],
              },
            ],
          },
        }),
      );

      const hooks = parseClaudeSettingsToFrameworkHooks('/path/to/settings.json');
      expect(hooks).toHaveLength(1);
      expect(hooks[0].event).toBe('Stop');
      expect(hooks[0].matcher).toBe('structure-architecture-analyzer');
      expect(hooks[0].command).toContain('validate.ts');
    });

    it('should handle empty hooks', async () => {
      const { readFileSync } = await import('fs');
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ hooks: {} }));

      const hooks = parseClaudeSettingsToFrameworkHooks('/path/to/settings.json');
      expect(hooks).toHaveLength(0);
    });

    it('should handle multiple hooks in same event', async () => {
      const { readFileSync } = await import('fs');
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [
              {
                matcher: 'analyzer-1',
                hooks: [{ type: 'command', command: 'cmd1' }],
              },
              {
                matcher: 'analyzer-2',
                hooks: [{ type: 'command', command: 'cmd2' }],
              },
            ],
          },
        }),
      );

      const hooks = parseClaudeSettingsToFrameworkHooks('/path/to/settings.json');
      expect(hooks).toHaveLength(2);
      expect(hooks[0].matcher).toBe('analyzer-1');
      expect(hooks[1].matcher).toBe('analyzer-2');
    });
  });

  describe('translateHooksToProvider', () => {
    const frameworkHooks = [
      {
        event: 'Stop' as const,
        matcher: 'test-agent',
        command: '${FRAMEWORK_PATH}/hooks/validate.ts',
      },
    ];

    it('should translate to Claude format', () => {
      const result = JSON.parse(
        translateHooksToProvider(frameworkHooks, Provider.CLAUDE, '/framework'),
      );
      expect(result.hooks.Stop).toHaveLength(1);
      expect(result.hooks.Stop[0].matcher).toBe('test-agent');
      expect(result.hooks.Stop[0].hooks[0].type).toBe('command');
      expect(result.hooks.Stop[0].hooks[0].command).toBe('/framework/hooks/validate.ts');
    });

    it('should translate to Codex format', () => {
      const result = JSON.parse(
        translateHooksToProvider(frameworkHooks, Provider.CODEX, '/framework'),
      );
      expect(result.hooks).toHaveLength(1);
      expect(result.hooks[0].event).toBe('Stop');
      expect(result.hooks[0].handler.type).toBe('command');
      expect(result.hooks[0].handler.command).toBe('/framework/hooks/validate.ts');
    });

    it('should resolve ${FRAMEWORK_PATH} placeholders', () => {
      const result = JSON.parse(
        translateHooksToProvider(frameworkHooks, Provider.CLAUDE, '/my/framework'),
      );
      expect(result.hooks.Stop[0].hooks[0].command).toBe('/my/framework/hooks/validate.ts');
      expect(result.hooks.Stop[0].hooks[0].command).not.toContain('${FRAMEWORK_PATH}');
    });

    it('should handle multiple hooks', () => {
      const multiHooks = [
        { event: 'Stop' as const, matcher: 'agent-1', command: 'cmd1' },
        { event: 'PreToolUse' as const, matcher: 'agent-2', command: 'cmd2' },
      ];

      const claudeResult = JSON.parse(
        translateHooksToProvider(multiHooks, Provider.CLAUDE, '/framework'),
      );
      expect(claudeResult.hooks.Stop).toHaveLength(1);
      expect(claudeResult.hooks.PreToolUse).toHaveLength(1);

      const codexResult = JSON.parse(
        translateHooksToProvider(multiHooks, Provider.CODEX, '/framework'),
      );
      expect(codexResult.hooks).toHaveLength(2);
    });
  });
});
