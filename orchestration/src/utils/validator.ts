import { z } from 'zod';
import { validateAgentOutput } from '../schemas/phase1-agent-outputs.schema.js';
import { logger } from './logger.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}

/**
 * Recursively strip null values from object keys.
 *
 * OpenAI Structured Outputs requires every property to be listed in `required`,
 * so optional fields are emitted as `{"foo": null}` (our schema transformer wraps
 * them as `anyOf: [T, null]`). Zod's `.optional()` validator accepts `undefined`
 * or absent keys but rejects explicit `null`.
 *
 * We treat a null value as "field absent" and remove the key before validation.
 * Arrays are left intact — null elements are a semantic error worth surfacing.
 */
function stripNullValues<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripNullValues(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === null) continue;
      result[key] = stripNullValues(val);
    }
    return result as unknown as T;
  }
  return value;
}

/**
 * Validate analyzer output against Zod schema
 *
 * Uses centralized schema registry with automatic schema selection based on agent_name.
 *
 * @param output - Raw output from analyzer agent (should be JSON string or object)
 * @param agentName - Name of the analyzer agent (for logging only - schema selected from agent_name field in output)
 * @returns Validation result with errors if invalid
 */
export function validateAnalyzerOutput(
  output: string | object,
  agentName: string,
): ValidationResult {
  try {
    let data: unknown;
    if (typeof output === 'string') {
      try {
        data = JSON.parse(output);
      } catch (parseError) {
        logger.error(
          '[validator] JSON parse failed',
          parseError instanceof Error ? parseError : new Error(String(parseError)),
        );
        return {
          valid: false,
          errors: ['Invalid JSON format: ' + (parseError as Error).message],
        };
      }
    } else {
      data = output;
    }

    // Treat explicit nulls as absent keys so OpenAI Structured Outputs (which
    // emits `null` for optional fields) round-trips through Zod's `.optional()`.
    data = stripNullValues(data);

    // Use centralized validator with automatic schema selection
    const result = validateAgentOutput(data);

    if (!result.success) {
      const zodError = result.errors;

      logger.error('==================== VALIDATION FAILED ====================');
      logger.error(`Agent (from argument): ${agentName}`);
      logger.error(`Agent (from output): ${result.agentName || 'unknown'}`);
      logger.error(`Data keys: ${Object.keys(data || {}).join(', ')}`);

      // Extract error messages from Zod error
      let errors: string[] = [];

      if (zodError && zodError.issues) {
        errors = zodError.issues.map((err: any) => {
          const path = Array.isArray(err?.path) ? err.path.join('.') : err?.path || 'unknown';
          const message = err?.message || err?.msg || 'validation error';
          const code = err?.code ? ` (${err.code})` : '';
          return `${path}: ${message}${code}`;
        });
      } else {
        errors = [
          'Validation failed but error structure is unexpected.',
          `Full error: ${JSON.stringify(zodError, null, 2).substring(0, 500)}`,
        ];
      }

      logger.error(`Extracted error messages: ${JSON.stringify(errors, null, 2)}`);
      logger.error('==========================================================');

      return {
        valid: false,
        errors: ['Schema validation failed:', ...errors],
      };
    }

    return {
      valid: true,
      errors: [],
      data: result.data,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[validator] EXCEPTION in validateAnalyzerOutput', err);
    logger.error(`[validator] Error type: ${(error as any)?.constructor?.name || 'unknown'}`);
    logger.error(`[validator] Error message: ${err.message}`);

    if (error instanceof z.ZodError) {
      const zodError = error as any;
      const errors = zodError?.errors?.map?.((err: any) => {
        const path = err?.path?.join?.('.') || 'unknown';
        return `${path}: ${err?.message || 'validation error'}`;
      }) || ['Unknown validation error - Zod error structure is unexpected'];

      return {
        valid: false,
        errors: ['Schema validation failed:', ...errors],
      };
    }

    if (error instanceof SyntaxError) {
      return {
        valid: false,
        errors: ['Invalid JSON format: ' + error.message],
      };
    }

    return {
      valid: false,
      errors: ['Validation error: ' + (error as Error).message],
    };
  }
}

/**
 * Extract JSON from agent output
 *
 * This function replicates the bash script's JSON extraction logic (phase1-analysis.sh:182-196).
 * It handles common cases:
 * 1. Markdown-wrapped JSON: ```json\n{...}\n```
 * 2. JSON with preceding/trailing text: "Here is the output:\n{...}\nHope this helps!"
 *
 * @param output - Raw agent output (may contain markdown, explanatory text, etc.)
 * @returns Extracted JSON string
 */
export function extractJSON(output: string): string {
  const cleaned = output.trim();

  // Case 1: Check if output contains markdown code block
  // Matches bash: if grep -q '```json' "$OUTPUT_FILE"; then
  if (cleaned.includes('```json')) {
    // Extract content between ```json and ``` (excluding the markers)
    // Matches bash: sed -n '/```json/,/```/p' "$OUTPUT_FILE" | sed '1d;$d'
    const jsonBlockMatch = cleaned.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      return jsonBlockMatch[1].trim();
    }
    // If we found ```json but couldn't extract, try fallback
  }

  // Case 2: Find first '{' and extract the balanced JSON object
  const startIndex = cleaned.indexOf('{');
  if (startIndex >= 0) {
    const extracted = extractBalancedJSON(cleaned, startIndex);
    if (extracted) {
      return extracted;
    }
    // Fallback: take from first { to end (original behavior)
    const lines = cleaned.split('\n');
    const firstBraceIndex = lines.findIndex((line) => line.trimStart().startsWith('{'));
    if (firstBraceIndex >= 0) {
      return lines.slice(firstBraceIndex).join('\n').trim();
    }
  }

  // If no JSON found, return as-is and let validation fail with helpful error
  return cleaned;
}

