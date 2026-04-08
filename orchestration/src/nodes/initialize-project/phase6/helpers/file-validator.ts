/**
 * File Validator
 *
 * Validates markdown files (CLAUDE.md and project-context/SKILL.md)
 */

import { existsSync, readFileSync } from "fs";
import { MIN_CONTENT_LENGTH } from "../constants.js";
import type { FileValidationResult } from "../types.js";

/**
 * Validate a markdown file exists and has sufficient content
 */
export function validateMarkdownFile(
  filePath: string | undefined,
  fileName: string,
): FileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!filePath || !existsSync(filePath)) {
    errors.push(`${fileName} not found`);
    return {
      valid: false,
      exists: false,
      errors,
      warnings,
    };
  }

  const content = readFileSync(filePath, "utf-8");
  const contentLength = content.length;

  if (contentLength < MIN_CONTENT_LENGTH) {
    warnings.push(`${fileName} content seems too short`);
  }

  return {
    valid: true,
    exists: true,
    contentLength,
    path: filePath,
    errors,
    warnings,
  };
}
