#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Validate Question Consolidation JSON Output
 *
 * This hook validates Phase 2 question consolidator agent output.
 * If validation fails, it blocks Claude from finishing and provides feedback
 * for the agent to retry internally.
 *
 * Works ONLY in Claude CLI mode. DeepAgents mode uses TypeScript validation.
 *
 * This file is synced to target project's .claude/hooks/ during initialization.
 */

import fs from 'fs';
import { z } from 'zod';
import { extractJSON } from '../../../../utils/validator.js';

// Question Consolidation schema
const ConsolidatedGapSchema = z.object({
  agent: z.string().min(1, 'Agent name is required'),
  item: z.string().min(1, 'Item name is required'),
  question: z.string().refine((q) => q.endsWith('?'), {
    message: 'Question must end with ?',
  }),
  reason: z.string().min(1, 'Reason is required'),
  priority: z.enum(['high', 'medium', 'low']),
  type: z.enum(['needs_verification', 'sparse_findings', 'missing_language_coverage']),
  consolidated_from: z.array(z.string()).min(1, 'Must have at least one source agent'),
  original_count: z.number().int().min(1, 'Original count must be at least 1'),
});

const ConsolidationMetadataSchema = z.object({
  original_gap_count: z.number().int().nonnegative(),
  consolidated_gap_count: z.number().int().nonnegative(),
  reduction_percentage: z.number().int().min(0).max(100),
  consolidation_groups: z.array(z.any()).optional(), // Flexible for groups structure
});

