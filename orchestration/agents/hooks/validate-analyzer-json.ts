#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Validate Analyzer JSON Output
 *
 * This hook validates Phase 1 analyzer agent output against Zod schema.
 * If validation fails, it blocks Claude from finishing and provides feedback
 * for the agent to retry internally.
 *
 * Works ONLY in Claude CLI mode. DeepAgents mode uses TypeScript validation.
 *
 * This file is synced to target project's .claude/hooks/ during initialization.
 */

import fs from "fs";
// Import schema from single source of truth (orchestration/src/state/schemas/)
import { AnalyzerOutputSchema } from "../../src/state/schemas/initialize-project.schema.js";
import { extractJSON } from "../../src/utils/validator.js";

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
          '  "agent_name": "structure-architecture-analyzer",\n' +
          '  "timestamp": "2026-03-26T10:30:00.000Z",\n' +
          '  "findings": { "architecture": "...", ... },\n' +
          '  "needs_verification": ["question 1", ...] // optional, max 5\n' +
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

    const result = AnalyzerOutputSchema.safeParse(data);

    if (!result.success) {
      // Enhanced error messages with specific guidance
      const errors = result.error.issues
        .map((err, index) => {
          const pathStr =
            err.path.length > 0 ? `${err.path.join(".")}` : "root";
          let errorMsg = `  ${index + 1}. Field "${pathStr}": ${err.message}`;

          // Add specific guidance for common errors
          if (err.code === "too_big" && pathStr === "needs_verification") {
            const actual = (err as any).actual || "unknown";
            const max = (err as any).maximum || 5;
            errorMsg += `\n     → You provided ${actual} items, but the maximum is ${max}`;
            errorMsg += `\n     → Remove ${actual - max} item(s) from needs_verification array`;
            errorMsg += `\n     → Keep only the MOST IMPORTANT questions that cannot be determined from code`;
          }

          return errorMsg;
        })
        .join("\n");

      return blockWithFeedback(
        `❌ Schema validation failed. Fix these issues:\n\n${errors}\n\n` +
          "REQUIRED JSON STRUCTURE:\n" +
          "{\n" +
          '  "agent_name": "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer",\n' +
          '  "timestamp": "2026-03-26T10:30:00.000Z", // ISO 8601 format\n' +
          '  "findings": { /* your analysis findings here */ },\n' +
          '  "needs_verification": ["question 1", "question 2"], // OPTIONAL, MAXIMUM 5 ITEMS\n' +
          '  "confidence_level": "high" | "medium" | "low" // OPTIONAL\n' +
          "}\n\n" +
          "IMPORTANT:\n" +
          "  - agent_name must exactly match one of the 4 analyzer names above\n" +
          "  - timestamp must be valid ISO 8601 format\n" +
          "  - findings can contain any structure (flexible)\n" +
          "  - ⚠️  needs_verification MAXIMUM 5 ITEMS - prioritize the most critical unknowns\n\n" +
          "Please output the corrected JSON with all required fields.",
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
