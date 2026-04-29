#!/usr/bin/env node
/**
 * Claude Code Stop Hook: Validate wiki-generator output
 *
 * Enforces the wiki-generator output contract that the agent prompt
 * (`phase4/wiki-generator/prompts/agent.md`) declares:
 *
 *   1. Output starts with a markdown heading `# ...` (no YAML frontmatter —
 *      the wiki-generation node prepends frontmatter deterministically).
 *   2. Provenance footnotes use only the curated allowlist:
 *      `^[analyzer:<name>]`, `^[synthesis]`, `^[claude-md]`,
 *      `^[project-context]`, `^[inferred]`, `^[ambiguous]`.
 *   3. No framework-internal jargon ("automated run", "exceeded token limit",
 *      "tool result overflow", "the X tool overflowed") leaks into user-
 *      facing prose. The wiki readers are developers consulting the wiki
 *      months later — they do not know what an "automated run" is.
 *
 * Stack-agnostic: every check works on any project shape. The hook does not
 * read project-specific files; it operates purely on the agent's transcript.
 *
 * On any violation: exit 2 (BLOCK) with retry feedback that lists every
 * offending line + the rule it violated. The agent re-emits the corrected
 * markdown internally.
 *
 * See plans/2026-04-29-gira-init-run-audit-refactor.md findings F13, F14, F15.
 */

import fs from 'fs';

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

const ALLOWED_PROVENANCE_PREFIXES = [
  /^analyzer:[a-z][a-z0-9_-]*$/,
  /^synthesis$/,
  /^claude-md$/,
  /^project-context$/,
  /^inferred$/,
  /^ambiguous$/,
];

const FRAMEWORK_JARGON_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bautomated run\b/i, label: '"automated run"' },
  { pattern: /\bduring the framework run\b/i, label: '"during the framework run"' },
  { pattern: /\bexceeded token limit\b/i, label: '"exceeded token limit"' },
  { pattern: /\bexceeds maximum allowed tokens\b/i, label: '"exceeds maximum allowed tokens"' },
  { pattern: /\btool result overflow\b/i, label: '"tool result overflow"' },
  { pattern: /\btool-result overflow\b/i, label: '"tool-result overflow"' },
  {
    pattern: /\bthe [a-z_-]+ tool overflowed\b/i,
    label: 'phrasings of "the <tool> overflowed"',
  },
  { pattern: /\bspilled to a sidecar file\b/i, label: '"spilled to a sidecar file"' },
];

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extract every provenance footnote (`^[...]`) from the agent's output. We
 * walk the parsed text rather than the raw stream so we don't false-positive
 * on `^[...]` strings that appear inside fenced code blocks (those are
 * legitimate — e.g. code samples documenting the wiki conventions).
 */
function extractProvenanceTags(text: string): Array<{ tag: string; line: number }> {
  const out: Array<{ tag: string; line: number }> = [];
  const lines = text.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const matches = line.matchAll(/\^\[([^\]]+)\]/g);
    for (const m of matches) {
      out.push({ tag: m[1], line: i + 1 });
    }
  }
  return out;
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

  if (!text) {
    return blockWithFeedback(
      '❌ OUTPUT ERROR: empty wiki output.\n\n' +
        'You must return the wiki page as a single markdown document. Start with a `# Heading` and include the body. No empty responses.',
    );
  }

  const violations: string[] = [];

  // Rule 1: starts with `# ` (no frontmatter — the wiki-generation node
  // adds frontmatter deterministically).
  const firstNonBlank = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  if (firstNonBlank.trim().startsWith('---')) {
    violations.push(
      '  • Output starts with a YAML frontmatter delimiter `---`. Do NOT include frontmatter — the framework prepends it deterministically. Output the markdown body only, starting with a `# Heading`.',
    );
  } else if (!/^#\s+\S/.test(firstNonBlank.trim())) {
    violations.push(
      '  • Output must start with a level-1 markdown heading like `# <Title>`. Do not start with prose, a list, or a code fence.',
    );
  }

  // Rule 2: provenance footnote allowlist.
  const tags = extractProvenanceTags(text);
  const offendingTags: Array<{ tag: string; line: number }> = [];
  for (const { tag, line } of tags) {
    if (!ALLOWED_PROVENANCE_PREFIXES.some((rx) => rx.test(tag))) {
      offendingTags.push({ tag, line });
    }
  }
  if (offendingTags.length > 0) {
    const examples = offendingTags
      .slice(0, 8)
      .map(({ tag, line }) => `      line ${line}: ^[${tag}]`)
      .join('\n');
    violations.push(
      '  • Found provenance footnotes that do NOT match the allowed prefixes:\n' +
        examples +
        (offendingTags.length > 8 ? `\n      … and ${offendingTags.length - 8} more` : '') +
        '\n    Allowed prefixes: ^[analyzer:<name>], ^[synthesis], ^[claude-md], ^[project-context], ^[inferred], ^[ambiguous]. ' +
        'Rewrite each offending tag to the closest allowed form. For example, replace ^[code_patterns_testing] with ^[analyzer:code_patterns_testing], or replace consolidator-id refs (^[v1], ^[v2]) with ^[ambiguous] or drop them.',
    );
  }

  // Rule 3: framework-internal jargon must not leak.
  const jargonHits: Array<{ label: string; line: number; snippet: string }> = [];
  const textLines = text.split('\n');
  for (let i = 0; i < textLines.length; i += 1) {
    for (const { pattern, label } of FRAMEWORK_JARGON_PATTERNS) {
      if (pattern.test(textLines[i])) {
        jargonHits.push({
          label,
          line: i + 1,
          snippet: textLines[i].trim().slice(0, 160),
        });
      }
    }
  }
  if (jargonHits.length > 0) {
    const examples = jargonHits
      .slice(0, 6)
      .map(({ label, line, snippet }) => `      line ${line} (${label}): ${snippet}`)
      .join('\n');
    violations.push(
      '  • Found framework-internal phrasing in user-facing prose:\n' +
        examples +
        (jargonHits.length > 6 ? `\n      … and ${jargonHits.length - 6} more` : '') +
        '\n    The wiki is read by developers months after the run — they do not know what an "automated run" or a "tool overflow" is. Rewrite each offending sentence to describe the project state directly. ' +
        'If the underlying fact is not actually known, write `(not determined by analysis)` instead.',
    );
  }

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
