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

import { z } from 'zod';
import fs from 'fs';

// Extraction schema (matches orchestration/src/nodes/phase4/context-generation.node.ts)
const ExtractionSchema = z.object({
  claude_md: z.string().min(100, 'CLAUDE.md content too short'),
  project_context_md: z.string().min(100, 'project-context/SKILL.md content too short')
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
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/, '');
  cleaned = cleaned.replace(/\s*```$/, '');

  // Find JSON object bounds
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1) {
    return null;
  }

  return cleaned.substring(start, end + 1);
}

/**
 * Block Claude from finishing with feedback
 */
function blockWithFeedback(reason: string): void {
  console.log(JSON.stringify({
    decision: 'block',
    reason: reason
  }));
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
    // Read hook input from stdin
    const stdinBuffer = fs.readFileSync(0, 'utf-8');
    const input: HookInput = JSON.parse(stdinBuffer);

    // Prevent infinite loops - allow if stop hook already ran
    if (input.stop_hook_active === true) {
      return allow();
    }

    // Validate we have transcript path
    if (!input.transcript_path || !fs.existsSync(input.transcript_path)) {
      // Can't validate without transcript, allow
      return allow();
    }

    // Read transcript (JSONL format: one JSON object per line)
    const transcriptContent = fs.readFileSync(input.transcript_path, 'utf-8');
    const lines = transcriptContent.split('\n').filter(line => line.trim());

    const transcript = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    // Find last assistant message
    const assistantMessages = transcript
      .filter((msg: any) => msg.type === 'assistant')
      .reverse();

    if (assistantMessages.length === 0) {
      return allow(); // No assistant messages yet
    }

    const lastMessage = assistantMessages[0];

    if (!lastMessage.content || !Array.isArray(lastMessage.content)) {
      return allow();
    }

    // Extract text content from last message
    const textBlocks = lastMessage.content.filter((c: any) => c.type === 'text');
    if (textBlocks.length === 0) {
      return allow();
    }

    const text = textBlocks.map((t: any) => t.text).join('\n');

    // Try to extract JSON
    const jsonString = extractJSON(text);

    if (!jsonString) {
      return blockWithFeedback(
        'No JSON object found in your response.\n\n' +
        'Remember: Output ONLY raw JSON starting with { and ending with }.\n' +
        '- Do NOT wrap in markdown code blocks (```json)\n' +
        '- Do NOT add explanatory text before or after the JSON\n' +
        '- The FIRST character must be { and the LAST must be }\n\n' +
        'Please correct this and output the JSON again.'
      );
    }

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      return blockWithFeedback(
        `JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}\n\n` +
        'Your JSON has syntax errors. Check for:\n' +
        '- Missing or extra commas\n' +
        '- Unclosed braces { } or brackets [ ]\n' +
        '- Unquoted strings (all keys and string values must use double quotes)\n' +
        '- Trailing commas in objects or arrays\n\n' +
        'Please fix these errors and output valid JSON.'
      );
    }

    // Validate against Zod schema
    const result = ExtractionSchema.safeParse(data);

    if (!result.success) {
      // Format Zod errors for user-friendly feedback
      const errors = (result.error as any).errors.map((err: any) => {
        const pathStr = err.path.length > 0 ? `${err.path.join('.')}` : 'root';
        return `  - ${pathStr}: ${err.message}`;
      }).join('\n');

      return blockWithFeedback(
        `Schema validation failed. Your JSON is missing required fields or has incorrect types:\n\n${errors}\n\n` +
        'Required structure:\n' +
        '{\n' +
        '  "claude_md": "... content for CLAUDE.md (min 100 chars) ...",\n' +
        '  "project_context_md": "... content for project-context/SKILL.md (min 100 chars) ..."\n' +
        '}\n\n' +
        'Please correct these issues and output the fixed JSON.'
      );
    }

    // Validation passed! Allow Claude to finish
    return allow();

  } catch (error) {
    // Don't block on hook errors - allow Claude to finish
    console.error(`Hook error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return allow();
  }
}

main();
