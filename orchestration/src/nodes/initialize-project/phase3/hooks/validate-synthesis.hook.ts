#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Validate Synthesis Markdown Output
 *
 * This hook validates Phase 3 synthesis agent output (markdown format).
 * If validation fails, it blocks Claude from finishing and provides feedback
 * for the agent to retry internally.
 *
 * Works ONLY in Claude CLI mode. DeepAgents mode uses TypeScript validation.
 *
 * This file is synced to target project's .claude/hooks/ during initialization.
 */

import fs from "fs";
import { validateSynthesisOutput } from "../validators/index.js";

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

/**
 * Block Claude from finishing with feedback
 * Exit code 2 signals blocking to Claude CLI (exit 1 is just an error, not a block!)
 */
function blockWithFeedback(reason: string): void {
  console.error(reason); // Print feedback to stderr for Claude CLI to show
  process.exit(2); // Exit code 2 = BLOCK agent from completing
}

/**
 * Allow Claude to finish
 */
function allow(): void {
  process.exit(0);
}

/**
 * Read stdin using async iterator (production-ready, handles non-blocking pipes)
 * Solves EAGAIN errors that occur with fs.readFileSync(0) on non-blocking stdin
 */
async function readStdinAsync(): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return chunks.join('');
}

async function main() {
  try {
    // Read stdin to get hook input metadata (production-ready async method)
    const stdinBuffer = await readStdinAsync();
    const input: HookInput = JSON.parse(stdinBuffer);

    // Allow if stop hook is explicitly active (legacy/testing mode)
    if (input.stop_hook_active === true) {
      return allow();
    }

    // Require transcript for validation
    if (!input.transcript_path) {
      return blockWithFeedback(
        "❌ HOOK ERROR: No transcript path provided\n\n" +
        "The validation hook requires a transcript to validate output.\n" +
        "This is a framework error, not an agent error."
      );
    }

    if (!fs.existsSync(input.transcript_path)) {
      return blockWithFeedback(
        "❌ HOOK ERROR: Transcript file not found\n\n" +
        `Expected transcript at: ${input.transcript_path}\n` +
        "This is a framework error, not an agent error."
      );
    }

    const transcriptContent = fs.readFileSync(input.transcript_path, "utf-8");
    const lines = transcriptContent.split("\n").filter((line: string) => line.trim());

    const transcript = lines
      .map((line: string) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    const assistantMessages = transcript
      .filter((msg: any) => {
        // Support both formats: direct (msg.type === "assistant") and wrapped (msg.message.role === "assistant")
        return msg.type === "assistant" || (msg.message && msg.message.role === "assistant");
      })
      .reverse();

    if (assistantMessages.length === 0) {
      return blockWithFeedback(
        "❌ HOOK ERROR: No assistant messages found in transcript\n\n" +
        "The agent hasn't produced any output yet.\n" +
        "This is unexpected - the hook should only run after agent output."
      );
    }

    const lastMessage = assistantMessages[0];

    // Get content from either direct format or wrapped format
    const messageContent = lastMessage.message ? lastMessage.message.content : lastMessage.content;

    if (!messageContent || !Array.isArray(messageContent)) {
      return blockWithFeedback(
        "❌ HOOK ERROR: Last message has invalid content structure\n\n" +
        "Expected an array of content blocks.\n" +
        "This is a framework error, not an agent error."
      );
    }

    const textBlocks = messageContent.filter(
      (c: any) => c.type === "text",
    );

    if (textBlocks.length === 0) {
      return blockWithFeedback(
        "❌ OUTPUT ERROR: No text content in response\n\n" +
        "Your response doesn't contain any text output.\n" +
        "You must output markdown content starting with:\n" +
        "# CLAUDE.md Content"
      );
    }

    const text = textBlocks.map((t: any) => t.text).join("\n");

    // Use comprehensive validator (same as external validator in synthesis.node.ts)
    const validation = validateSynthesisOutput(text);

    if (!validation.valid) {
      return blockWithFeedback(validation.errors.join('\n'));
    }

    return allow();
  } catch (error) {
    // CRITICAL: On hook error, BLOCK (fail-safe) - don't allow potentially bad output
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return blockWithFeedback(
      `❌ HOOK CRASHED: ${errorMsg}\n\n` +
      "The validation hook encountered an unexpected error.\n" +
      "This is a framework error. The output cannot be validated.\n\n" +
      "Please report this issue if it persists."
    );
  }
}

main();
