import type { RetryState } from '../state/schemas/initialize-project.schema.js';
import type { ValidationResult } from './validator.js';
import { logger } from './logger.js';
import {
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  calculateBackoffDelay,
  sleep,
  initRetryState,
  updateRetryState,
  completeRetryState,
  shouldRetry
} from './retry.js';

/**
 * Enhanced feedback with progressive detail and pattern detection
 */
interface EnhancedFeedback {
  attemptNumber: number;
  lastError: string;
  specificGuidance: string[];
  detectedPatterns: string[];
  schemaHints: string[];
}

/**
 * Detect recurring error patterns from history
 */
function detectErrorPatterns(errorHistory: string[]): string[] {
  if (errorHistory.length < 2) return [];

  const patterns: string[] = [];
  const errorTexts = errorHistory.map(e => e.toLowerCase());

  // Pattern 1: Repeated JSON parsing errors
  if (errorTexts.filter(e => e.includes('json')).length >= 2) {
    patterns.push('RECURRING: JSON format issues detected across multiple attempts');
    patterns.push('→ Double-check your JSON syntax, especially closing braces and commas');
  }

  // Pattern 2: Repeated missing field errors
  const missingFieldErrors = errorTexts.filter(e => e.includes('required') || e.includes('missing'));
  if (missingFieldErrors.length >= 2) {
    patterns.push('RECURRING: Missing required fields across multiple attempts');
    patterns.push('→ Verify ALL required fields are present: agent_name, timestamp, findings');
  }

  // Pattern 3: Repeated schema validation errors
  if (errorTexts.filter(e => e.includes('schema')).length >= 2) {
    patterns.push('RECURRING: Schema mismatch detected repeatedly');
    patterns.push('→ Review the exact schema requirements and match them precisely');
  }

  // Pattern 4: Markdown wrapping issues
  if (errorTexts.filter(e => e.includes('markdown') || e.includes('```')).length >= 1) {
    patterns.push('ISSUE: Markdown code blocks detected');
    patterns.push('→ Output ONLY raw JSON, no markdown formatting or code blocks');
  }

  return patterns;
}

/**
 * Extract specific missing fields from validation errors
 */
function extractMissingFields(errors: string[]): string[] {
  const missingFields: string[] = [];

  for (const error of errors) {
    // Match Zod error patterns like "field_name: Required" or "Missing field_name"
    const requiredMatch = error.match(/(\w+):\s*Required/i);
    const missingMatch = error.match(/Missing\s+(\w+)/i);

    if (requiredMatch) {
      missingFields.push(requiredMatch[1]);
    } else if (missingMatch) {
      missingFields.push(missingMatch[1]);
    }
  }

  return [...new Set(missingFields)]; // Deduplicate
}

/**
 * Generate contextual guidance based on specific validation errors
 */
function generateContextualGuidance(validation: ValidationResult, attemptNumber: number): string[] {
  const guidance: string[] = [];

  // Early attempts: General guidance
  if (attemptNumber === 1) {
    guidance.push('First attempt failed. Review the error details carefully.');
  }

  // Later attempts: More specific, escalating urgency
  if (attemptNumber >= 2) {
    guidance.push(`Attempt ${attemptNumber} failed. This is a retry - please fix the specific issues below.`);
  }

  if (attemptNumber >= 3) {
    guidance.push('⚠️  Multiple retries required. Pay close attention to error patterns.');
  }

  // Specific error-based guidance
  if (validation.errors.some(e => e.toLowerCase().includes('json'))) {
    guidance.push('JSON ERROR: Ensure output is valid, parseable JSON');
    guidance.push('  - Use double quotes for strings, not single quotes');
    guidance.push('  - No trailing commas in objects/arrays');
    guidance.push('  - Properly escape special characters');
  }

  if (validation.errors.some(e => e.toLowerCase().includes('required'))) {
    const missingFields = extractMissingFields(validation.errors);
    if (missingFields.length > 0) {
      guidance.push(`MISSING FIELDS: ${missingFields.join(', ')}`);
      guidance.push('  - These fields are REQUIRED and must be present in your JSON output');
    }
  }

  if (validation.errors.some(e => e.includes('agent_name'))) {
    guidance.push('AGENT NAME ERROR: Ensure agent_name field matches your analyzer name exactly');
  }

  if (validation.errors.some(e => e.includes('timestamp'))) {
    guidance.push('TIMESTAMP ERROR: Use ISO 8601 format (e.g., "2024-01-15T10:30:00Z")');
  }

  return guidance;
}

/**
 * Build enhanced, progressive error feedback
 */
