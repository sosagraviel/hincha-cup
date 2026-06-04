import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join, basename, resolve } from 'path';
import { execSync } from 'child_process';
import { getAllProviderTempDirs, getAllProviderBackupDirs } from './provider-paths.js';
import { ensureCodexAuthentication } from '../auth/codex-auth.js';

/**
 * Returns true when `inner` resolves to a path strictly inside `outer`.
 * Used to detect the v5-fixture / dogfooding shape where the project being
 * analysed lives INSIDE the framework checkout instead of having the
 * framework as a sibling/subdirectory.
 */
function isPathInsideFramework(inner: string, outer: string): boolean {
  const innerResolved = resolve(inner);
  const outerResolved = resolve(outer);
  if (innerResolved === outerResolved) return true;
  return innerResolved.startsWith(outerResolved + '/');
}

/**
 * Preflight validation results
 */
export interface PreflightResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  nodeVersion?: string;
  npmVersion?: string;
  claudeVersion?: string;
  codexVersion?: string;
  gitignoreUpdated?: boolean;
  authMode?: 'claude_cli' | 'codex_cli' | 'none';
  provider?: string;
}

/**
 * Run preflight checks for initialize-project workflow
 *
 * SINGLE SOURCE OF TRUTH for all environment validations.
 * This is called by TypeScript CLI after bash launcher has ensured Node.js/npm exist.
 *
 * Validates:
 * 1. Node.js version >= 20
 * 2. npm is available
 * 3. Claude CLI detection (optional, determines auth mode)
 * 4. .gitignore contains per-provider temp/backup dirs — .claude-temp, .claude-backups,
 *    .codex-temp, .codex-backups — and the framework directory (auto-adds if missing).
 *    All provider variants are added up front so switching between claude and codex
 *    doesn't require re-running preflight.
 * 5. Project path exists and is accessible
 * 6. Framework path exists and is accessible
 *
 * @param projectPath - Path to the project being initialized
 * @param frameworkPath - Path to the framework directory
 * @returns Preflight validation results
 */
