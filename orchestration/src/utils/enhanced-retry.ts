import type { RetryState } from '../state/schemas/initialize-project.schema.js';
import type { ValidationResult } from './validator.js';
import { logger } from './logger.js';
import { tryActiveDebugStore, type PhaseSlot } from '../services/framework/debug-store/index.js';
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
  /** Phase slot used to place debug artifacts correctly. Optional for back-compat. */
  phase?: PhaseSlot;
}

/**
 * Detect recurring error patterns from history
 */
function detectErrorPatterns(errorHistory: string[]): string[] {
  if (errorHistory.length < 2) return [];

  const patterns: string[] = [];
  const errorTexts = errorHistory.map((e) => e.toLowerCase());

  if (errorTexts.filter((e) => e.includes('json')).length >= 2) {
    patterns.push('RECURRING: JSON format issues detected across multiple attempts');
    patterns.push('→ Double-check your JSON syntax, especially closing braces and commas');
  }
  const missingFieldErrors = errorTexts.filter(
    (e) => e.includes('required') || e.includes('missing'),
  );
  if (missingFieldErrors.length >= 2) {
    patterns.push('RECURRING: Missing required fields across multiple attempts');
    patterns.push('→ Verify ALL required fields are present: agent_name, timestamp, findings');
  }
  if (errorTexts.filter((e) => e.includes('schema')).length >= 2) {
    patterns.push('RECURRING: Schema mismatch detected repeatedly');
    patterns.push('→ Review the exact schema requirements and match them precisely');
  }
  if (errorTexts.filter((e) => e.includes('markdown') || e.includes('```')).length >= 1) {
    patterns.push('ISSUE: Markdown code blocks detected');
    patterns.push('→ Output ONLY raw JSON, no markdown formatting or code blocks');
  }

  return patterns;
}

function extractMissingFields(errors: string[]): string[] {
  const missingFields: string[] = [];
  for (const error of errors) {
    const requiredMatch = error.match(/(\w+):\s*Required/i);
    const missingMatch = error.match(/Missing\s+(\w+)/i);
    if (requiredMatch) missingFields.push(requiredMatch[1]);
    else if (missingMatch) missingFields.push(missingMatch[1]);
  }
  return [...new Set(missingFields)];
}

