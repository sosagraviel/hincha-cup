#!/usr/bin/env node
/**
 * Claude Code Stop Hook entry-point for wiki-generator output validation.
 *
 * Thin wrapper: reads the agent's transcript from the hook input, extracts
 * the last assistant message, and runs `validateWikiOutput()`. On any
 * violation, exits 2 with stderr feedback so Claude CLI blocks the agent's
 * Stop and the agent has to re-emit a corrected response.
 *
 * Stack-agnostic: every check operates on the agent's text output only.
 */

import fs from 'fs';
import { validateWikiOutput } from './wiki-output-validator.js';

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

function blockWithFeedback(reason: string): never {
  console.error(reason);
  process.exit(2);
}

function allow(): never {
  process.exit(0);
}

async function readStdinAsync(): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

async function main(): Promise<void> {
  let input: HookInput;
  try {
    const stdin = await readStdinAsync();
    input = JSON.parse(stdin) as HookInput;
  } catch (err) {
    return blockWithFeedback(
      '❌ HOOK ERROR: failed to parse hook input as JSON.\n\n' +
        `Details: ${(err as Error).message}\n` +
        'This is a framework error, not an agent error.',
    );
  }

  if (!input.transcript_path) {
    return blockWithFeedback(
      '❌ HOOK ERROR: No transcript path provided.\n\nFramework error, not an agent error.',
    );
  }
  if (!fs.existsSync(input.transcript_path)) {
    return blockWithFeedback(
      `❌ HOOK ERROR: Transcript file not found at ${input.transcript_path}.\n\nFramework error.`,
    );
  }

  const transcriptContent = fs.readFileSync(input.transcript_path, 'utf-8');
  const lines = transcriptContent.split('\n').filter((l) => l.trim());
  const records = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Find the last assistant message — the wiki-generator's final output.
  const assistantMessages = records
    .filter((m: any) => m.type === 'assistant' || (m.message && m.message.role === 'assistant'))
    .reverse();

  if (assistantMessages.length === 0) {
    return blockWithFeedback(
      "❌ HOOK ERROR: No assistant messages in transcript. The agent hasn't produced output yet.",
    );
  }

  const lastMessage = assistantMessages[0];
  const content = lastMessage.message ? lastMessage.message.content : lastMessage.content;
  if (!content || !Array.isArray(content)) {
    return blockWithFeedback(
      '❌ HOOK ERROR: Last message has invalid content structure.\nFramework error, not an agent error.',
    );
  }

  const text = content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => String(c.text ?? ''))
    .join('\n')
    .trim();

  const violations = validateWikiOutput(text);

  if (violations.length > 0) {
    return blockWithFeedback(
      '❌ Wiki-generator output contract violations:\n\n' +
        violations.join('\n\n') +
        '\n\nPlease re-emit the corrected markdown body now (no apology text, just the fixed document).',
    );
  }

  return allow();
}

main();