/**
 * Extract synthesis markdown sections from agent output
 *
 * Handles preamble text (like "Let me output..." or explanations) by finding
 * the actual section markers anywhere in the text. Similar to extractJSON resilience.
 *
 * Agents sometimes add conversational text before the actual output:
 * - "The validation hook requires my response to follow a specific format. Let me output..."
 * - "I see I need to follow the format. Here it is:"
 * - Tool use blocks before the actual content
 *
 * This function finds the section headers regardless of preamble.
 *
 * @param output - Raw output from synthesis agent
 * @returns Object with claudemd and projectContext content, or null if not found
 */
export function extractSynthesisMarkdown(output: string): {
  claudemd: string;
  projectContext: string;
} | null {
  // Accept both providers' instruction-file headers: Claude emits
  // "# CLAUDE.md Content", Codex emits "# AGENTS.md Content".
  const CLAUDE_HEADER = '# CLAUDE.md Content';
  const AGENTS_HEADER = '# AGENTS.md Content';
  const CONTEXT_HEADER = '# project-context/SKILL.md Content';

  let headerIndex = output.indexOf(CLAUDE_HEADER);
  let headerLength = CLAUDE_HEADER.length;

  if (headerIndex === -1) {
    headerIndex = output.indexOf(AGENTS_HEADER);
    headerLength = AGENTS_HEADER.length;
  }

  if (headerIndex === -1) {
    return null;
  }

  // Find "---" separator on its own line after the instruction-file content
  const separatorMatch = output.slice(headerIndex).match(/\n---\s*\n/);
  if (!separatorMatch || separatorMatch.index === undefined) {
    return null;
  }

  // Find project-context header AFTER the separator so a stray marker inside
  // the instruction-file body can't be mistaken for the skill section.
  const contextHeaderIndex = output.indexOf(CONTEXT_HEADER, headerIndex + separatorMatch.index);
  if (contextHeaderIndex === -1) {
    return null;
  }

  const claudeStartIndex = headerIndex + headerLength;
  const claudeEndIndex = headerIndex + separatorMatch.index;
  const claudemd = output.slice(claudeStartIndex, claudeEndIndex).trim();

  const contextStartIndex = contextHeaderIndex + CONTEXT_HEADER.length;
  const projectContext = output.slice(contextStartIndex).trim();

  return { claudemd, projectContext };
}

/**
 * Extract a balanced JSON object from a string starting at a given position.
 * Tracks brace depth while respecting strings so trailing text is excluded.
 *
 * This is exported for use by hook validation scripts.
 *
 * @param text - The full text to extract from
 * @param startIndex - Index of the opening '{'
 * @returns The balanced JSON substring, or null if braces never balance
 */
export function extractBalancedJSON(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.substring(startIndex, i + 1);
      }
    }
  }

  // Braces never balanced
  return null;
}

/**
 * Validate and parse agent output with automatic JSON extraction
 *
 * Combines extraction and validation in one step.
 *
 * @param rawOutput - Raw agent output (may contain markdown, explanatory text, etc.)
 * @param agentName - Name of the analyzer agent
 * @returns Validation result
 */
export function validateAndParseAgentOutput(
  rawOutput: string,
  agentName: string,
): ValidationResult {
  try {
    const jsonString = extractJSON(rawOutput);

    const result = validateAnalyzerOutput(jsonString, agentName);
    if (!result.valid) {
    }

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[validator] Exception during validation', err);

    // Show first 500 chars of raw output for debugging
    const preview = rawOutput.substring(0, 500);
    const hasMore = rawOutput.length > 500;

    return {
      valid: false,
      errors: [
        'Failed to extract JSON: ' + (error as Error).message,
        '',
        '=== RAW OUTPUT PREVIEW ===',
        preview + (hasMore ? '\n...[truncated]' : ''),
      ],
    };
  }
}

/**
 * Build detailed validation error message for agent feedback
 *
 * Creates a user-friendly error message that can be fed back to the agent
 * for self-correction on the next retry attempt.
 *
 * @param result - Validation result from previous attempt
 * @returns Formatted error message
 */
export function buildValidationErrorFeedback(result: ValidationResult): string {
  if (result.valid) {
    return '';
  }

  const lines = [
    '',
    '⚠️  VALIDATION FAILED',
    '',
    '=== VALIDATION ERRORS ===',
    ...result.errors,
    '',
    '=== INSTRUCTIONS FOR CORRECTION ===',
    '1. Ensure your output is valid JSON',
    '2. Do NOT wrap JSON in markdown code blocks',
    '3. All required fields must be present:',
    '   - agent_name (must exactly match your analyzer name)',
    '   - timestamp (ISO 8601 format)',
    '   - findings.services (REQUIRED array with at least 1 service)',
    '   - Each service must have: id, path, type, language',
    '4. Optional fields:',
    '   - needs_verification (array, max 5 items)',
    '',
    'CRITICAL: findings.services array is REQUIRED for service-centric schema.',
    'Each service represents a discovered project component with its own stack.',
    '',
    'Please correct these issues and output valid JSON.',
  ];

  return lines.join('\n');
}
