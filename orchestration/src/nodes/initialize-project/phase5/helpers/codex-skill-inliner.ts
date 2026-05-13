/**
 * Codex skill-body inliner.
 *
 * Claude Code auto-loads skill bodies from the `skills:` frontmatter list at spawn time.
 * Codex CLI does not — the framework strips `skills:` entirely for Codex agents. This
 * module inlines each skill's body directly into the agent prompt (wrapped in
 * `<skill name="...">` tags) at Phase 5 build time so Codex agents receive the same
 * prescriptive context as Claude agents.
 *
 * Claude Code agents are not touched by this helper; their native skill-preload mechanic
 * already handles the bodies.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import type { ResolvedSkill } from '../types.js';

const SKILL_INLINE_START = '<!-- CODEX_SKILL_INLINE_START -->';
const SKILL_INLINE_END = '<!-- CODEX_SKILL_INLINE_END -->';

interface InlineOptions {
  /** Absolute path to the target project (where the on-disk skill bodies live). */
  projectPath: string;
  /** Skills attached to the agent by skill-assigner. */
  skills: ResolvedSkill[];
  /**
   * Path resolver to locate each skill body in the target project. Phase 5
   * has already copied the skills to `<projectPath>/.codex/skills/<name>/SKILL.md`
   * (or the Claude variant); the inliner reads from that location, NOT from
   * the framework `skills/` source tree, because the synthesized convention
   * skills only exist on the target side.
   */
  resolveSkillPath: (skillName: string) => string;
}

/**
 * Inline skill bodies into the agent prompt body for Codex.
 *
 * Skills are inlined immediately after the agent's frontmatter. The block
 * is wrapped in idempotent sentinel comments — re-running Phase 5 replaces
 * the prior block in place rather than appending duplicates.
 *
 * If a skill body is missing on disk (e.g., the target project hasn't been
 * fully initialized yet), it is skipped silently — the inliner is a build
 * step, not a hard validation.
 *
 * If `skills` is empty, returns the input unchanged. If the input has no
 * frontmatter, returns the input unchanged (the inliner only runs against
 * generated agent files, all of which have frontmatter).
 *
 * @returns Agent content with the inline-skills block added or replaced.
 */
export function inlineSkillBodiesForCodex(content: string, options: InlineOptions): string {
  if (options.skills.length === 0) return content;

  const frontmatterEndIdx = findFrontmatterEnd(content);
  if (frontmatterEndIdx === -1) return content;

  const before = content.slice(0, frontmatterEndIdx);
  const after = content.slice(frontmatterEndIdx);

  const block = renderInlineBlock(options);
  if (!block) {
    return stripPriorInlineBlock(content);
  }

  const stripped = stripPriorInlineBlock(after);
  return `${before}\n${block}\n${stripped.trimStart()}`;
}

/**
 * Locate the index just AFTER the closing `---` of the YAML frontmatter.
 * Returns -1 when the input has no frontmatter or the frontmatter is unclosed.
 */
function findFrontmatterEnd(content: string): number {
  if (!content.startsWith('---')) return -1;
  const closeMatch = content.slice(3).match(/^---\s*$/m);
  if (!closeMatch || closeMatch.index === undefined) return -1;
  const absoluteCloseIdx = 3 + closeMatch.index;
  const newlineIdx = content.indexOf('\n', absoluteCloseIdx);
  return newlineIdx === -1 ? content.length : newlineIdx + 1;
}

function stripPriorInlineBlock(content: string): string {
  const startIdx = content.indexOf(SKILL_INLINE_START);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(SKILL_INLINE_END, startIdx);
  if (endIdx === -1) return content;
  const after = content.slice(endIdx + SKILL_INLINE_END.length).replace(/^\n/, '');
  return content.slice(0, startIdx) + after;
}

function renderInlineBlock(options: InlineOptions): string {
  const sections: string[] = [];
  const seenParagraphs = new Map<string, string>();

  for (const skill of options.skills) {
    const skillBody = loadSkillBody(skill, options);
    if (!skillBody) continue;

    const dedupedBody = dedupeAgainstSeen(skill.name, skillBody.trim(), seenParagraphs);
    sections.push([`<skill name="${skill.name}">`, dedupedBody, `</skill>`].join('\n'));
  }

  if (sections.length === 0) return '';

  return [
    SKILL_INLINE_START,
    '',
    '<!--',
    'Codex skill-body inline section. The Codex CLI does NOT auto-load skills',
    'listed in the agent frontmatter (Claude does). The framework inlines the',
    'bodies here at build time so this agent has the same prescriptive context',
    'on Codex as it would have on Claude. Each <skill> block is one skill body.',
    'Re-run /initialize-project to refresh.',
    '-->',
    '',
    ...sections,
    '',
    SKILL_INLINE_END,
  ].join('\n');
}

function loadSkillBody(skill: ResolvedSkill, options: InlineOptions): string | null {
  const skillPath = options.resolveSkillPath(skill.name);
  if (!existsSync(skillPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(skillPath, 'utf-8');
  } catch {
    return null;
  }

  try {
    const parsed = matter(raw);
    return parsed.content.trim();
  } catch {
    return raw.trim();
  }
}

/**
 * Helper for callers that build the inliner's resolveSkillPath function.
 * Resolves a skill name to its on-disk SKILL.md path under
 * `<projectPath>/.codex/skills/<name>/SKILL.md`. Stack-agnostic.
 */
export function makeCodexSkillPathResolver(
  projectPath: string,
  skillsRoot: string,
): (skillName: string) => string {
  return (skillName: string) => join(projectPath, skillsRoot, skillName, 'SKILL.md');
}

/**
 * Deduplicates paragraphs across skills. Paragraphs over `MIN_DEDUPE_BYTES` that
 * already appeared in an earlier skill are replaced with a `<see-skill name="..."/>`
 * cross-reference. Code fences are never deduped.
 */
const MIN_DEDUPE_BYTES = 200;

export function dedupeAgainstSeen(
  skillName: string,
  body: string,
  seen: Map<string, string>,
): string {
  const blocks = splitOnParagraphsPreservingFences(body);
  const out: string[] = [];

  for (const block of blocks) {
    if (block.kind === 'code') {
      out.push(block.text);
      continue;
    }
    const trimmed = block.text.trim();
    if (trimmed.length < MIN_DEDUPE_BYTES) {
      out.push(block.text);
      continue;
    }
    const earlierOwner = seen.get(trimmed);
    if (earlierOwner) {
      out.push(`<see-skill name="${earlierOwner}"/>`);
      continue;
    }
    seen.set(trimmed, skillName);
    out.push(block.text);
  }

  return out
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface ParagraphBlock {
  kind: 'prose' | 'code';
  text: string;
}

/**
 * Splits markdown on paragraph (blank-line) boundaries. Code fences are returned as
 * a single block so dedup never breaks a fence apart.
 */
function splitOnParagraphsPreservingFences(body: string): ParagraphBlock[] {
  const blocks: ParagraphBlock[] = [];
  const lines = body.split('\n');
  let buffer: string[] = [];
  let inFence = false;

  const flush = (kind: ParagraphBlock['kind']) => {
    if (buffer.length === 0) return;
    blocks.push({ kind, text: buffer.join('\n') });
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (!inFence) {
        flush('prose');
      }
      buffer.push(line);
      if (inFence) {
        flush('code');
        inFence = false;
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      buffer.push(line);
      continue;
    }
    if (line.trim().length === 0) {
      flush('prose');
      continue;
    }
    buffer.push(line);
  }
  flush(inFence ? 'code' : 'prose');

  return blocks;
}
