import fs from 'fs';
import matter from 'gray-matter';
import { logger } from '../../logger.js';

export interface AgentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  frontmatter?: Record<string, any>;
}

/**
 * Validates agent markdown file before invoking Claude CLI
 *
 * Performs 4-layer validation:
 * 1. Path validation - file exists and is markdown
 * 2. Frontmatter parsing - valid YAML syntax
 * 3. Required fields - name and description present
 * 4. Field names - recognized by Claude CLI
 *
 * @param agentPath - Absolute path to agent markdown file
 * @returns ValidationResult with errors and warnings
 */
export function validateAgentFile(agentPath: string): AgentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Layer 1: Path validation
  if (!agentPath || agentPath.trim() === '') {
    return { valid: false, errors: ['Agent path is required'], warnings: [] };
  }

  if (!fs.existsSync(agentPath)) {
    return { valid: false, errors: [`Agent file not found: ${agentPath}`], warnings: [] };
  }

  if (!agentPath.endsWith('.md')) {
    return {
      valid: false,
      errors: [`Agent file must be markdown (.md), got: ${agentPath}`],
      warnings: []
    };
  }

  // Layer 2: Read and parse
  let content: string;
  try {
    content = fs.readFileSync(agentPath, 'utf-8');
  } catch (e) {
    return {
      valid: false,
      errors: [`Failed to read agent file: ${(e as Error).message}`],
      warnings: []
    };
  }

  if (!content.startsWith('---')) {
    return {
      valid: false,
      errors: [`Agent file missing frontmatter (must start with '---'): ${agentPath}`],
      warnings: []
    };
  }

  // Parse frontmatter
  let frontmatter: Record<string, any>;
  try {
    const parsed = matter(content);
    frontmatter = parsed.data;
  } catch (e) {
    return {
      valid: false,
      errors: [`Invalid YAML in agent frontmatter: ${(e as Error).message}`],
      warnings: []
    };
  }

  // Layer 3: Required fields
  if (!frontmatter.name) {
    errors.push('Missing required field: name');
  }

  if (!frontmatter.description) {
    errors.push('Missing required field: description');
  }

  // Layer 4: Validate field names
  // Valid Claude CLI frontmatter fields per official documentation
  // Source: https://code.claude.com/docs/en/sub-agents.md#supported-frontmatter-fields
  const VALID_CLI_FIELDS = [
    'name', 'description', 'model', 'tools', 'disallowedTools',
    'permissionMode', 'maxTurns', 'skills', 'mcpServers',
    'hooks', 'memory', 'background', 'effort',
    'isolation', 'initialPrompt',
    // Individual hook fields (alternative to hooks object)
    // Source: https://code.claude.com/docs/en/hooks-guide
    'user-prompt-submit-hook', 'assistant-message-hook',
    'pre-tool-use-hook', 'post-tool-use-hook', 'stop-hook'
  ];

  // Framework-specific fields (not Claude CLI, but we use them internally)
  const FRAMEWORK_FIELDS = [
    'subagent_type', 'output_format', 'run_in_background'
  ];

  const allFields = [...VALID_CLI_FIELDS, ...FRAMEWORK_FIELDS];

  for (const field of Object.keys(frontmatter)) {
    if (!allFields.includes(field)) {
      warnings.push(
        `Unknown field '${field}' - Claude CLI may not recognize this field`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    frontmatter
  };
}

/**
 * Throws clear error if agent file is invalid
 *
 * Use this when you want to fail fast with a descriptive error message.
 * The error message includes all validation errors formatted for readability.
 *
 * @param agentPath - Absolute path to agent markdown file
 * @throws Error with detailed validation failure message
 */
export function assertAgentFileValid(agentPath: string): void {
  const result = validateAgentFile(agentPath);

  if (!result.valid) {
    const errorMsg = [
      `Invalid agent file: ${agentPath}`,
      '',
      'Errors:',
      ...result.errors.map(e => `  - ${e}`)
    ].join('\n');

    throw new Error(errorMsg);
  }

  if (result.warnings.length > 0) {
    logger.warn(`Agent file warnings for ${agentPath}:`);
    result.warnings.forEach(w => logger.warn(`  - ${w}`));
  }
}