const ConsolidationOutputSchema = z.object({
  consolidated_gaps: z.array(ConsolidatedGapSchema).min(0, 'consolidated_gaps must be an array'),
  consolidation_metadata: ConsolidationMetadataSchema,
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
        '❌ HOOK ERROR: No transcript path provided\n\n' +
          'The validation hook requires a transcript to validate output.\n' +
          'This is a framework error, not an agent error.',
      );
    }

    if (!fs.existsSync(input.transcript_path)) {
      return blockWithFeedback(
        '❌ HOOK ERROR: Transcript file not found\n\n' +
          `Expected transcript at: ${input.transcript_path}\n` +
          'This is a framework error, not an agent error.',
      );
    }

    const transcriptContent = fs.readFileSync(input.transcript_path, 'utf-8');
    const lines = transcriptContent.split('\n').filter((line) => line.trim());

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
        return msg.type === 'assistant' || (msg.message && msg.message.role === 'assistant');
      })
      .reverse();

    if (assistantMessages.length === 0) {
      return blockWithFeedback(
        '❌ HOOK ERROR: No assistant messages found in transcript\n\n' +
          "The agent hasn't produced any output yet.\n" +
          'This is unexpected - the hook should only run after agent output.',
      );
    }

    const lastMessage = assistantMessages[0];

    // Get content from either direct format or wrapped format
    const messageContent = lastMessage.message ? lastMessage.message.content : lastMessage.content;

    if (!messageContent || !Array.isArray(messageContent)) {
      return blockWithFeedback(
        '❌ HOOK ERROR: Last message has invalid content structure\n\n' +
          'Expected an array of content blocks.\n' +
          'This is a framework error, not an agent error.',
      );
    }

    const textBlocks = messageContent.filter((c: any) => c.type === 'text');

    if (textBlocks.length === 0) {
      return blockWithFeedback(
        '❌ OUTPUT ERROR: No text content in response\n\n' +
          "Your response doesn't contain any text output.\n" +
          'You must output JSON in the required format.',
      );
    }

    const text = textBlocks.map((t: any) => t.text).join('\n');

    const jsonString = extractJSON(text);

    if (!jsonString) {
      return blockWithFeedback(
        '❌ No JSON object found in your response.\n\n' +
          'REQUIRED FORMAT:\n' +
          '  1. Output ONLY raw JSON (no explanatory text)\n' +
          '  2. First character must be { and last character must be }\n' +
          '  3. Do NOT wrap in markdown code blocks (no ```json)\n' +
          '  4. Do NOT add any text before or after the JSON\n\n' +
          'Expected structure:\n' +
          '{\n' +
          '  "consolidated_gaps": [\n' +
          '    {\n' +
          '      "agent": "agent-name",\n' +
          '      "item": "Topic name",\n' +
          '      "question": "Question ending with ?",\n' +
          '      "reason": "Context",\n' +
          '      "priority": "high|medium|low",\n' +
          '      "type": "needs_verification|sparse_findings|missing_language_coverage",\n' +
          '      "consolidated_from": ["agent1", "agent2"],\n' +
          '      "original_count": 2\n' +
          '    }\n' +
          '  ],\n' +
          '  "consolidation_metadata": {\n' +
          '    "original_gap_count": 5,\n' +
          '    "consolidated_gap_count": 3,\n' +
          '    "reduction_percentage": 40,\n' +
          '    "consolidation_groups": []\n' +
          '  }\n' +
          '}\n\n' +
          'Please output the corrected JSON now.',
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
      return blockWithFeedback(
        `❌ JSON parsing failed: ${errorMsg}\n\n` +
          'COMMON JSON SYNTAX ERRORS:\n' +
          '  1. Missing or extra commas between fields\n' +
          '  2. Unclosed braces { } or brackets [ ]\n' +
          '  3. Unquoted strings (all keys and values must use double quotes "")\n' +
          '  4. Trailing commas in objects or arrays (not allowed in JSON)\n' +
          '  5. Single quotes instead of double quotes\n\n' +
          'TIP: Copy your JSON to a validator (jsonlint.com) or check the exact error above.\n\n' +
          'Please fix these syntax errors and output valid JSON.',
      );
    }

    // Auto-unwrap if wrapped in analyzer schema
    let parsed = data as any;
    if (parsed.findings && typeof parsed.findings === 'object') {
      parsed = parsed.findings;
    }

    // Auto-wrap if bare array
    if (Array.isArray(parsed)) {
      parsed = {
        consolidated_gaps: parsed,
        consolidation_metadata: {
          original_gap_count: 0, // Will be filled by orchestrator
          consolidated_gap_count: parsed.length,
          reduction_percentage: 0,
          consolidation_groups: [],
        },
      };
    }

    // Auto-remap if wrong key name
    if (!parsed.consolidated_gaps && !Array.isArray(parsed)) {
      const arrayKey = Object.keys(parsed).find(
        (k) => Array.isArray(parsed[k]) && k !== 'consolidation_groups',
      );
      if (arrayKey) {
        parsed.consolidated_gaps = parsed[arrayKey];
      }
    }

    const result = ConsolidationOutputSchema.safeParse(parsed);

    if (!result.success) {
      const errors = result.error.issues
        .map((err, index) => {
          const pathStr = err.path.length > 0 ? `${err.path.join('.')}` : 'root';
          let errorMsg = `  ${index + 1}. Field "${pathStr}": ${err.message}`;

          // Add specific guidance for common errors
          if (pathStr === 'consolidated_gaps' && err.code === 'invalid_type') {
            errorMsg += `\n     → The "consolidated_gaps" field MUST be an array of gap objects`;
            errorMsg += `\n     → Check that you have: "consolidated_gaps": [...]`;
          }

          if (pathStr.includes('question') && err.message.includes('?')) {
            errorMsg += `\n     → Questions MUST end with a question mark (?)`;
          }

          if (pathStr === 'consolidation_metadata') {
            errorMsg += `\n     → Missing required metadata object`;
            errorMsg += `\n     → Include: "consolidation_metadata": { original_gap_count: X, consolidated_gap_count: Y, reduction_percentage: Z, consolidation_groups: [] }`;
          }

          return errorMsg;
        })
        .join('\n');

      return blockWithFeedback(
        `❌ Schema validation failed. Fix these issues:\n\n${errors}\n\n` +
          'REQUIRED JSON STRUCTURE:\n' +
          '{\n' +
          '  "consolidated_gaps": [\n' +
          '    {\n' +
          '      "agent": "agent-name",                    // REQUIRED: Source agent name\n' +
          '      "item": "Short topic name",               // REQUIRED: Brief identifier\n' +
          '      "question": "Question ending with ?",     // REQUIRED: Must end with ?\n' +
          '      "reason": "Context explanation",          // REQUIRED: Why verification needed\n' +
          '      "priority": "high|medium|low",            // REQUIRED: One of these values\n' +
          '      "type": "needs_verification|sparse_findings|missing_language_coverage", // REQUIRED\n' +
          '      "consolidated_from": ["agent1", ...],     // REQUIRED: Array of source agents\n' +
          '      "original_count": 2                       // REQUIRED: Number of gaps merged\n' +
          '    }\n' +
          '  ],\n' +
          '  "consolidation_metadata": {                   // REQUIRED: Top-level metadata\n' +
          '    "original_gap_count": 5,                    // REQUIRED: Original number\n' +
          '    "consolidated_gap_count": 3,                // REQUIRED: Final number\n' +
          '    "reduction_percentage": 40,                 // REQUIRED: 0-100\n' +
          '    "consolidation_groups": []                  // REQUIRED: Can be empty array\n' +
          '  }\n' +
          '}\n\n' +
          'CRITICAL REMINDERS:\n' +
          '  1. ALL questions must end with ?\n' +
          '  2. consolidated_gaps is an ARRAY at the TOP LEVEL\n' +
          '  3. consolidation_metadata is an OBJECT at the TOP LEVEL\n' +
          "  4. Do NOT nest these under 'findings' or any other key\n" +
          '  5. Every gap must have ALL 8 required fields\n\n' +
          'Please output the corrected JSON with the exact structure shown above.',
      );
    }

    return allow();
  } catch (error) {
    // CRITICAL: On hook error, BLOCK (fail-safe) - don't allow potentially bad output
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return blockWithFeedback(
      `❌ HOOK CRASHED: ${errorMsg}\n\n` +
        'The validation hook encountered an unexpected error.\n' +
        'This is a framework error. The output cannot be validated.\n\n' +
        'Please report this issue if it persists.',
    );
  }
}

main();
