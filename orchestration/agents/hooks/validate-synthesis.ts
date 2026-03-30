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
import { validateSynthesisOutput } from "../../src/utils/synthesis-validator.js";

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

/**
 * Block Claude from finishing with feedback
 * Exit code 1 signals validation failure to Claude CLI
 */
function blockWithFeedback(reason: string): void {
  console.error(reason); // Print feedback to stderr for Claude CLI to show
  process.exit(1); // Exit code 1 = validation failed
}

/**
 * Allow Claude to finish
 */
function allow(): void {
  process.exit(0);
}

async function main() {
  try {
    const stdinBuffer = fs.readFileSync(0, "utf-8");
    const input: HookInput = JSON.parse(stdinBuffer);

    if (input.stop_hook_active === true) {
      return allow();
    }

    if (!input.transcript_path || !fs.existsSync(input.transcript_path)) {
      return allow();
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
      .filter((msg: any) => msg.type === "assistant")
      .reverse();

    if (assistantMessages.length === 0) {
      return allow();
    }

    const lastMessage = assistantMessages[0];

    if (!lastMessage.content || !Array.isArray(lastMessage.content)) {
      return allow();
    }

    const textBlocks = lastMessage.content.filter(
      (c: any) => c.type === "text",
    );
    if (textBlocks.length === 0) {
      return allow();
    }

    const text = textBlocks.map((t: any) => t.text).join("\n");

    // Use comprehensive validator (same as external validator in synthesis.node.ts)
    const validation = validateSynthesisOutput(text);

    if (!validation.valid) {
      return blockWithFeedback(validation.errors.join('\n'));
    }

    return allow();
  } catch (error) {
    console.error(
      `Hook error: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return allow();
  }
}

main();
