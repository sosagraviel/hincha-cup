import { existsSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

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
  gitignoreUpdated?: boolean;
  authMode?: "api_key" | "claude_cli" | "none";
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
 * 4. .gitignore contains .claude-temp and .claude-backups (auto-adds if missing)
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
  let gitignoreUpdated = false;
  let authMode: "api_key" | "claude_cli" | "none" = "none";

  // ============================================================================
  // CHECK 1: Project Path Exists
  // ============================================================================
  if (!existsSync(projectPath)) {
    errors.push(
      `Project path does not exist: ${projectPath}\n` +
        `Please provide a valid project directory.`,
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
    const nodeVersionOutput = execSync("node --version", {
      encoding: "utf-8",
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
    const npmVersionOutput = execSync("npm --version", {
      encoding: "utf-8",
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
  // CHECK 5: Claude CLI detection (determines auth mode)
  // ============================================================================
  // NOTE: This is optional - framework can work with API keys OR Claude CLI
  try {
    const claudeVersionOutput = execSync("claude --version", {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    claudeVersion = claudeVersionOutput.split("\n")[0] || "unknown";

    // Check if we have API keys
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;

    if (hasAnthropicKey || hasOpenAIKey || hasGoogleKey) {
      authMode = "api_key";
    } else {
      authMode = "claude_cli";
    }
  } catch (error) {
    // Claude CLI not found - check for API keys
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;

    if (hasAnthropicKey || hasOpenAIKey || hasGoogleKey) {
      authMode = "api_key";
    } else {
      authMode = "none";
      errors.push(
        `No authentication method found.\n` +
          `\n` +
          `Option 1: Use API Keys (recommended for production)\n` +
          `  Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY\n` +
          `  export ANTHROPIC_API_KEY="your-api-key-here"\n` +
          `\n` +
          `Option 2: Use Claude CLI (requires Claude Pro/Max subscription)\n` +
          `  Install from: https://github.com/anthropics/claude-code\n` +
          `  Run: npm install -g @anthropic-ai/claude-code`,
      );
    }
  }

  // ============================================================================
  // CHECK 6: .gitignore automation
  // ============================================================================
  const gitignorePath = join(projectPath, ".gitignore");
  const requiredEntries = [".claude-temp", ".claude-backups"];

  // Check if project has a .gitignore file
  if (!existsSync(gitignorePath)) {
    // Create .gitignore if it doesn't exist
    try {
      const gitignoreContent = [
        "# AI Agentic Framework temporary files",
        ".claude-temp/",
        ".claude-backups/",
        "",
      ].join("\n");

      writeFileSync(gitignorePath, gitignoreContent, "utf-8");
      gitignoreUpdated = true;
      warnings.push(
        `Created .gitignore file with .claude-temp and .claude-backups entries`,
      );
    } catch (error) {
      warnings.push(
        `Unable to create .gitignore file: ${(error as Error).message}\n` +
          `Please manually create .gitignore with:\n` +
          `  .claude-temp/\n` +
          `  .claude-backups/`,
      );
    }
  } else {
    // .gitignore exists, check if it contains required entries
    try {
      const gitignoreContent = readFileSync(gitignorePath, "utf-8");
      const missingEntries: string[] = [];

      for (const entry of requiredEntries) {
        // Check if entry exists (with or without trailing slash)
        const hasEntry =
          gitignoreContent.includes(`${entry}/`) ||
          gitignoreContent.includes(`${entry}\n`) ||
          gitignoreContent.endsWith(entry);

        if (!hasEntry) {
          missingEntries.push(entry);
        }
      }

      if (missingEntries.length > 0) {
        // Automatically add missing entries
        try {
          const entriesToAdd = [
            "",
            "# AI Agentic Framework temporary files (auto-added)",
            ...missingEntries.map((entry) => `${entry}/`),
          ].join("\n");

          appendFileSync(gitignorePath, entriesToAdd + "\n", "utf-8");
          gitignoreUpdated = true;
          warnings.push(
            `Added missing entries to .gitignore: ${missingEntries.join(", ")}`,
          );
        } catch (error) {
          warnings.push(
            `Unable to update .gitignore: ${(error as Error).message}\n` +
              `Please manually add to .gitignore:\n` +
              missingEntries.map((e) => `  ${e}/`).join("\n"),
          );
        }
      }
    } catch (error) {
      warnings.push(
        `Unable to read .gitignore: ${(error as Error).message}\n` +
          `Please ensure .gitignore contains:\n` +
          `  .claude-temp/\n` +
          `  .claude-backups/`,
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
    gitignoreUpdated,
    authMode,
  };
}