export function buildEnhancedFeedback(
  state: RetryState,
  validation: ValidationResult
): string {
  if (!state.last_error) {
    return '';
  }

  const attemptNumber = state.attempt;
  const errorHistory = state.error_history || [];

  // Detect patterns
  const patterns = detectErrorPatterns(errorHistory);

  // Generate contextual guidance
  const guidance = generateContextualGuidance(validation, attemptNumber);

  // Extract schema hints
  const missingFields = extractMissingFields(validation.errors);
  const schemaHints = missingFields.length > 0
    ? [`Required fields you're missing: ${missingFields.join(', ')}`]
    : [];

  const lines = [
    '',
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚠️  VALIDATION FAILED - ATTEMPT ${attemptNumber}/${state.max_attempts}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ''
  ];

  // Show current error prominently
  lines.push('=== CURRENT ERROR ===');
  lines.push(state.last_error);
  lines.push('');

  // Show validation errors if available
  if (validation && !validation.valid) {
    lines.push('=== VALIDATION DETAILS ===');
    validation.errors.forEach(err => lines.push(`  • ${err}`));
    lines.push('');
  }

  // Show detected patterns (if any)
  if (patterns.length > 0) {
    lines.push('=== ERROR PATTERNS DETECTED ===');
    patterns.forEach(pattern => lines.push(`  ${pattern}`));
    lines.push('');
  }

  // Show contextual guidance
  if (guidance.length > 0) {
    lines.push('=== SPECIFIC GUIDANCE ===');
    guidance.forEach(guide => lines.push(`  ${guide}`));
    lines.push('');
  }

  // Show schema hints
  if (schemaHints.length > 0) {
    lines.push('=== SCHEMA REQUIREMENTS ===');
    schemaHints.forEach(hint => lines.push(`  • ${hint}`));
    lines.push('');
  }

  // Show previous attempt summary (if multiple retries)
  if (errorHistory.length > 1) {
    lines.push('=== PREVIOUS ATTEMPT SUMMARY ===');
    errorHistory.slice(0, -1).forEach((err, idx) => {
      const preview = err.substring(0, 80);
      lines.push(`  Attempt ${idx + 1}: ${preview}${err.length > 80 ? '...' : ''}`);
    });
    lines.push('');
  }

  // Final instructions - escalating urgency
  lines.push('=== CRITICAL INSTRUCTIONS ===');
  if (attemptNumber >= 4) {
    lines.push('⚠️⚠️⚠️ FINAL ATTEMPT APPROACHING ⚠️⚠️⚠️');
    lines.push('This is your LAST chance. Carefully review ALL errors above.');
    lines.push('');
  }

  lines.push('You MUST fix the following to proceed:');
  lines.push('  1. ✓ Output valid, parseable JSON (no markdown, no code blocks)');
  lines.push('  2. ✓ Include ALL required fields (check schema requirements above)');
  lines.push('  3. ✓ Use correct data types for each field');
  lines.push('  4. ✓ Match the agent_name to your analyzer name exactly');
  lines.push('  5. ✓ Use ISO 8601 format for timestamps');
  lines.push('');
  lines.push(`Remaining attempts: ${state.max_attempts - attemptNumber}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Enhanced retry wrapper with progressive feedback
 *
 * @param agentInvoke - Function that invokes the agent with a prompt
 * @param validator - Function that validates agent output
 * @param config - Retry configuration
 * @returns Validated result or throws after max attempts
 */
export async function retryWithEnhancedFeedback<T>(
  agentInvoke: (feedbackPrompt: string) => Promise<string>,
  validator: (output: string) => ValidationResult,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let retryState = initRetryState(config.maxAttempts);
  let validation: ValidationResult | null = null;

  while (shouldRetry(retryState)) {
    // Build enhanced feedback from previous attempt
    const feedbackPrompt = validation
      ? buildEnhancedFeedback(retryState, validation)
      : '';

    try {
      // Invoke agent with feedback
      const output = await agentInvoke(feedbackPrompt);

      // Validate output
      validation = validator(output);

      if (validation.valid) {
        // Success! Return validated data
        retryState = completeRetryState(retryState);
        logger.info(`✓ Validation succeeded on attempt ${retryState.attempt + 1}`);
        return validation.data as T;
      }

      // Validation failed - prepare for retry
      const errorMessage = validation.errors.join('; ');
      retryState = updateRetryState(retryState, errorMessage, config);

      logger.warn(`✗ Attempt ${retryState.attempt}/${config.maxAttempts} failed: ${errorMessage.substring(0, 100)}`);

      // Wait before retry (with exponential backoff)
      if (retryState.next_delay_ms && shouldRetry(retryState)) {
        logger.info(`  Waiting ${retryState.next_delay_ms}ms before retry...`);
        await sleep(retryState.next_delay_ms);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      retryState = updateRetryState(retryState, errorMessage, config);

      logger.error(`✗ Attempt ${retryState.attempt}/${config.maxAttempts} threw exception: ${errorMessage}`);

      if (shouldRetry(retryState) && retryState.next_delay_ms) {
        logger.info(`  Waiting ${retryState.next_delay_ms}ms before retry...`);
        await sleep(retryState.next_delay_ms);
      }
    }
  }

  // Max retries exceeded
  throw new Error(
    `Validation failed after ${config.maxAttempts} attempts.\n` +
    `Last error: ${retryState.last_error}\n` +
    `Error history: ${JSON.stringify(retryState.error_history, null, 2)}`
  );
}

// Export everything from base retry.ts for convenience
export * from './retry.js';
