#!/usr/bin/env node
/**
 * Synthesizer-scope PreToolUse hook.
 *
 * The architect-synthesizer is a composer, not an investigator. This hook
 * enforces composer-discipline on top of the shared path-exclusion baseline:
 *
 *   ✓ Read inside `<tempDir>/` (composer views, consolidation,
 *     architectural-narrative.md, project-inspection.json).
 *   ✓ Grep (used for cross-section consistency checks).
 *   ✗ Glob — the synthesizer should not enumerate files.
 *   ✗ Bash / Write / Edit / MultiEdit / NotebookEdit / LS — the
 *     synthesizer doesn't run commands or modify files.
 *
 * Activates only when `FRAMEWORK_PHASE=phase-3-synthesis` is set.
 * Without that env var the hook is a silent no-op.
 */

import path from 'path';
import process from 'process';

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

const ALLOWED_READ_TOOLS = new Set(['Read', 'Grep']);
const FORBIDDEN_TOOLS = new Set([
  'Glob',
  'Bash',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'LS',
]);

async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk.toString());
  }
  return chunks.join('');
}

function allow(): never {
  process.exit(0);
}

function block(reason: string): never {
  process.stderr.write(reason + '\n');
  process.exit(2);
}

function isInside(abs: string, root: string): boolean {
  if (!root) return true;
  const rel = path.relative(root, abs);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

interface Config {
  projectPath: string;
  /**
   * The framework's per-provider tempDir candidates.
   * Both are accepted because the synthesizer might run on either
   * provider; the agent can read its own provider's tempDir.
   */
  tempDirs: string[];
}

function readConfig(): Config | null {
  const projectPath = process.env.FRAMEWORK_PROJECT_PATH;
  const phase = process.env.FRAMEWORK_PHASE;
  if (!projectPath) return null;
  if (phase && phase !== 'phase-3-synthesis') return null;
  const tempDirs = [
    path.join(projectPath, '.claude-temp', 'initialize-project'),
    path.join(projectPath, '.codex-temp', 'initialize-project'),
  ];
  return { projectPath, tempDirs };
}

async function main(): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return allow();

  let raw: string;
  try {
    raw = await readStdin();
  } catch (err) {
    return block(
      `❌ SYNTH SCOPE: hook internal error reading stdin — failing closed.\n` +
        `  ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return block(
      `❌ SYNTH SCOPE: hook received unparseable stdin — failing closed.\n` +
        `  bytes=${raw.length}`,
    );
  }

  const toolName = input.tool_name ?? '';
  const toolInput = input.tool_input ?? {};
  const baseCwd = input.cwd || cfg.projectPath;

  if (FORBIDDEN_TOOLS.has(toolName)) {
    return block(
      [
        `❌ SYNTH SCOPE: ${toolName} blocked.`,
        '',
        'The synthesizer is a COMPOSER over the four composer views. It does not',
        'enumerate files (Glob), run commands (Bash), or modify files (Write / Edit /',
        'MultiEdit / NotebookEdit / LS). Everything you need is in:',
        '',
        '  • <tempDir>/composer-views/code-conventions.input.json',
        '  • <tempDir>/composer-views/multi-file-workflows.input.json',
        '  • <tempDir>/composer-views/testing-conventions.input.json',
        '  • <tempDir>/composer-views/architecture-narrative.input.json',
        '  • <tempDir>/phase2-consolidation.json (legacy fallback)',
        '',
        'Use Read on those files. Use Grep across them when you need to look up a',
        'service id or pattern across views. Then compose your five-section markdown',
        'response — the orchestration layer writes the output files for you.',
      ].join('\n'),
    );
  }

  if (!ALLOWED_READ_TOOLS.has(toolName)) {
    return allow();
  }

  const argName = toolName === 'Grep' ? 'path' : 'file_path';
  const rawPath = toolInput[argName];
  if (typeof rawPath !== 'string' || rawPath === '') {
    return allow();
  }
  const abs = path.resolve(baseCwd, rawPath);
  if (cfg.tempDirs.some((root) => isInside(abs, root))) return allow();

  return block(
    [
      `❌ SYNTH SCOPE: ${toolName} blocked — path is outside <tempDir>.`,
      `  Tool arg: ${argName}=${rawPath}`,
      `  Resolved: ${abs}`,
      '',
      'The synthesizer must Read only from the framework tempDir(s):',
      ...cfg.tempDirs.map((d) => `  • ${d}`),
      '',
      'Composer views live there; analyzer outputs live there. Walking the project',
      "source tree is the analyzers' job (Phase 1 + Phase 1.5), not yours.",
    ].join('\n'),
  );
}

main().catch((err) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`❌ SYNTH SCOPE: hook internal error — failing closed.\n${msg}\n`);
  process.exit(2);
});
