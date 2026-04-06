#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Validate Question Consolidator JSON Output
 *
 * This hook validates Phase 4 question consolidator agent output against Zod schema.
 * If validation fails, it blocks Claude from finishing and provides feedback
 * for the agent to retry internally.
 *
 * Works ONLY in Claude CLI mode. DeepAgents mode uses TypeScript validation.
 *
 * This file is synced to target project's .claude/hooks/ during initialization.
 */

import { z } from "zod";
import fs from "fs";
import { extractJSON } from "../../../../utils/validator.js";

// Extraction schema (matches orchestration/src/nodes/phase4/context-generation.node.ts)
const ExtractionSchema = z.object({
  claude_md: z.string().min(100, "CLAUDE.md content too short"),
  project_context_md: z
    .string()
    .min(100, "project-context/SKILL.md content too short"),
});

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
    const lines = transcriptContent.split("\n").filter((line) => line.trim());

    const transcript = lines
      .map((line) => {
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
      return allow();
    }

    const lastMessage = assistantMessages[0];

    // Get content from either direct format or wrapped format
    const messageContent = lastMessage.message ? lastMessage.message.content : lastMessage.content;

    if (!messageContent || !Array.isArray(messageContent)) {
      return allow();
    }

    const textBlocks = messageContent.filter(
      (c: any) => c.type === "text",
    );
    if (textBlocks.length === 0) {
      return allow();
    }

    const text = textBlocks.map((t: any) => t.text).join("\n");

    const jsonString = extractJSON(text);

    if (!jsonString) {
      return blockWithFeedback(
        "❌ No JSON object found in your response.\n\n" +
          "REQUIRED FORMAT:\n" +
          "  1. Output ONLY raw JSON (no explanatory text)\n" +
          "  2. First character must be { and last character must be }\n" +
          "  3. Do NOT wrap in markdown code blocks (no ```json)\n" +
          "  4. Do NOT add any text before or after the JSON\n\n" +
          "Expected structure:\n" +
          "{\n" +
          '  "claude_md": "... CLAUDE.md content (min 100 chars) ...",\n' +
          '  "project_context_md": "... project-context/SKILL.md content (min 100 chars) ..."\n' +
          "}\n\n" +
          "Please output the corrected JSON now.",
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : "Unknown error";
      return blockWithFeedback(
        `❌ JSON parsing failed: ${errorMsg}\n\n` +
          "COMMON JSON SYNTAX ERRORS:\n" +
          "  1. Missing or extra commas between fields\n" +
          "  2. Unclosed braces { } or brackets [ ]\n" +
          "  3. Unquoted strings (all keys and values must use double quotes \"\")\n" +
          "  4. Trailing commas in objects or arrays (not allowed in JSON)\n" +
          "  5. Single quotes instead of double quotes\n\n" +
          "TIP: Copy your JSON to a validator (jsonlint.com) or check the exact error above.\n\n" +
          "Please fix these syntax errors and output valid JSON.",
      );
    }

    const result = ExtractionSchema.safeParse(data);

    if (!result.success) {
      const errors = (result.error as any).errors
        .map((err: any, index: number) => {
          const pathStr =
            err.path.length > 0 ? `${err.path.join(".")}` : "root";
          return `  ${index + 1}. Field "${pathStr}": ${err.message}`;
        })
        .join("\n");

      return blockWithFeedback(
        `❌ Schema validation failed. Fix these issues:\n\n${errors}\n\n` +
          "REQUIRED JSON STRUCTURE:\n" +
          "{\n" +
          '  "claude_md": "... CLAUDE.md content here ...",\n' +
          '  "project_context_md": "... project-context/SKILL.md content here ..."\n' +
          "}\n\n" +
          "IMPORTANT:\n" +
          "  - Both fields are REQUIRED\n" +
          "  - claude_md must be at least 100 characters\n" +
          "  - project_context_md must be at least 100 characters\n" +
          "  - Content should be valid markdown text\n\n" +
          "Please output the corrected JSON with both required fields populated.",
      );
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
