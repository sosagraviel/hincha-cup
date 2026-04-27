import { readFileSync } from 'fs';
import { z } from 'zod';

export const WikiDeltaHintSchema = z.object({
  file_path: z.string().min(1),
  suggested_page: z.string().min(1),
  action: z.enum(['add', 'update', 'deprecate']),
  reason: z.string().min(1).max(120),
});

export type WikiDeltaHint = z.infer<typeof WikiDeltaHintSchema>;

const JSONL_FENCE_PATTERN = /```jsonl\n([\s\S]*?)```/;

/**
 * Parse the JSONL fenced block from an implementer completion summary.
 * Returns an empty array when no block is present (backward-compatible with
 * pre-format implementer outputs).
 * Throws with a line-number reference when a JSON line is malformed or fails
 * schema validation.
 */
export function parseWikiDeltaHints(completionSummary: string): WikiDeltaHint[] {
  const match = JSONL_FENCE_PATTERN.exec(completionSummary);
  if (!match) {
    return [];
  }

  const blockContent = match[1];
  const lines = blockContent.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const hints: WikiDeltaHint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i].trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `Wiki Delta Hints: invalid JSON at line ${lineNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const result = WikiDeltaHintSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((iss) => iss.message).join(', ');
      throw new Error(`Wiki Delta Hints: validation failed at line ${lineNumber}: ${issues}`);
    }

    hints.push(result.data);
  }

  return hints;
}

/**
 * Read a JSONL file containing one hint per line.
 * Comment lines starting with '#' and blank lines are ignored.
 * Throws with a line-number reference on parse or validation errors.
 */
export function readWikiDeltaHintsFile(path: string): WikiDeltaHint[] {
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n');

  const hints: WikiDeltaHint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i].trim();

    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(
        `Wiki Delta Hints file "${path}": invalid JSON at line ${lineNumber}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const result = WikiDeltaHintSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((iss) => iss.message).join(', ');
      throw new Error(
        `Wiki Delta Hints file "${path}": validation failed at line ${lineNumber}: ${issues}`,
      );
    }

    hints.push(result.data);
  }

  return hints;
}

/** Serialize hints to a JSONL string for writing to disk or passing to CLI. */
export function serializeWikiDeltaHints(hints: WikiDeltaHint[]): string {
  return hints.map((h) => JSON.stringify(h)).join('\n') + (hints.length > 0 ? '\n' : '');
}
