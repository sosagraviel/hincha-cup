import { randomUUID } from "crypto";
import type { RetryState } from "../state/schemas/initialize-project.schema.js";

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate next delay using exponential backoff with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs,
  );

  if (config.jitter) {
    return Math.floor(baseDelay * (0.5 + Math.random() * 0.5));
  }

  return baseDelay;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function initRetryState(
  maxAttempts: number = DEFAULT_RETRY_CONFIG.maxAttempts,
): RetryState {
  return {
    attempt: 0,
    max_attempts: maxAttempts,
    error_history: [],
    output_history: [], // Initialize output history for context preservation
    started_at: new Date().toISOString(),
    session_id: randomUUID(),
  };
}

/**
 * Update retry state after failed attempt
 */
export function updateRetryState(
  state: RetryState,
  error: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  failedOutput?: string,
): RetryState {
  const nextAttempt = state.attempt + 1;
  const errorHistory = [...state.error_history, error].slice(-3); // Keep last 3 errors

  // Store failed output for context preservation in next attempt
  const outputHistory = failedOutput
    ? [...(state.output_history || []), failedOutput].slice(-2) // Keep last 2 outputs
    : state.output_history || [];

  return {
    ...state,
    attempt: nextAttempt,
    last_error: error,
    error_history: errorHistory,
    last_output: failedOutput,
    output_history: outputHistory,
    next_delay_ms: calculateBackoffDelay(nextAttempt, config),
  };
}

export function completeRetryState(state: RetryState): RetryState {
  return {
    ...state,
    completed_at: new Date().toISOString(),
    last_error: undefined,
    next_delay_ms: undefined,
  };
}

export function shouldRetry(state: RetryState): boolean {
  return state.attempt < state.max_attempts;
}

/**
 * Build error feedback prompt from retry state
 */
export function buildErrorFeedback(state: RetryState): string {
  if (!state.last_error) {
    return "";
  }

  const lines = [
    "",
    `⚠️  PREVIOUS ATTEMPT FAILED (Attempt ${state.attempt}/${state.max_attempts})`,
    "",
    "=== ERROR FROM LAST ATTEMPT ===",
    state.last_error,
    "",
  ];

  if (state.error_history.length > 1) {
    lines.push("=== PREVIOUS ERRORS ===");
    state.error_history.slice(0, -1).forEach((err, idx) => {
      lines.push(`Attempt ${idx + 1}: ${err}`);
    });
    lines.push("");
  }

  lines.push("=== INSTRUCTIONS ===");
  lines.push("Please fix the issues identified above and try again.");
  lines.push("Pay special attention to:");
  lines.push("1. JSON format must be valid");
  lines.push("2. All required fields must be present");
  lines.push("3. Follow the schema exactly");
  lines.push("");

  return lines.join("\n");
}
