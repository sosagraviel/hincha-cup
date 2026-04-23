import type { RetryState } from '../state/schemas/initialize-project.schema.js';
import type { ValidationResult } from './validator.js';
import { logger } from './logger.js';
import {
  cleanupAttemptDir,
  saveAttemptDiagnostics,
} from './shared/agent-factory/diagnostics-store.js';
import {
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  sleep,
  initRetryState,
  updateRetryState,
  completeRetryState,
  shouldRetry,
} from './retry.js';

export interface RetryDiagnosticsContext {
  projectPath: string;
  agentName: string;
}

/**
 * Detect recurring error patterns from history
 */
function detectErrorPatterns(errorHistory: string[]): string[] {
  if (errorHistory.length < 2) return [];

  const patterns: string[] = [];
  const errorTexts = errorHistory.map((e) => e.toLowerCase());

  // Pattern 1: Repeated JSON parsing errors
  if (errorTexts.filter((e) => e.includes('json')).length >= 2) {
    patterns.push('RECURRING: JSON format issues detected across multiple attempts');
    patterns.push('→ Double-check your JSON syntax, especially closing braces and commas');
  }

  // Pattern 2: Repeated missing field errors
  const missingFieldErrors = errorTexts.filter(
    (e) => e.includes('required') || e.includes('missing'),
  );
  if (missingFieldErrors.length >= 2) {
    patterns.push('RECURRING: Missing required fields across multiple attempts');
    patterns.push('→ Verify ALL required fields are present: agent_name, timestamp, findings');
  }

  // Pattern 3: Repeated schema validation errors
  if (errorTexts.filter((e) => e.includes('schema')).length >= 2) {
    patterns.push('RECURRING: Schema mismatch detected repeatedly');
    patterns.push('→ Review the exact schema requirements and match them precisely');
  }

  // Pattern 4: Markdown wrapping issues
  if (errorTexts.filter((e) => e.includes('markdown') || e.includes('```')).length >= 1) {
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
    guidance.push(
      `Attempt ${attemptNumber} failed. This is a retry - please fix the specific issues below.`,
    );
  }

  if (attemptNumber >= 3) {
    guidance.push('⚠️  Multiple retries required. Pay close attention to error patterns.');
  }

  // Specific error-based guidance
  if (validation.errors.some((e) => e.toLowerCase().includes('json'))) {
    guidance.push('JSON ERROR: Ensure output is valid, parseable JSON');
    guidance.push('  - Use double quotes for strings, not single quotes');
    guidance.push('  - No trailing commas in objects/arrays');
    guidance.push('  - Properly escape special characters');
  }

  if (validation.errors.some((e) => e.toLowerCase().includes('required'))) {
    const missingFields = extractMissingFields(validation.errors);
    if (missingFields.length > 0) {
      guidance.push(`MISSING FIELDS: ${missingFields.join(', ')}`);
      guidance.push('  - These fields are REQUIRED and must be present in your JSON output');
    }
  }

  if (validation.errors.some((e) => e.includes('agent_name'))) {
    guidance.push('AGENT NAME ERROR: Ensure agent_name field matches your analyzer name exactly');
  }

  if (validation.errors.some((e) => e.includes('timestamp'))) {
    guidance.push('TIMESTAMP ERROR: Use ISO 8601 format (e.g., "2024-01-15T10:30:00Z")');
  }

  // Check for array size limit violations (e.g., needs_verification too large)
  const tooBigError = validation.errors.find(
    (e) => e.toLowerCase().includes('too big') && e.includes('needs_verification'),
  );
  if (tooBigError) {
    // Extract the limit from error message like "<=5 items"
    const limitMatch = tooBigError.match(/<=(\d+)/);
    const limit = limitMatch ? limitMatch[1] : '5';

    guidance.push(`❌ ARRAY SIZE LIMIT EXCEEDED: needs_verification has TOO MANY items`);
    guidance.push(`  - Maximum allowed: ${limit} items`);
    guidance.push(`  - You must REDUCE the array to ${limit} items or fewer`);
    guidance.push(`  - Keep ONLY the most critical questions that CANNOT be determined from code`);
    guidance.push(`  - Remove less important or redundant questions`);
  }

  return guidance;
}

/**
 * Persist per-attempt validation-failure diagnostics to disk.
 *
 * Writes to `.claude-temp/<agent>/<sessionId>/attempt-<N>/` so diagnostics for
 * the same attempt (prompt/stdout/stderr from the agent impl + output and
 * validation errors from the retry layer) land in the same directory.
 */
