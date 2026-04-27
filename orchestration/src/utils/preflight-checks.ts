import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { getAllProviderTempDirs, getAllProviderBackupDirs } from './provider-paths.js';
import { ensureCodexAuthentication } from '../auth/codex-auth.js';

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

  // ============================================================================
  // CHECK 1: Project Path Exists
  // ============================================================================
  if (!existsSync(projectPath)) {
    errors.push(
      `Project path does not exist: ${projectPath}\n` + `Please provide a valid project directory.`,
    );
    // Can't continue without valid project path
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

  // ============================================================================
  // CHECK 2: Framework Path Exists
  // ============================================================================
  if (!existsSync(frameworkPath)) {
    errors.push(
      `Framework path does not exist: ${frameworkPath}\n` +
        `Set FRAMEWORK_PATH environment variable or use --framework-path flag\n` +
        `Default: <project>/../.. (two levels up from project)`,
    );
    // Can't continue without valid framework path
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

  // ============================================================================
  // CHECK 3: Node.js version >= 20
  // ============================================================================
  try {
    const nodeVersionOutput = execSync('node --version', {
      encoding: 'utf-8',
    }).trim();
    nodeVersion = nodeVersionOutput;

    // Parse version number (e.g., "v20.11.0" -> 20)
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

  // ============================================================================
  // CHECK 4: npm is available
  // ============================================================================
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

  // ============================================================================
  // CHECK 5: CLI detection and authentication (determines auth mode)
  // ============================================================================
  // Provider-aware: if PROVIDER is set, validate ONLY that provider's CLI.
  // Otherwise, auto-detect (Claude first, then Codex).

  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const requestedProvider = process.env.PROVIDER?.toLowerCase();

  const validateClaudeCLI = async (strict: boolean): Promise<boolean> => {
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
          `Claude CLI is not installed.\n` +
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
        warnings.push(
          `Local Codex CLI found but failed to execute: ${(error as Error).message}\n` +
            `Path: ${localCodexPath}\n` +
            `Trying global Codex CLI...`,
        );
      }
    }

    // Fallback to global Codex CLI if local not found or failed
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
          `Codex CLI is not installed.\n` +
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
    // GOOGLE_API_KEY is ignored: no Google CLI provider is supported.
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

  // ============================================================================
  // CHECK 6: Workspace Structure Validation
  // ============================================================================
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

  // ============================================================================
  // CHECK 7: .gitignore automation
  // ============================================================================
  const gitignorePath = join(projectPath, '.gitignore');

  // Determine framework directory name to exclude
  // CRITICAL: Must match logic in file-counter.ts and prompt-loader.ts
  // Framework is ALWAYS at project root: <project>/<framework-name>/
  const frameworkDirName = basename(frameworkPath);

  // All provider-managed temp/backup dirs come from the central provider-paths
  // registry so we don't have to update this list when a new provider is added.
  const requiredEntries = [
    ...getAllProviderTempDirs(),
    ...getAllProviderBackupDirs(),
    frameworkDirName,
  ];

  // Check if project has a .gitignore file
  if (!existsSync(gitignorePath)) {
    // Create .gitignore if it doesn't exist
    try {
      const gitignoreContent = [
        '# AI Agentic Framework files',
        ...requiredEntries.map((entry) => `${entry}/`),
        '',
      ].join('\n');

      writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
      gitignoreUpdated = true;
      warnings.push(`Created .gitignore with framework entries: ${requiredEntries.join(', ')}`);
    } catch (error) {
      warnings.push(
        `Unable to create .gitignore file: ${(error as Error).message}\n` +
          `Please manually create .gitignore with:\n` +
          requiredEntries.map((e) => `  ${e}/`).join('\n'),
      );
    }
  } else {
    // .gitignore exists, check if it contains required entries
    try {
      const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
      const missingEntries: string[] = [];

      for (const entry of requiredEntries) {
        // Check if entry exists as a standalone line (not as a substring of another path)
        // Split into lines and check if any line matches exactly (with or without trailing slash)
        const lines = gitignoreContent.split('\n');
        const hasEntry = lines.some((line) => {
          const trimmedLine = line.trim();
          return trimmedLine === entry || trimmedLine === `${entry}/`;
        });

        if (!hasEntry) {
          missingEntries.push(entry);
        }
      }

      if (missingEntries.length > 0) {
        try {
          const entriesToAdd = ['', ...missingEntries.map((entry) => `${entry}/`)].join('\n');

          appendFileSync(gitignorePath, entriesToAdd + '\n', 'utf-8');
          gitignoreUpdated = true;
          warnings.push(`Added missing entries to .gitignore: ${missingEntries.join(', ')}`);
        } catch (error) {
          warnings.push(
            `Unable to update .gitignore: ${(error as Error).message}\n` +
              `Please manually add to .gitignore:\n` +
              missingEntries.map((e) => `  ${e}/`).join('\n'),
          );
        }
      }
    } catch (error) {
      warnings.push(
        `Unable to read .gitignore: ${(error as Error).message}\n` +
          `Please ensure .gitignore contains:\n` +
          requiredEntries.map((e) => `  ${e}/`).join('\n'),
      );
    }
  }

  // ============================================================================
  // CHECK 8: Existing Claude configuration detection (non-blocking)
  // ============================================================================
  // If the project already has ./CLAUDE.md or ./.claude/CLAUDE.md, warn about
  // the load-order conflict. initialize-project generates a new ./.claude/CLAUDE.md
  // in Phase 4 and Claude Code loads both files, producing potentially
  // conflicting instructions. Resolution is a manual merge — see
  // docs/getting-started/QUICKSTART.md ("Projects with existing Claude configuration").
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
    // Use 'auth status' which returns JSON without opening the interactive TUI
    const testResult = execSync(`"${claudePath}" auth status`, {
      encoding: 'utf-8',
      timeout: 10000, // 10 second timeout
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Parse the JSON output to check login status
    const authStatus = JSON.parse(testResult.trim());
    return authStatus.loggedIn === true;
  } catch {
    return false;
  }
}
