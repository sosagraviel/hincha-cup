import { z } from 'zod';
import { AnalyzerOutputSchema } from '../state/schemas/initialize-project.schema.js';
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
 * Validate analyzer output against Zod schema
 *
 * Replaces the bash implementation's AJV validation with Zod.
 *
 * @param output - Raw output from analyzer agent (should be JSON string or object)
 * @param agentName - Name of the analyzer agent
 * @returns Validation result with errors if invalid
 */
export function validateAnalyzerOutput(
  output: string | object,
  agentName: string
): ValidationResult {
  try {

    // Defensive check: Ensure schema is loaded
    if (!AnalyzerOutputSchema) {
      logger.error('CRITICAL: AnalyzerOutputSchema is undefined!');
      return {
        valid: false,
        errors: ['CRITICAL ERROR: Validation schema failed to load. This is a module loading issue.']
      };
    }


    let data: unknown;
    if (typeof output === 'string') {
      try {
        data = JSON.parse(output);
      } catch (parseError) {
        logger.error('[validator] JSON parse failed', parseError instanceof Error ? parseError : new Error(String(parseError)));
        return {
          valid: false,
          errors: ['Invalid JSON format: ' + (parseError as Error).message]
        };
      }
    } else {
      data = output;
    }

    const result = AnalyzerOutputSchema.safeParse(data);

    if (!result.success) {
      const zodError = result.error as any;

      logger.error('==================== VALIDATION FAILED ====================');
      logger.error(`Agent: ${agentName}`);
      logger.error(`Data keys: ${Object.keys(data || {}).join(', ')}`);
      logger.error(`Zod Error Type: ${zodError?.constructor?.name}`);
      logger.error(`Error keys available: ${Object.keys(zodError || {}).join(', ')}`);

      // Check for different error property names
      const errorsList = zodError?.issues || zodError?.errors || zodError?._errors || [];
      logger.error(`Found errors/issues array: ${Array.isArray(errorsList)}, length: ${errorsList.length}`);

      if (errorsList.length > 0) {
        logger.error(`First error structure: ${JSON.stringify(errorsList[0], null, 2)}`);
      }

      // Try to extract error messages from whatever structure exists
      let errors: string[] = [];

      if (Array.isArray(errorsList) && errorsList.length > 0) {
        errors = errorsList.map((err: any) => {
          const path = Array.isArray(err?.path) ? err.path.join('.') : (err?.path || 'unknown');
          const message = err?.message || err?.msg || 'validation error';
          const code = err?.code ? ` (${err.code})` : '';
          return `${path}: ${message}${code}`;
        });
      } else {
        // If no errors array found, show what we have
        errors = [
          'Zod validation failed but error structure is unexpected.',
          `Error object type: ${zodError?.constructor?.name || 'unknown'}`,
          `Available properties: ${Object.keys(zodError || {}).join(', ')}`,
          `Full error: ${JSON.stringify(zodError, null, 2).substring(0, 500)}`
        ];
      }

      logger.error(`Extracted error messages: ${JSON.stringify(errors, null, 2)}`);
      logger.error('==========================================================');

      return {
        valid: false,
        errors: [
          'Schema validation failed:',
          ...errors
        ]
      };
    }

    return {
      valid: true,
      errors: [],
      data: result.data
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
        errors: [
          'Schema validation failed:',
          ...errors
        ]
      };
    }

    if (error instanceof SyntaxError) {
      return {
        valid: false,
        errors: ['Invalid JSON format: ' + error.message]
      };
    }

    return {
      valid: false,
      errors: ['Validation error: ' + (error as Error).message]
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
    const firstBraceIndex = lines.findIndex(line => line.trimStart().startsWith('{'));
    if (firstBraceIndex >= 0) {
      return lines.slice(firstBraceIndex).join('\n').trim();
    }
  }

  // If no JSON found, return as-is and let validation fail with helpful error
  return cleaned;
}

/**
 * Extract a balanced JSON object from a string starting at a given position.
 * Tracks brace depth while respecting strings so trailing text is excluded.
 *
 * @param text - The full text to extract from
 * @param startIndex - Index of the opening '{'
 * @returns The balanced JSON substring, or null if braces never balance
 */
function extractBalancedJSON(text: string, startIndex: number): string | null {
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
  agentName: string
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
        preview + (hasMore ? '\n...[truncated]' : '')
      ]
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
    '   - agent_name (must match your analyzer name)',
    '   - timestamp (ISO 8601 format)',
    '   - findings (object with your analysis)',
    '4. Optional fields:',
    '   - needs_verification (array, max 3 items)',
    '   - confidence_level ("high", "medium", or "low")',
    '',
    'Please correct these issues and output valid JSON.'
  ];

  return lines.join('\n');
}