async function persistValidationFailure(
  diagnostics: RetryDiagnosticsContext,
  sessionId: string,
  attemptNumber: number,
  output: string,
  validation: ValidationResult,
): Promise<void> {
  try {
    const dir = await saveAttemptDiagnostics({
      projectPath: diagnostics.projectPath,
      agentName: diagnostics.agentName,
      sessionId,
      attemptNumber,
      outcome: 'failure',
      output,
      validationErrors: validation.errors,
      errorMessage: `Validation failed (attempt ${attemptNumber}): ${validation.errors.join('; ')}`,
      meta: { failureReason: 'validation' },
    });
    if (dir) {
      logger.info(`💾 Attempt diagnostics saved to: ${dir}`);
    }
  } catch (error) {
    logger.warn(`Failed to save attempt diagnostics: ${(error as Error).message}`);
  }
}

/**
 * Build enhanced, progressive error feedback
 */
export function buildEnhancedFeedback(state: RetryState, validation: ValidationResult): string {
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
  const schemaHints =
    missingFields.length > 0 ? [`Required fields you're missing: ${missingFields.join(', ')}`] : [];

  const lines = [
    '',
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚠️  VALIDATION FAILED - ATTEMPT ${attemptNumber}/${state.max_attempts}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    '',
  ];

  // Show current error prominently
  lines.push('=== CURRENT ERROR ===');
  lines.push(state.last_error);
  lines.push('');

  // Show validation errors if available
  if (validation && !validation.valid) {
    lines.push('=== VALIDATION DETAILS ===');
    validation.errors.forEach((err) => lines.push(`  • ${err}`));
    lines.push('');
  }

  // Show detected patterns (if any)
  if (patterns.length > 0) {
    lines.push('=== ERROR PATTERNS DETECTED ===');
    patterns.forEach((pattern) => lines.push(`  ${pattern}`));
    lines.push('');
  }

  // Show contextual guidance
  if (guidance.length > 0) {
    lines.push('=== SPECIFIC GUIDANCE ===');
    guidance.forEach((guide) => lines.push(`  ${guide}`));
    lines.push('');
  }

  // Show schema hints
  if (schemaHints.length > 0) {
    lines.push('=== SCHEMA REQUIREMENTS ===');
    schemaHints.forEach((hint) => lines.push(`  • ${hint}`));
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
 * TWO-LAYER VALIDATION ARCHITECTURE:
 *
 * Layer 1 (Stop Hooks - Context Preserved):
 *   - Stop hooks validate output BEFORE agent finishes
 *   - When hook blocks, Claude CLI automatically retries in SAME session
 *   - Agent sees error feedback in conversation (context preserved!)
 *   - Claude manages iteration loop natively (no manual tracking)
 *   - Handles 90%+ of validation failures through internal retry
 *   - SILENT operation: No logs to orchestrator terminal
 *
 * Layer 2 (External Retry - Context Lost, Fallback Only):
 *   - THIS function (external retry) spawns NEW agent sessions
 *   - Triggers only when Layer 1 exhausts (Claude gives up)
 *   - Each retry is a FRESH session with error feedback in prompt
 *   - No session ID reuse - Claude CLI doesn't support cross-process session reuse
 *   - Provides safety net for hook failures or DeepAgents mode (no hooks)
 *   - Typically handles <10% of failures
 *   - VERBOSE logging: Each attempt logged with validation errors
 *   - SAVES FAILED ATTEMPTS: Writes .attempt-N files for troubleshooting
 *
 * When external retry triggers:
 *   1. Stop hook blocked until Claude gave up (rare - Claude is persistent)
 *   2. Hook script crashed or timed out (emergency failsafe)
 *   3. DeepAgents mode (API key auth - no hooks available)
 *
 * @param agentInvoke - Function that invokes the agent with a prompt (no session ID - each retry is fresh)
 * @param validator - Function that validates agent output
 * @param config - Retry configuration (default: maxAttempts=5)
 * @param outputFilePath - Optional path to output file (for saving failed attempts with .attempt-N extension)
 * @returns Validated result or throws after max attempts
 */
export async function retryWithEnhancedFeedback<T>(
  agentInvoke: (
    feedbackPrompt: string,
    resumeSessionId?: string,
    attemptNumber?: number,
  ) => Promise<{ output: string; sessionId: string }>,
  validator: (output: string) => ValidationResult,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  diagnostics?: RetryDiagnosticsContext,
): Promise<T> {
  let retryState = initRetryState(config.maxAttempts);
  let validation: ValidationResult | null = null;
  let lastSessionId: string | undefined; // Track session ID for context-preserving retry

  while (shouldRetry(retryState)) {
    // Build enhanced feedback from previous attempt
    const feedbackPrompt = validation ? buildEnhancedFeedback(retryState, validation) : '';
    const attemptNumber = retryState.attempt + 1; // 1-based for diagnostics/disk layout

    try {
      // Log external retry attempt start (skip first attempt - that's initial invocation)
      if (retryState.attempt > 0) {
        logger.blank();
        logger.warn(
          `🔄 External retry attempt ${retryState.attempt}/${config.maxAttempts} starting...`,
        );
        logger.info(`Resuming session: ${lastSessionId} (FULL CONTEXT PRESERVED)`);
        if (retryState.last_error) {
          logger.warn(`Previous error: ${retryState.last_error}`);
        }
      }

      // Invoke agent with feedback and session ID for context preservation
      // On retry (attempt > 0), pass lastSessionId to --resume the conversation
      const { output, sessionId } = await agentInvoke(
        feedbackPrompt,
        retryState.attempt > 0 ? lastSessionId : undefined,
        attemptNumber,
      );
      lastSessionId = sessionId; // Store for next retry

      // Validate output
      validation = validator(output);

      if (validation.valid) {
        // Success! Return validated data
        retryState = completeRetryState(retryState);

        // Log success if this was a retry
        if (retryState.attempt > 1) {
          logger.success(`✓ External retry succeeded after ${retryState.attempt} attempts`);
        }

        // Remove this attempt's diagnostics dir (unless debug mode) — the run
        // succeeded, so prompt/stdout/stderr for this attempt aren't useful.
        // Previously-failed attempt dirs are preserved for troubleshooting.
        if (diagnostics && lastSessionId) {
          await cleanupAttemptDir(
            diagnostics.projectPath,
            diagnostics.agentName,
            lastSessionId,
            attemptNumber,
          );
        }

        return validation.data as T;
      }

      // Validation failed - prepare for retry
      const errorMessage = validation.errors.join('; ');
      retryState = updateRetryState(retryState, errorMessage, config, output); // Store failed output

      // Persist validation-failure artifacts alongside the agent-impl attempt dir
      if (diagnostics && lastSessionId) {
        await persistValidationFailure(
          diagnostics,
          lastSessionId,
          attemptNumber,
          output,
          validation,
        );
      }

      // Log validation failure details
      logger.error(`❌ Validation failed: ${errorMessage}`);

      if (shouldRetry(retryState)) {
        logger.info(
          `Retrying with enhanced feedback (${config.maxAttempts - retryState.attempt} attempts remaining)...`,
        );

        // Wait before retry (with exponential backoff)
        if (retryState.next_delay_ms) {
          logger.info(
            `Waiting ${retryState.next_delay_ms}ms before retry (exponential backoff)...`,
          );
          await sleep(retryState.next_delay_ms);
        }
      } else {
        logger.error(`Max retry attempts (${config.maxAttempts}) exhausted`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      retryState = updateRetryState(retryState, errorMessage, config);

      // Log exception during agent invocation
      logger.error(`❌ Agent invocation failed: ${errorMessage}`);

      if (shouldRetry(retryState)) {
        logger.info(`Retrying (${config.maxAttempts - retryState.attempt} attempts remaining)...`);

        if (retryState.next_delay_ms) {
          logger.info(
            `Waiting ${retryState.next_delay_ms}ms before retry (exponential backoff)...`,
          );
          await sleep(retryState.next_delay_ms);
        }
      } else {
        logger.error(`Max retry attempts (${config.maxAttempts}) exhausted`);
      }
    }
  }

  // Max retries exceeded - log final failure summary
  logger.blank();
  logger.error(`❌ EXTERNAL RETRY FAILED after ${config.maxAttempts} attempts`);
  logger.error(`Last error: ${retryState.last_error}`);
  logger.error(`Error history:`);
  retryState.error_history.forEach((err, idx) => {
    logger.error(`  Attempt ${idx + 1}: ${err}`);
  });
  logger.blank();

  throw new Error(
    `Validation failed after ${config.maxAttempts} attempts.\n` +
      `Last error: ${retryState.last_error}\n` +
      `Error history: ${JSON.stringify(retryState.error_history, null, 2)}`,
  );
}

// Export everything from base retry.ts for convenience
export * from './retry.js';
