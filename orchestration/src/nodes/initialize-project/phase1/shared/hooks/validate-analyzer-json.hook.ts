#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Validate Analyzer JSON Output
 *
 * This hook validates Phase 1 analyzer agent output against Zod schema.
 * If validation fails, it blocks Claude from finishing and provides feedback
 * for the agent to retry internally.
 *
 * Works ONLY in Claude CLI mode. DeepAgents mode uses TypeScript validation.
 */

import fs from "fs";
// Import centralized validator from Phase 0 schema registry
import { validateAgentOutput } from "../../../../../schemas/phase1-agent-outputs.schema.js";
import { extractJSON } from "../../../../../utils/validator.js";

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
    // Claude CLI passes agent output directly to Stop hooks via stdin
    const stdinBuffer = fs.readFileSync(0, "utf-8").trim();

    if (!stdinBuffer) {
      return blockWithFeedback(
        "❌ OUTPUT ERROR: No output received\n\n" +
        "Your response is empty.\n" +
        "You must output JSON in the required format."
      );
    }

    // Extract JSON from the output (handles markdown code blocks, explanatory text, etc.)
    const jsonString = extractJSON(stdinBuffer);

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
          '  "timestamp": "2026-04-02T10:30:00.000Z",\n' +
          '  "findings": { /* your analysis data */ },\n' +
          '  "needs_verification": [] // Maximum 5 items\n' +
          "}\n\n" +
          "Please output the corrected JSON now.",
      );
    }

    // Parse the JSON
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

    // Validate against schema
    const result = validateAgentOutput(data);

    if (!result.success) {
      // Enhanced error messages with specific guidance
      const agentInfo = result.agentName ? ` for agent "${result.agentName}"` : "";
      const errors = result.errors
        ? result.errors.issues
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
            .join("\n")
        : "Unknown validation error";

      return blockWithFeedback(
        `❌ Schema validation failed${agentInfo}. Fix these issues:\n\n${errors}\n\n` +
          "REQUIRED JSON STRUCTURE:\n" +
          "{\n" +
          '  "agent_name": "structure-architecture-analyzer" | "tech-stack-dependencies-analyzer" | "code-patterns-testing-analyzer" | "data-flows-integrations-analyzer",\n' +
          '  "timestamp": "2026-04-02T10:30:00.000Z", // ISO 8601 format\n' +
          '  "findings": {\n' +
          '    "services": [ /* REQUIRED: Array of discovered services */ ],\n' +
          '    // Additional fields specific to each analyzer\n' +
          '  },\n' +
          '  "needs_verification": [\n' +
          '    { "id": "v1", "question": "Clear question?", "reason": "context" }\n' +
          '  ] // OPTIONAL, MAXIMUM 5 ITEMS\n' +
          "}\n\n" +
          "IMPORTANT:\n" +
          "  - agent_name must exactly match one of the 4 analyzer names above\n" +
          "  - timestamp must be valid ISO 8601 format\n" +
          "  - findings.services array is REQUIRED (at least 1 service)\n" +
          "  - Each service must have an 'id' field\n" +
          "  - ⚠️  needs_verification MAXIMUM 5 ITEMS - prioritize the most critical unknowns\n\n" +
          "Please output the corrected JSON with all required fields.",
      );
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