function generateContextualGuidance(validation: ValidationResult, attemptNumber: number): string[] {
  const guidance: string[] = [];
  if (attemptNumber === 1)
    guidance.push('First attempt failed. Review the error details carefully.');
  if (attemptNumber >= 2)
    guidance.push(
      `Attempt ${attemptNumber} failed. This is a retry - please fix the specific issues below.`,
    );
  if (attemptNumber >= 3)
    guidance.push('⚠️  Multiple retries required. Pay close attention to error patterns.');

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
  const tooBigError = validation.errors.find(
    (e) => e.toLowerCase().includes('too big') && e.includes('needs_verification'),
  );
  if (tooBigError) {
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
 * Persist validation-failure artifacts into the same attempt folder that the
 * agent impl wrote to. Uses the active DebugStore if one is registered —
 * otherwise the call is a cheap no-op (tests, ad-hoc scripts).
 */
async function persistValidationFailure(
  diagnostics: RetryDiagnosticsContext,
  sessionId: string,
  attemptNumber: number,
  output: string,
  validation: ValidationResult,
): Promise<void> {
  const store = tryActiveDebugStore();
  if (!store) return;
  const phase =
    diagnostics.phase ??
    ({ phaseId: 'phase-unknown', phaseNumber: 0, phaseLabel: 'Unknown phase' } as PhaseSlot);
  try {
    const writer = store.beginAttempt({
      ...phase,
      agentName: diagnostics.agentName,
      sessionId,
      attemptNumber,
    });
    await writer.writeValidationErrors(validation.errors);
    await writer.writeOutputRaw(output);
    await writer.mergeMeta({
      outcome: 'failure',
      failureReason: 'validation',
      validationErrorCount: validation.errors.length,
    });
    logger.info(`💾 Attempt diagnostics saved to: ${writer.attemptDir}`);
  } catch (error) {
    logger.warn(`Failed to save attempt diagnostics: ${(error as Error).message}`);
  }
}

export function buildEnhancedFeedback(state: RetryState, validation: ValidationResult): string {
  if (!state.last_error) return '';

  const attemptNumber = state.attempt;
  const errorHistory = state.error_history || [];
  const patterns = detectErrorPatterns(errorHistory);
  const guidance = generateContextualGuidance(validation, attemptNumber);
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

  lines.push('=== CURRENT ERROR ===');
  lines.push(state.last_error);
  lines.push('');

  if (validation && !validation.valid) {
    lines.push('=== VALIDATION DETAILS ===');
    validation.errors.forEach((err) => lines.push(`  • ${err}`));
    lines.push('');
  }
  if (patterns.length > 0) {
    lines.push('=== ERROR PATTERNS DETECTED ===');
    patterns.forEach((pattern) => lines.push(`  ${pattern}`));
    lines.push('');
  }
  if (guidance.length > 0) {
    lines.push('=== SPECIFIC GUIDANCE ===');
    guidance.forEach((guide) => lines.push(`  ${guide}`));
    lines.push('');
  }
  if (schemaHints.length > 0) {
    lines.push('=== SCHEMA REQUIREMENTS ===');
    schemaHints.forEach((hint) => lines.push(`  • ${hint}`));
    lines.push('');
  }
  if (errorHistory.length > 1) {
    lines.push('=== PREVIOUS ATTEMPT SUMMARY ===');
    errorHistory.slice(0, -1).forEach((err, idx) => {
      const preview = err.substring(0, 80);
      lines.push(`  Attempt ${idx + 1}: ${preview}${err.length > 80 ? '...' : ''}`);
    });
    lines.push('');
  }

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
 * Result of `retryWithEnhancedFeedback`. The `sessionId` of the **final
 * accepted attempt** is exposed so the caller can locate provider-side
 * artifacts (e.g. the Phase 1 Stop hook's graph-tool-uses sidecar at
 * `~/.claude/projects/<slug>/<sessionId>.graph-tool-uses.json`).
 */
export interface RetryWithFeedbackResult<T> {
  data: T;
  sessionId: string | undefined;
}

/**
 * Enhanced retry wrapper with progressive feedback.
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
): Promise<RetryWithFeedbackResult<T>> {
  let retryState = initRetryState(config.maxAttempts);
  let validation: ValidationResult | null = null;
  let lastSessionId: string | undefined;

  while (shouldRetry(retryState)) {
    const feedbackPrompt = validation ? buildEnhancedFeedback(retryState, validation) : '';
    const attemptNumber = retryState.attempt + 1;

    try {
      if (retryState.attempt > 0) {
        logger.blank();
        logger.warn(
          `🔄 External retry attempt ${retryState.attempt}/${config.maxAttempts} starting...`,
        );
        logger.info(`Resuming session: ${lastSessionId} (FULL CONTEXT PRESERVED)`);
        if (retryState.last_error) logger.warn(`Previous error: ${retryState.last_error}`);
      }

      const { output, sessionId } = await agentInvoke(
        feedbackPrompt,
        retryState.attempt > 0 ? lastSessionId : undefined,
        attemptNumber,
      );
      lastSessionId = sessionId;

      validation = validator(output);

      if (validation.valid) {
        retryState = completeRetryState(retryState);
        if (retryState.attempt > 1) {
          logger.success(`✓ External retry succeeded after ${retryState.attempt} attempts`);
        }
        return { data: validation.data as T, sessionId: lastSessionId };
      }

      const errorMessage = validation.errors.join('; ');
      retryState = updateRetryState(retryState, errorMessage, config, output);

      if (diagnostics && lastSessionId) {
        await persistValidationFailure(
          diagnostics,
          lastSessionId,
          attemptNumber,
          output,
          validation,
        );
      }

      logger.error(`❌ Validation failed: ${errorMessage}`);

      if (shouldRetry(retryState)) {
        logger.info(
          `Retrying with enhanced feedback (${config.maxAttempts - retryState.attempt} attempts remaining)...`,
        );
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

export * from './retry.js';
