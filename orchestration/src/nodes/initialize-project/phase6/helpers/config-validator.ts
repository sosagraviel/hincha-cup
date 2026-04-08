/**
 * Config Validator
 *
 * Validates framework-config.json structure and required fields
 */

import { existsSync, readFileSync } from "fs";
import type { ValidationResult } from "../types.js";

/**
 * Validate framework-config.json exists and has required structure
 */
export function validateFrameworkConfig(
  configPath: string | undefined,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!configPath || !existsSync(configPath)) {
    errors.push("framework-config.json not found");
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  try {
    const configContent = readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent);

    // Validate required sections exist
    if (!config.version) {
      errors.push("framework-config.json missing version");
    }
    if (!config.project_metadata) {
      errors.push("framework-config.json missing project_metadata");
    }
    if (!config.stack_profile) {
      errors.push("framework-config.json missing stack_profile");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(
      `framework-config.json invalid JSON: ${(error as Error).message}`,
    );
    return {
      valid: false,
      errors,
      warnings,
    };
  }
}
