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

import { z } from "zod";
import fs from "fs";

const AnalyzerOutputSchema = z.object({
  agent_name: z.enum([
    "structure-architecture-analyzer",
    "tech-stack-dependencies-analyzer",
    "code-patterns-testing-analyzer",
    "data-flows-integrations-analyzer",
  ]),
  timestamp: z.string(),
  findings: z.any(), // Flexible structure (Zod v4.3.6 compatible)
  needs_verification: z.array(z.string()).max(20).optional(),
  confidence_level: z.enum(["high", "medium", "low"]).optional(),
});

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

/**
 * Extract JSON from agent output (handle markdown wrapping)
 */
function extractJSON(text: string): string | null {
  // Remove markdown code blocks
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/, "");
  cleaned = cleaned.replace(/\s*```$/, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    return null;
  }

  return cleaned.substring(start, end + 1);
}

/**
 * Block Claude from finishing with feedback
 */
function blockWithFeedback(reason: string): void {
  console.log(
    JSON.stringify({
      decision: "block",
      reason: reason,
    }),
  );
  process.exit(0);
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
        "No JSON object found in your response.\n\n" +
          "Remember: Output ONLY raw JSON starting with { and ending with }.\n" +
          "- Do NOT wrap in markdown code blocks (```json)\n" +
          "- Do NOT add explanatory text before or after the JSON\n" +
          "- The FIRST character must be { and the LAST must be }\n\n" +
          "Please correct this and output the JSON again.",
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      return blockWithFeedback(
        `JSON parsing failed: ${parseError instanceof Error ? parseError.message : "Unknown error"}\n\n` +
          "Your JSON has syntax errors. Check for:\n" +
          "- Missing or extra commas\n" +
          "- Unclosed braces { } or brackets [ ]\n" +
          "- Unquoted strings (all keys and string values must use double quotes)\n" +
          "- Trailing commas in objects or arrays\n\n" +
          "Please fix these errors and output valid JSON.",
      );
    }

    const result = AnalyzerOutputSchema.safeParse(data);

    if (!result.success) {
      const errors = result.error.issues
        .map((err) => {
          const pathStr =
            err.path.length > 0 ? `${err.path.join(".")}` : "root";
          return `  - ${pathStr}: ${err.message}`;
        })
        .join("\n");

      return blockWithFeedback(
        `Schema validation failed. Your JSON is missing required fields or has incorrect types:\n\n${errors}\n\n` +
          "Required structure:\n" +
          "{\n" +
          '  "agent_name": "your-analyzer-name",\n' +
          '  "timestamp": "ISO 8601 timestamp (e.g., 2026-03-19T00:00:00.000Z)",\n' +
          '  "findings": { ... your analysis ... },\n' +
          '  "needs_verification": [] // optional, max 3 items\n' +
          "}\n\n" +
          "Please correct these issues and output the fixed JSON.",
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
