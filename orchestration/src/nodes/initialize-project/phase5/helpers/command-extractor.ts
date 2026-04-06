/**
 * Command Extractor
 *
 * Extract project commands from package.json and provide language defaults
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { COMMAND_DEFAULTS } from "../constants.js";
import type { CommandSet } from "../types.js";

/**
 * Extract package.json commands (for TypeScript/JavaScript projects)
 */
export function extractPackageCommands(projectPath: string): Partial<CommandSet> {
  const packageJsonPath = join(projectPath, "package.json");

  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const scripts = packageJson.scripts || {};

    return {
      lint: scripts.lint ? "npm run lint" : "",
      format: scripts.format ? "npm run format" : "",
      typecheck:
        scripts.typecheck || scripts["type-check"]
          ? `npm run ${scripts.typecheck ? "typecheck" : "type-check"}`
          : "",
      test: scripts.test ? "npm test" : "",
      build: scripts.build ? "npm run build" : "",
    };
  } catch {
    return {};
  }
}

/**
 * Get default commands for a language
 */
export function getDefaultCommands(language: string): CommandSet {
  const langLower = language.toLowerCase();
  return COMMAND_DEFAULTS[langLower] || COMMAND_DEFAULTS.typescript;
}
