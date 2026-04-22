/**
 * Directory Validator
 *
 * Validates .claude subdirectories exist and contain expected files
 */

import { existsSync, readdirSync } from 'fs';
import { FILE_EXTENSIONS } from '../constants.js';
import type { DirectoryValidationResult } from '../types.js';
import { resolveConfigPath } from '../../../../utils/provider-paths.js';

/**
 * Validate a directory exists
 */
export function validateDirectoryExists(
  directoryPath: string,
  directoryName: string,
): DirectoryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(directoryPath)) {
    errors.push(`${directoryName} directory not found`);
    return {
      valid: false,
      exists: false,
      errors,
      warnings,
    };
  }

  return {
    valid: true,
    exists: true,
    errors,
    warnings,
  };
}

/**
 * Validate a directory exists and contains markdown files
 */
export function validateDirectoryWithFiles(
  directoryPath: string,
  directoryName: string,
  fileExtension: string = FILE_EXTENSIONS.MARKDOWN,
): DirectoryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(directoryPath)) {
    errors.push(`${directoryName} directory not found`);
    return {
      valid: false,
      exists: false,
      errors,
      warnings,
    };
  }

  const files = readdirSync(directoryPath).filter((f) => f.endsWith(fileExtension));

  return {
    valid: true,
    exists: true,
    fileCount: files.length,
    files,
    errors,
    warnings,
  };
}

/**
 * Get standard .claude directory paths
 */
export function getClaudeDirectories(projectPath: string) {
  return {
    skills: resolveConfigPath(projectPath, 'skills'),
    agents: resolveConfigPath(projectPath, 'agents'),
  };
}
