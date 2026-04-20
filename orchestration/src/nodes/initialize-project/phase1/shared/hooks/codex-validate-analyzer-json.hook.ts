#!/usr/bin/env node
/**
 * Codex CLI Stop Hook: Validate Analyzer JSON Output
 *
 * This is the Codex-compatible version of validate-analyzer-json.hook.ts.
 * Codex hooks receive JSON on stdin with the event payload and respond
 * on stdout with an action (stop or continue).
 *
 * Wire format:
 *   stdin:  { "type": "Stop", ... , "last_assistant_message": "..." }
 *   stdout: { "action": "stop" } or { "action": "continue", "message": "..." }
 *
 * When validation fails, we return { "action": "continue", "message": "<feedback>" }
 * which tells Codex to send the feedback to the model and keep going.
 * When validation passes, we return { "action": "stop" } to let it finish.
 */

import { validateAgentOutput } from '../../../../../schemas/phase1-agent-outputs.schema.js';
import { extractJSON } from '../../../../../utils/validator.js';

/**
 * Read stdin using async iterator
 */
async function readStdinAsync(): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

function respond(action: 'stop' | 'continue', message?: string): void {
  const response: Record<string, string> = { action };
  if (message) response.message = message;
  process.stdout.write(JSON.stringify(response) + '\n');
  process.exit(0);
}

async function main() {
  try {
    const stdinBuffer = await readStdinAsync();

    // Parse the Codex hook event
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(stdinBuffer);
    } catch {
      // Can't parse stdin - let codex stop (fail open)
      return respond('stop');
    }

    // Extract the last assistant message from the Codex event payload
    // Codex Stop events may have different field names depending on version
    const lastMessage =
      (event.last_assistant_message as string) ||
      (event.message as string) ||
      (event.content as string) ||
      '';

    if (!lastMessage) {
      // No message to validate - let codex stop
      return respond('stop');
    }

    // Extract JSON from the output
    const jsonString = extractJSON(lastMessage);

    if (!jsonString) {
      return respond(
        'continue',
        '❌ No JSON object found in your response.\n\n' +
          'REQUIRED FORMAT:\n' +
          '  1. Output ONLY raw JSON (no explanatory text)\n' +
          '  2. First character must be { and last character must be }\n' +
          '  3. Do NOT wrap in markdown code blocks (no ```json)\n' +
          '  4. Do NOT add any text before or after the JSON\n\n' +
          'Please output the corrected JSON now.',
      );
    }

    // Parse the JSON
    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
      return respond(
        'continue',
        `❌ JSON parsing failed: ${errorMsg}\n\n` +
          'Please fix the JSON syntax errors and output valid JSON.',
      );
    }

    // Validate against schema
    const result = validateAgentOutput(data);

    if (!result.success) {
      const agentInfo = result.agentName ? ` for agent "${result.agentName}"` : '';
      const errors = result.errors
        ? result.errors.issues
            .map((err, index) => {
              const pathStr = err.path.length > 0 ? `${err.path.join('.')}` : 'root';
              return `  ${index + 1}. Field "${pathStr}": ${err.message}`;
            })
            .join('\n')
        : 'Unknown validation error';

      return respond(
        'continue',
        `❌ Schema validation failed${agentInfo}. Fix these issues:\n\n${errors}\n\n` +
          'Please output the corrected JSON with all required fields.',
      );
    }

    // Validation passed
    return respond('stop');
  } catch (error) {
    // On hook crash, let codex stop (fail open - external validator will catch it)
    return respond('stop');
  }
}

main();
