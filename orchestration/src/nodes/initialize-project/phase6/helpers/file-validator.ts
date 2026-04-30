/**
 * File Validator
 *
 * Validates generated markdown files: CLAUDE.md / AGENTS.md and the three
 * prescriptive convention skills emitted by Phase 3 synthesis.
 */

import { existsSync, readFileSync } from 'fs';
import matter from 'gray-matter';
import { MIN_CONTENT_LENGTH } from '../constants.js';
import type { FileValidationResult } from '../types.js';

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

  const content = readFileSync(filePath, 'utf-8');
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

export function validateWikiMarkdownFile(
  filePath: string | undefined,
  fileName: string,
  options: { serviceDoc?: boolean } = {},
): FileValidationResult {
  const result = validateMarkdownFile(filePath, fileName);
  if (!result.valid || !filePath) {
    return result;
  }

  const errors = [...result.errors];
  const warnings = [...result.warnings];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = matter(content);
    const requiredFields = [
      'document_type',
      'generated_at',
      'generated_by',
      'graph_version',
      'graph_queries_used',
    ];

    for (const field of requiredFields) {
      if (parsed.data[field] === undefined || parsed.data[field] === null) {
        errors.push(`${fileName} frontmatter missing ${field}`);
      }
    }

    if (parsed.data.generated_by && parsed.data.generated_by !== 'ai-agentic-framework') {
      errors.push(`${fileName} frontmatter generated_by must be ai-agentic-framework`);
    }

    if (parsed.data.graph_queries_used && !Array.isArray(parsed.data.graph_queries_used)) {
      errors.push(`${fileName} frontmatter graph_queries_used must be an array`);
    }

    if (options.serviceDoc && !parsed.data.service_id) {
      errors.push(`${fileName} frontmatter missing service_id`);
    }
  } catch (error) {
    errors.push(`${fileName} frontmatter invalid: ${(error as Error).message}`);
  }

  return {
    ...result,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
