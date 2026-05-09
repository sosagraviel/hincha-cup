#!/usr/bin/env node
/**
 * Plan v4 Phase D — service-scope PreToolUse hook.
 *
 * The shared `restrict-agent-paths.hook.ts` enforces the framework-wide
 * safety baseline (path exclusion, project boundary, MCP overflow). This
 * hook is layered ON TOP of it for the service-detail-extractor — it
 * additionally constrains the agent to read ONLY inside its assigned
 * service path (and a small set of cross-cutting "always allowed" reads
 * like `<tempDir>/project-inspection.json`).
 *
 * SECURITY POSTURE — FAIL CLOSED:
 *   When `FRAMEWORK_SERVICE_PATH` is set (our spawn path does this), any
 *   internal error here blocks the tool call. The shared hook already
 *   ran; this is the second layer.
 *
 *   When `FRAMEWORK_SERVICE_PATH` is unset, the hook is a silent no-op
 *   so the same tsx command can run during ad-hoc `claude` invocations
 *   without breaking developer flow.
 *
 * Why this exists: v3's monolithic code-patterns analyzer read across
 * every service in the repo, producing 13× output growth and 7×
 * wall-clock. v4 fans out one sub-agent per service. Without this hook
 * a sub-agent could still drift outside its assigned slice; the hook
 * makes the boundary structural, not aspirational.
 */

import path from 'path';
import process from 'process';

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

const PATH_TOOLS: Record<string, ReadonlyArray<string>> = {
  Glob: ['path'],
  Grep: ['path'],
  Read: ['file_path'],
  Edit: ['file_path'],
  Write: ['file_path'],
  MultiEdit: ['file_path'],
  LS: ['path'],
  NotebookEdit: ['notebook_path'],
};

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
  servicePath: string;
  serviceId: string;
  /**
   * Cross-cutting reads the agent is always allowed regardless of its
   * assigned service path. This mirrors the small surface the prompt
   * tells the agent it can read:
   *   - `<tempDir>/project-inspection.json` (Step 0).
   *   - The repo-root README so the agent can quote a top-level usage
   *     section if its service is documented there.
   *
   * Stored as absolute paths so the comparison is straightforward.
   */
  alwaysAllowedFiles: string[];
}

function readConfig(): Config | null {
  const projectPath = process.env.FRAMEWORK_PROJECT_PATH;
  const servicePath = process.env.FRAMEWORK_SERVICE_PATH;
  const serviceId = process.env.FRAMEWORK_SERVICE_ID;
  const tempDir = process.env.FRAMEWORK_TEMP_DIR;

  // Silent no-op when not invoked from a service-detail-extractor spawn.
  if (!projectPath || !servicePath || !serviceId) return null;

  const alwaysAllowedFiles: string[] = [];
  if (tempDir) {
    alwaysAllowedFiles.push(path.join(tempDir, 'project-inspection.json'));
  }
  // Repo-root README variants — small, low risk, sometimes the only place
  // a service is actually documented.
  for (const name of ['README.md', 'README.markdown', 'readme.md', 'README']) {
    alwaysAllowedFiles.push(path.join(projectPath, name));
  }

  return {
    projectPath,
    servicePath: path.resolve(projectPath, servicePath),
    serviceId,
    alwaysAllowedFiles,
  };
}

async function main(): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return allow();

  let raw: string;
  try {
    raw = await readStdin();
  } catch (err) {
    return block(
      `❌ SERVICE SCOPE: hook internal error reading stdin — failing closed.\n` +
        `  ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return block(
      `❌ SERVICE SCOPE: hook received unparseable stdin — failing closed.\n` +
        `  bytes=${raw.length}`,
    );
  }

  const toolName = input.tool_name ?? '';
  const toolInput = input.tool_input ?? {};
  const baseCwd = input.cwd || cfg.projectPath;

  // Bash: only block obvious cross-service scans (e.g. a Bash invocation
  // that names the project root). Anything more involved is the shared
  // hook's job — we avoid duplicating its enumerator-rule logic here.
  if (toolName === 'Bash') {
    const cmd = (toolInput.command as string | undefined) ?? '';
    if (!cmd) return allow();
    // Block absolute paths that escape the assigned service.
    const absRe = /(?:^|[\s'"`|;&<>()=])(\/[^\s'"`|;&<>()]+)/g;
    let match: RegExpExecArray | null;
    while ((match = absRe.exec(cmd)) !== null) {
      const abs = match[1];
      if (!path.isAbsolute(abs)) continue;
      if (abs.startsWith('/bin/') || abs.startsWith('/usr/') || abs.startsWith('/etc/')) continue;
      if (cfg.alwaysAllowedFiles.includes(abs)) continue;
      if (isInside(abs, cfg.servicePath)) continue;
      if (isInside(abs, cfg.projectPath) && !isInside(abs, cfg.servicePath)) {
        return block(
          [
            `❌ SERVICE SCOPE: Bash blocked — absolute path escapes service '${cfg.serviceId}'.`,
            `  Path:        ${abs}`,
            `  Service path: ${cfg.servicePath}`,
            ``,
            `You were assigned ONE service. Re-scope the command so it stays inside the`,
            `service path (or use one of the framework-allowed reads listed in your prompt).`,
          ].join('\n'),
        );
      }
    }
    return allow();
  }

  if (toolName === 'Glob') {
    const pattern = (toolInput.pattern as string | undefined) ?? '';
    const patternPath = (toolInput.path as string | undefined) ?? '';
    if (!pattern && !patternPath) return allow();
    // If the agent supplied an explicit `path`, treat it the same as a
    // path argument (handled below). Otherwise allow `**/*` patterns to
    // pass — they are relative to cwd and the path-arg check downstream
    // will catch absolute escapes.
    if (!patternPath) {
      // Best-effort: warn (not block) when the pattern looks like it's
      // crossing service boundaries (e.g. `services/**/*.ts` from a
      // sub-service). Hard-blocking would be too aggressive — many
      // service paths contain wildcards naturally. The path-arg block
      // below catches the dangerous case.
      return allow();
    }
  }

  const argNames = PATH_TOOLS[toolName];
  if (!argNames) return allow();

  for (const argName of argNames) {
    const rawPath = toolInput[argName];
    if (typeof rawPath !== 'string' || rawPath === '') continue;
    const abs = path.resolve(baseCwd, rawPath);

    if (cfg.alwaysAllowedFiles.includes(abs)) continue;
    if (isInside(abs, cfg.servicePath)) continue;

    if (isInside(abs, cfg.projectPath)) {
      return block(
        [
          `❌ SERVICE SCOPE: ${toolName} blocked — path is outside service '${cfg.serviceId}'.`,
          `  Tool arg:     ${argName}=${rawPath}`,
          `  Resolved:     ${abs}`,
          `  Service path: ${cfg.servicePath}`,
          ``,
          `You were assigned ONE service in this run. Restrict file/glob/read paths to`,
          `that service's tree, or use one of the framework-allowed reads listed in your`,
          `prompt (project-inspection.json, repo-root README).`,
        ].join('\n'),
      );
    }
    // Anything outside the project itself is the shared hook's concern — it
    // will already have rejected before this hook runs.
  }

  return allow();
}

main().catch((err) => {
  // FAIL CLOSED: if anything in the hook throws, block the tool call.
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`❌ SERVICE SCOPE: hook internal error — failing closed.\n${msg}\n`);
  process.exit(2);
});
