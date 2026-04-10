/**
 * Shared Hook Utilities for Initialize-Project Workflow
 *
 * Common functions used across all validation hooks to eliminate code duplication.
 */

import fs from 'fs';

/**
 * Hook input interface (used by Phase 2 and Phase 3 hooks)
 */
export interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

/**
 * Block Claude from finishing with feedback
 * Exit code 2 signals blocking to Claude CLI (exit 1 is just an error, not a block!)
 */
export function blockWithFeedback(reason: string): never {
  console.error(reason); // Print feedback to stderr for Claude CLI to show
  process.exit(2); // Exit code 2 = BLOCK agent from completing
}

/**
 * Allow Claude to finish
 */
export function allow(): never {
  process.exit(0);
}

/**
 * Read and parse transcript file from HookInput
 * @returns Parsed transcript messages
 */
export function readTranscript(input: HookInput): any[] {
  // Validate transcript path
  if (!input.transcript_path) {
    blockWithFeedback(
      '❌ HOOK ERROR: No transcript path provided\n\n' +
        'The validation hook requires a transcript to validate output.\n' +
        'This is a framework error, not an agent error.',
    );
  }

  if (!fs.existsSync(input.transcript_path)) {
    blockWithFeedback(
      '❌ HOOK ERROR: Transcript file not found\n\n' +
        `Expected transcript at: ${input.transcript_path}\n` +
        'This is a framework error, not an agent error.',
    );
  }

  // Read and parse JSONL transcript
  const transcriptContent = fs.readFileSync(input.transcript_path, 'utf-8');
  const lines = transcriptContent.split('\n').filter((line: string) => line.trim());

  const transcript = lines
    .map((line: string) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);

  return transcript;
}

/**
 * Extract the last assistant message from transcript
 * @returns Text content from the last assistant message
 */
export function getLastAssistantMessage(transcript: any[]): string {
  const assistantMessages = transcript
    .filter((msg: any) => {
      // Support both formats: direct (msg.type === "assistant") and wrapped (msg.message.role === "assistant")
      return msg.type === 'assistant' || (msg.message && msg.message.role === 'assistant');
    })
    .reverse();

  if (assistantMessages.length === 0) {
    blockWithFeedback(
      '❌ HOOK ERROR: No assistant messages found in transcript\n\n' +
        "The agent hasn't produced any output yet.\n" +
        'This is unexpected - the hook should only run after agent output.',
    );
  }

  const lastMessage = assistantMessages[0];

  // Get content from either direct format or wrapped format
  const messageContent = lastMessage.message ? lastMessage.message.content : lastMessage.content;

  if (!messageContent || !Array.isArray(messageContent)) {
    blockWithFeedback(
      '❌ HOOK ERROR: Last message has invalid content structure\n\n' +
        'Expected an array of content blocks.\n' +
        'This is a framework error, not an agent error.',
    );
  }

  const textBlocks = messageContent.filter((c: any) => c.type === 'text');

  if (textBlocks.length === 0) {
    blockWithFeedback(
      '❌ OUTPUT ERROR: No text content in response\n\n' +
        "Your response doesn't contain any text output.\n" +
        'You must provide the required output format.',
    );
  }

  return textBlocks.map((t: any) => t.text).join('\n');
}

/**
 * Common JSON parsing error message
 */
export const JSON_PARSING_ERROR_GUIDANCE = `COMMON JSON SYNTAX ERRORS:
  1. Missing or extra commas between fields
  2. Unclosed braces { } or brackets [ ]
  3. Unquoted strings (all keys and values must use double quotes "")
  4. Trailing commas in objects or arrays (not allowed in JSON)
  5. Single quotes instead of double quotes

TIP: Copy your JSON to a validator (jsonlint.com) or check the exact error above.

Please fix these syntax errors and output valid JSON.`;

/**
 * Format JSON parsing error with guidance
 */
export function formatJSONParsingError(parseError: unknown): string {
  const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
  return `❌ JSON parsing failed: ${errorMsg}\n\n${JSON_PARSING_ERROR_GUIDANCE}`;
}

/**
 * Wrap hook main function with fail-safe error handling
 * If hook crashes, block (fail-safe) - don't allow potentially bad output
 */
export function wrapHookMain(mainFn: () => Promise<void>): void {
  mainFn().catch((error) => {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    blockWithFeedback(
      `❌ HOOK CRASHED: ${errorMsg}\n\n` +
        'The validation hook encountered an unexpected error.\n' +
        'This is a framework error. The output cannot be validated.\n\n' +
        'Please report this issue if it persists.',
    );
  });
}
