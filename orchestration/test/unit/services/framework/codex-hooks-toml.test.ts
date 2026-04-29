import { describe, expect, it } from 'vitest';
import {
  removeCodexPathRestrictionHookBlock,
  renderCodexPathRestrictionHookBlock,
  upsertCodexPathRestrictionHookBlock,
} from '../../../../src/services/framework/codex-hooks-toml.js';

const HOOK = {
  tsxBin: '/fw/orchestration/node_modules/.bin/tsx',
  hookScript:
    '/fw/orchestration/src/nodes/initialize-project/shared/hooks/restrict-agent-paths.hook.ts',
};

describe('renderCodexPathRestrictionHookBlock', () => {
  it('produces a TOML block with the framework sentinel comments', () => {
    const block = renderCodexPathRestrictionHookBlock(HOOK);
    expect(block).toContain(
      '# === ai-agentic-framework: codex hooks (managed; do not edit by hand) ===',
    );
    expect(block).toContain('# === end: ai-agentic-framework codex hooks ===');
  });

  it('enables the codex_hooks feature flag via dotted key (no [features] table conflict)', () => {
    const block = renderCodexPathRestrictionHookBlock(HOOK);
    expect(block).toContain('features.codex_hooks = true');
    // Must NOT emit a `[features]` table header — that would conflict with a
    // user-defined `[features]` table elsewhere in the file. We check on
    // non-comment lines only (the rendered block contains a comment that
    // mentions `[features.*]` for documentation).
    const tableHeaders = block
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .filter((line) => /^\s*\[features\]\s*$/.test(line));
    expect(tableHeaders).toEqual([]);
  });

  it('emits a [[hooks.PreToolUse]] block matching Bash and apply_patch by default', () => {
    const block = renderCodexPathRestrictionHookBlock(HOOK);
    expect(block).toContain('[[hooks.PreToolUse]]');
    expect(block).toMatch(/matcher = "\^Bash\$\|\^apply_patch\$"/);
  });

  it('emits the hook command with absolute paths to tsx + hook script', () => {
    const block = renderCodexPathRestrictionHookBlock(HOOK);
    expect(block).toContain(`command = "${HOOK.tsxBin} ${HOOK.hookScript}"`);
  });

  it('honours a custom matcher when supplied', () => {
    const block = renderCodexPathRestrictionHookBlock({ ...HOOK, matcher: '^Bash$' });
    expect(block).toContain('matcher = "^Bash$"');
  });

  it('honours a custom timeout', () => {
    const block = renderCodexPathRestrictionHookBlock({ ...HOOK, timeoutSeconds: 60 });
    expect(block).toContain('timeout = 60');
  });
});

describe('upsertCodexPathRestrictionHookBlock — idempotency + surrounding-config preservation', () => {
  it('appends the block when the file is empty', () => {
    const out = upsertCodexPathRestrictionHookBlock('', HOOK);
    expect(out).toContain('[[hooks.PreToolUse]]');
    expect(out).toContain('features.codex_hooks = true');
  });

  it('preserves user model/sandbox config above the managed block', () => {
    const userConfig = [
      '# user-managed config',
      'model = "gpt-5"',
      'sandbox = "workspace-write"',
      '',
      '[features]',
      'something_else = true',
      '',
    ].join('\n');

    const out = upsertCodexPathRestrictionHookBlock(userConfig, HOOK);
    // User config preserved verbatim above the managed block.
    expect(out).toContain('# user-managed config');
    expect(out).toContain('model = "gpt-5"');
    expect(out).toContain('sandbox = "workspace-write"');
    expect(out).toContain('something_else = true');
    // Managed block appended.
    expect(out).toContain('[[hooks.PreToolUse]]');
  });

  it('preserves an existing [mcp_servers.code_graph] block', () => {
    const before = [
      '[mcp_servers.code_graph]',
      'command = "bash"',
      'args = ["/x/launcher.sh", "serve", "--repo", "/proj"]',
      '',
    ].join('\n');
    const out = upsertCodexPathRestrictionHookBlock(before, HOOK);
    expect(out).toContain('[mcp_servers.code_graph]');
    expect(out).toContain('"/x/launcher.sh"');
    expect(out).toContain('[[hooks.PreToolUse]]');
  });

  it('is idempotent — running twice with the same input is the same as running once', () => {
    const once = upsertCodexPathRestrictionHookBlock('', HOOK);
    const twice = upsertCodexPathRestrictionHookBlock(once, HOOK);
    expect(twice).toBe(once);
  });

  it('replaces (not duplicates) the managed block when the hook config changes', () => {
    const first = upsertCodexPathRestrictionHookBlock('', HOOK);
    const updated = upsertCodexPathRestrictionHookBlock(first, {
      ...HOOK,
      tsxBin: '/different/tsx',
    });
    // Still exactly one managed block (no duplicates).
    const startMarkers = updated.match(/# === ai-agentic-framework: codex hooks/g) ?? [];
    const endMarkers = updated.match(/# === end: ai-agentic-framework codex hooks/g) ?? [];
    expect(startMarkers.length).toBe(1);
    expect(endMarkers.length).toBe(1);
    // And the new hookBin path is in the file, the old one is gone.
    expect(updated).toContain('/different/tsx');
    expect(updated).not.toContain(HOOK.tsxBin);
  });
});

describe('removeCodexPathRestrictionHookBlock', () => {
  it('returns the input unchanged when the block is absent', () => {
    const content = ['model = "gpt-5"', '', '[mcp_servers.x]', 'command = "y"'].join('\n');
    expect(removeCodexPathRestrictionHookBlock(content)).toBe(content);
  });

  it('strips the managed block including trailing blank line', () => {
    const withBlock = upsertCodexPathRestrictionHookBlock('model = "gpt-5"\n', HOOK);
    const stripped = removeCodexPathRestrictionHookBlock(withBlock);
    expect(stripped).not.toContain('[[hooks.PreToolUse]]');
    expect(stripped).not.toContain('# === ai-agentic-framework');
    expect(stripped).toContain('model = "gpt-5"');
  });

  it('handles the defensive case where the end sentinel is missing (hand-edited file)', () => {
    // User accidentally deleted the end sentinel. We strip from the start
    // sentinel to end-of-file rather than leaving half a block.
    const malformed = [
      'model = "gpt-5"',
      '',
      '# === ai-agentic-framework: codex hooks (managed; do not edit by hand) ===',
      'features.codex_hooks = true',
      '',
      '[[hooks.PreToolUse]]',
      'matcher = "^Bash$"',
      // No end sentinel.
    ].join('\n');
    const stripped = removeCodexPathRestrictionHookBlock(malformed);
    expect(stripped).toContain('model = "gpt-5"');
    expect(stripped).not.toContain('# === ai-agentic-framework');
    expect(stripped).not.toContain('[[hooks.PreToolUse]]');
  });
});