export async function runPreflightChecks(
  projectPath: string,
  frameworkPath: string,
): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let nodeVersion: string | undefined;
  let npmVersion: string | undefined;
  let claudeVersion: string | undefined;
  let codexVersion: string | undefined;
  let gitignoreUpdated = false;
  let authMode: 'claude_cli' | 'codex_cli' | 'none' = 'none';
  let provider: string | undefined;

  if (!existsSync(projectPath)) {
    errors.push(
      `Project path does not exist: ${projectPath}\n` + `Please provide a valid project directory.`,
    );
    return {
      success: false,
      errors,
      warnings,
      nodeVersion,
      npmVersion,
      claudeVersion,
      gitignoreUpdated,
      authMode,
    };
  }

  if (!existsSync(frameworkPath)) {
    errors.push(
      `Framework path does not exist: ${frameworkPath}\n` +
        `Set FRAMEWORK_PATH environment variable or use --framework-path flag\n` +
        `Default: <project>/../.. (two levels up from project)`,
    );
    return {
      success: false,
      errors,
      warnings,
      nodeVersion,
      npmVersion,
      claudeVersion,
      gitignoreUpdated,
      authMode,
    };
  }

  try {
    const nodeVersionOutput = execSync('node --version', {
      encoding: 'utf-8',
    }).trim();
    nodeVersion = nodeVersionOutput;

    const versionMatch = nodeVersionOutput.match(/^v(\d+)\./);
    if (!versionMatch) {
      errors.push(
        `Unable to parse Node.js version: ${nodeVersionOutput}\n` +
          `Expected format: vX.Y.Z (e.g., v20.11.0)`,
      );
    } else {
      const majorVersion = parseInt(versionMatch[1], 10);
      if (majorVersion < 20) {
        errors.push(
          `Node.js version ${nodeVersionOutput} is too old.\n` +
            `Required: Node.js v20 or higher\n` +
            `Install from: https://nodejs.org/`,
        );
      }
    }
  } catch (error) {
    errors.push(
      `Node.js not found in PATH.\n` +
        `Please install Node.js v20 or higher from: https://nodejs.org/`,
    );
  }

  try {
    const npmVersionOutput = execSync('npm --version', {
      encoding: 'utf-8',
    }).trim();
    npmVersion = `v${npmVersionOutput}`;
  } catch (error) {
    errors.push(
      `npm not found in PATH.\n` +
        `npm is required and typically comes with Node.js.\n` +
        `Install from: https://nodejs.org/`,
    );
  }

  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const requestedProvider = process.env.PROVIDER?.toLowerCase();

  const validateClaudeCLI = async (strict: boolean): Promise<boolean> => {
    let bundledBroken = false;
    const localClaudePath = join(frameworkPath, 'orchestration/node_modules/.bin/claude');

    if (existsSync(localClaudePath)) {
      try {
        const claudeVersionOutput = execSync(`"${localClaudePath}" --version`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();
        claudeVersion = claudeVersionOutput.split('\n')[0] || 'unknown';

        if (hasAnthropicKey || (await checkClaudeAuthentication(localClaudePath))) {
          authMode = 'claude_cli';
          provider = 'anthropic';
          return true;
        }

        if (strict) {
          errors.push(
            `Claude CLI is not authenticated.\n` +
              `\n` +
              `The framework uses a local bundled Claude CLI at:\n` +
              `  ${localClaudePath}\n` +
              `\n` +
              `Please authenticate it manually:\n` +
              `  ${localClaudePath} login\n` +
              `\n` +
              `Or set ANTHROPIC_API_KEY before running the framework.`,
          );
        }
        return false;
      } catch (error) {
        bundledBroken = true;
        warnings.push(
          `Local Claude CLI found but failed to execute: ${(error as Error).message}\n` +
            `Path: ${localClaudePath}\n` +
            `Trying global Claude CLI...`,
        );
      }
    }

    try {
      const claudeVersionOutput = execSync('claude --version', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
      claudeVersion = claudeVersionOutput.split('\n')[0] || 'unknown';

      if (hasAnthropicKey || (await checkClaudeAuthentication('claude'))) {
        authMode = 'claude_cli';
        provider = 'anthropic';
        warnings.push(
          `Using global Claude CLI instead of framework's bundled version.\n` +
            `For consistency, ensure framework dependencies are installed:\n` +
            `  cd orchestration && npm install`,
        );
        return true;
      }

      if (strict) {
        errors.push(
          `Claude CLI is not authenticated.\n` +
            `\n` +
            `Please authenticate:\n` +
            `  claude login\n` +
            `\n` +
            `Or set ANTHROPIC_API_KEY before running the framework.`,
        );
      }
      return false;
    } catch {
      if (strict) {
        errors.push(
          bundledBroken
            ? `Claude CLI is bundled but failed to run, and no working global CLI was found.\n` +
                `\n` +
                `The bundled CLI at ${localClaudePath} exists but its --version check failed —\n` +
                `the platform-native binary was likely not installed (npm/pnpm ran with\n` +
                `--ignore-scripts or --omit=optional).\n` +
                `\n` +
                `Repair it:\n` +
                `  cd ${frameworkPath}/orchestration && rm -rf node_modules && npm install\n` +
                `  (or: npm rebuild @anthropic-ai/claude-code)\n` +
                `\n` +
                `Or install/use a working global CLI:\n` +
                `  npm install -g @anthropic-ai/claude-code`
            : `Claude CLI is not installed.\n` +
                `\n` +
                `Install framework dependencies:\n` +
                `  cd ${frameworkPath}/orchestration && npm install\n` +
                `\n` +
                `Or install globally:\n` +
                `  npm install -g @anthropic-ai/claude-code`,
        );
      }
      return false;
    }
  };

  const validateCodexCLI = async (strict: boolean): Promise<boolean> => {
    let bundledBroken = false;
    const localCodexPath = join(frameworkPath, 'orchestration/node_modules/.bin/codex');

    if (existsSync(localCodexPath)) {
      try {
        const codexVersionOutput = execSync(`"${localCodexPath}" --version`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        }).trim();
        codexVersion = codexVersionOutput.split('\n')[0] || 'unknown';

        const authResult = ensureCodexAuthentication(localCodexPath);

        if (authResult.authenticated) {
          authMode = 'codex_cli';
          provider = 'openai';
          return true;
        }

        if (strict) {
          errors.push(
            `Codex CLI authentication failed.\n` +
              `\n` +
              `The framework uses a local bundled Codex CLI at:\n` +
              `  ${localCodexPath}\n` +
              `\n` +
              (authResult.attemptedApiKeyLogin
                ? `Automatic Codex API-key login failed${authResult.error ? `: ${authResult.error}` : '.'}\n` +
                  `You can retry manually:\n` +
                  `  printenv OPENAI_API_KEY | "${localCodexPath}" login --with-api-key`
                : `Please authenticate it manually:\n` +
                  `  ${localCodexPath} login\n` +
                  `Or set OPENAI_API_KEY to let the framework run API-key login automatically.`) +
              `\n` +
              (hasOpenAIKey ? `OPENAI_API_KEY was detected in the environment.` : ''),
          );
        }
        return false;
      } catch (error) {
        bundledBroken = true;
        warnings.push(
          `Local Codex CLI found but failed to execute: ${(error as Error).message}\n` +
            `Path: ${localCodexPath}\n` +
            `Trying global Codex CLI...`,
        );
      }
    }

    try {
      const codexVersionOutput = execSync('codex --version', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
      codexVersion = codexVersionOutput.split('\n')[0] || 'unknown';

      const authResult = ensureCodexAuthentication('codex');
      if (authResult.authenticated) {
        authMode = 'codex_cli';
        provider = 'openai';

        warnings.push(
          `Using global Codex CLI instead of framework's bundled version.\n` +
            `For consistency, ensure framework dependencies are installed:\n` +
            `  cd orchestration && pnpm install`,
        );
        return true;
      }

      if (strict) {
        errors.push(
          `Codex CLI is not authenticated.\n` +
            `\n` +
            `Please authenticate:\n` +
            (authResult.attemptedApiKeyLogin
              ? `Automatic Codex API-key login failed${authResult.error ? `: ${authResult.error}` : '.'}\n` +
                `You can retry manually:\n` +
                `  printenv OPENAI_API_KEY | codex login --with-api-key`
              : `  codex login`) +
            `\n` +
            (hasOpenAIKey
              ? `OPENAI_API_KEY was detected in the environment.`
              : `Or set OPENAI_API_KEY to let the framework run API-key login automatically.`),
        );
      }
      return false;
    } catch {
      if (strict) {
        errors.push(
          bundledBroken
            ? `Codex CLI is bundled but failed to run, and no working global CLI was found.\n` +
                `\n` +
                `The bundled CLI at ${localCodexPath} exists but its --version check failed —\n` +
                `the platform-native binary was likely not installed (npm/pnpm ran with\n` +
                `--ignore-scripts or --omit=optional).\n` +
                `\n` +
                `Repair it:\n` +
                `  cd ${frameworkPath}/orchestration && rm -rf node_modules && pnpm install\n` +
                `  (or: pnpm rebuild @openai/codex)\n` +
                `\n` +
                `Then authenticate:\n` +
                `  ${localCodexPath} login`
            : `Codex CLI is not installed.\n` +
                `\n` +
                `Install framework dependencies:\n` +
                `  cd ${frameworkPath}/orchestration && pnpm install\n` +
                `\n` +
                `Then authenticate:\n` +
                `  ${frameworkPath}/orchestration/node_modules/.bin/codex login`,
        );
      }
      return false;
    }
  };

  if (requestedProvider === 'codex' || requestedProvider === 'openai') {
    await validateCodexCLI(true);
  } else if (requestedProvider === 'claude' || requestedProvider === 'anthropic') {
    await validateClaudeCLI(true);
  } else if (hasAnthropicKey) {
    await validateClaudeCLI(true);
  } else if (hasOpenAIKey) {
    await validateCodexCLI(true);
  } else {
    await validateClaudeCLI(false);
    if (authMode === 'none') {
      await validateCodexCLI(false);
    }

    if (authMode === 'none') {
      errors.push(
        `No authentication method found.\n` +
          `\n` +
          `Option 1: Use Claude CLI with ANTHROPIC_API_KEY\n` +
          `  export ANTHROPIC_API_KEY="your-api-key-here"\n` +
          `\n` +
          `Option 2: Use Codex CLI (requires codex login)\n` +
          `  npm install -g @openai/codex && codex login\n` +
          `\n` +
          `Option 3: Use Claude CLI subscription auth\n` +
          `  Install framework dependencies: cd orchestration && npm install\n` +
          `  Or install globally: npm install -g @anthropic-ai/claude-code`,
      );
    }
  }

  const rootPackageJsonPath = join(frameworkPath, 'package.json');
  const pnpmWorkspacePath = join(frameworkPath, 'pnpm-workspace.yaml');

  if (!existsSync(rootPackageJsonPath)) {
    warnings.push(
      'Root package.json not found. Framework workspace setup may be incomplete.\n' +
        'Expected workspace structure with root package.json for coordination.',
    );
  }

  if (!existsSync(pnpmWorkspacePath)) {
    warnings.push(
      'pnpm-workspace.yaml not found. Workspace configuration missing.\n' +
        'Multi-package coordination may not work properly.',
    );
  }

  const gitignorePath = join(projectPath, '.gitignore');

  const frameworkDirName = basename(frameworkPath);
  const projectInsideFramework = isPathInsideFramework(projectPath, frameworkPath);

  const requiredEntries = [
    ...getAllProviderTempDirs(),
    ...getAllProviderBackupDirs(),
    ...(projectInsideFramework ? [] : [frameworkDirName]),
  ];

  const requiredFileEntries = ['.mcp.json'];

  if (!existsSync(gitignorePath)) {
    try {
      const gitignoreContent = [
        '# AI Agentic Framework files',
        ...requiredEntries.map((entry) => `${entry}/`),
        ...requiredFileEntries,
        '',
      ].join('\n');

      writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
      gitignoreUpdated = true;
      warnings.push(
        `Created .gitignore with framework entries: ${[...requiredEntries, ...requiredFileEntries].join(', ')}`,
      );
    } catch (error) {
      warnings.push(
        `Unable to create .gitignore file: ${(error as Error).message}\n` +
          `Please manually create .gitignore with:\n` +
          requiredEntries.map((e) => `  ${e}/`).join('\n') +
          '\n' +
          requiredFileEntries.map((e) => `  ${e}`).join('\n'),
      );
    }
  } else {
    try {
      const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
      const missingDirEntries: string[] = [];
      const missingFileEntries: string[] = [];

      const lines = gitignoreContent.split('\n').map((line) => line.trim());

      for (const entry of requiredEntries) {
        const hasEntry = lines.some((line) => line === entry || line === `${entry}/`);
        if (!hasEntry) missingDirEntries.push(entry);
      }

      for (const entry of requiredFileEntries) {
        const hasEntry = lines.some((line) => line === entry);
        if (!hasEntry) missingFileEntries.push(entry);
      }

      if (missingDirEntries.length > 0 || missingFileEntries.length > 0) {
        try {
          const entriesToAdd = [
            '',
            ...missingDirEntries.map((entry) => `${entry}/`),
            ...missingFileEntries,
          ].join('\n');

          appendFileSync(gitignorePath, entriesToAdd + '\n', 'utf-8');
          gitignoreUpdated = true;
          warnings.push(
            `Added missing entries to .gitignore: ${[...missingDirEntries, ...missingFileEntries].join(', ')}`,
          );
        } catch (error) {
          warnings.push(
            `Unable to update .gitignore: ${(error as Error).message}\n` +
              `Please manually add to .gitignore:\n` +
              missingDirEntries.map((e) => `  ${e}/`).join('\n') +
              (missingFileEntries.length > 0
                ? '\n' + missingFileEntries.map((e) => `  ${e}`).join('\n')
                : ''),
          );
        }
      }
    } catch (error) {
      warnings.push(
        `Unable to read .gitignore: ${(error as Error).message}\n` +
          `Please ensure .gitignore contains:\n` +
          requiredEntries.map((e) => `  ${e}/`).join('\n') +
          '\n' +
          requiredFileEntries.map((e) => `  ${e}`).join('\n'),
      );
    }
  }

  const isCodexProvider = requestedProvider === 'codex' || requestedProvider === 'openai';
  const isClaudeProvider = !isCodexProvider;

  if (isClaudeProvider) {
    const rootClaudeMdPath = join(projectPath, 'CLAUDE.md');
    const dotClaudeClaudeMdPath = join(projectPath, '.claude', 'CLAUDE.md');

    if (existsSync(rootClaudeMdPath)) {
      warnings.push(
        `Existing CLAUDE.md detected at project root: ${rootClaudeMdPath}\n` +
          `\n` +
          `initialize-project will generate .claude/CLAUDE.md in Phase 4.\n` +
          `Claude Code loads BOTH files, which can produce conflicting instructions.\n` +
          `\n` +
          `Recommended: after initialization completes, manually merge the two files.\n` +
          `Treat the generated .claude/CLAUDE.md as the source of truth for framework\n` +
          `conventions, and move any project-specific rules from ./CLAUDE.md into it.\n` +
          `\n` +
          `See: docs/getting-started/QUICKSTART.md — "Projects with existing Claude configuration"`,
      );
    }

    if (existsSync(dotClaudeClaudeMdPath)) {
      warnings.push(
        `Existing .claude/CLAUDE.md detected: ${dotClaudeClaudeMdPath}\n` +
          `\n` +
          `initialize-project (Phase 4) will OVERWRITE this file with a freshly\n` +
          `generated version based on the current project analysis.\n` +
          `\n` +
          `Recommended: back up the existing file before continuing, e.g.\n` +
          `  cp "${dotClaudeClaudeMdPath}" "${dotClaudeClaudeMdPath}.bak"\n` +
          `\n` +
          `After initialization, diff the backup against the new file and merge any\n` +
          `custom content you want to preserve.\n` +
          `\n` +
          `See: docs/getting-started/QUICKSTART.md — "Projects with existing Claude configuration"`,
      );
    }
  }

  if (isCodexProvider) {
    const dotCodexAgentsMdPath = join(projectPath, '.codex', 'AGENTS.md');

    if (existsSync(dotCodexAgentsMdPath)) {
      warnings.push(
        `Existing .codex/AGENTS.md detected: ${dotCodexAgentsMdPath}\n` +
          `\n` +
          `initialize-project (Phase 4) will OVERWRITE this file with a freshly\n` +
          `generated version based on the current project analysis.\n` +
          `\n` +
          `Recommended: back up the existing file before continuing, e.g.\n` +
          `  cp "${dotCodexAgentsMdPath}" "${dotCodexAgentsMdPath}.bak"\n` +
          `\n` +
          `After initialization, diff the backup against the new file and merge any\n` +
          `custom content you want to preserve.\n` +
          `\n` +
          `See: docs/getting-started/QUICKSTART.md — "Projects with existing Codex configuration"`,
      );
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    nodeVersion,
    npmVersion,
    claudeVersion,
    codexVersion,
    gitignoreUpdated,
    authMode,
    provider,
  };
}

/**
 * Check if Claude CLI is authenticated by attempting a simple command
 * Returns true if authenticated, false otherwise
 */
async function checkClaudeAuthentication(claudePath: string): Promise<boolean> {
  try {
    const testResult = execSync(`"${claudePath}" auth status`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const authStatus = JSON.parse(testResult.trim());
    return authStatus.loggedIn === true;
  } catch {
    return false;
  }
}
