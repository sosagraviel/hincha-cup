/**
 * Codex skill-body inliner.
 *
 * Why this exists:
 *   Claude Code subagents auto-load the FULL body of every skill listed in
 *   the agent's `skills:` frontmatter at spawn time (verified verbatim
 *   against official Claude Code documentation). Codex CLI does NOT — when
 *   a Codex agent spawns, the framework's frontmatter rewriter strips the
 *   `skills:` line entirely (see codex-cli-agent-impl.ts). On Codex, every
 *   `skills: [a, b, c]` becomes dead text.
 *
 *   That gap meant the per-project convention skills (`code-conventions`,
 *   `multi-file-workflows`, `testing-conventions`) shipped to Codex agents
 *   as zero context — a 6000-developer regression for any team running
 *   Codex.
 *
 * The bridge:
 *   At resource generation time (Phase 5), when the active provider is
 *   Codex, we inline each agent's resolved skill bodies directly into the
 *   agent prompt body, immediately after the agent's role/responsibility
 *   section. Each skill body is wrapped in `<skill name="...">` tags so the
 *   agent can see the boundary and know it's reading prescriptive guidance
 *   (rules / examples / checklists) rather than role instructions.
 *
 * What gets inlined:
 *   ALL resolved skills attached to the agent — both framework-shipped
 *   skills (mastering-typescript, mastering-python, etc., resolved from the
 *   target project's `<project>/.codex/skills/<name>/SKILL.md` after
 *   provider-aware copying) AND the three generated convention skills
 *   (code-conventions, multi-file-workflows, testing-conventions). Per the
 *   user's H3 directive: inline all listed skills; the list will be cleaned
 *   up in a follow-up iteration.
 *
 * Stack-agnostic by construction — operates on the resolved-skill list
 * passed in, no language- or framework-specific assumptions.
 *
 * Invariant: Claude Code agents are NOT touched by this helper. Claude's
 * native skill-preload mechanic already handles their bodies; inlining
 * twice would burn tokens and create drift between the on-disk skill body
 * and the inlined copy.
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
    // No skill bodies could be loaded — strip any prior block but emit nothing new.
    return stripPriorInlineBlock(content);
  }

  // Strip any existing block before inserting (idempotent re-runs).
  const stripped = stripPriorInlineBlock(after);
  return `${before}\n${block}\n${stripped.trimStart()}`;
}

/**
 * Locate the index just AFTER the closing `---` of the YAML frontmatter.
 * Returns -1 when the input has no frontmatter or the frontmatter is unclosed.
 */
function findFrontmatterEnd(content: string): number {
  if (!content.startsWith('---')) return -1;
  // Look for the closing `---` on its own line.
  const closeMatch = content.slice(3).match(/^---\s*$/m);
  if (!closeMatch || closeMatch.index === undefined) return -1;
  // Index in the original string of the closing `---`.
  const absoluteCloseIdx = 3 + closeMatch.index;
  // Advance past the closing `---` and its trailing newline.
  const newlineIdx = content.indexOf('\n', absoluteCloseIdx);
  return newlineIdx === -1 ? content.length : newlineIdx + 1;
}

function stripPriorInlineBlock(content: string): string {
  const startIdx = content.indexOf(SKILL_INLINE_START);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(SKILL_INLINE_END, startIdx);
  if (endIdx === -1) return content;
  // Remove the entire block including a trailing newline if present.
  const after = content.slice(endIdx + SKILL_INLINE_END.length).replace(/^\n/, '');
  return content.slice(0, startIdx) + after;
}

function renderInlineBlock(options: InlineOptions): string {
  const sections: string[] = [];

  for (const skill of options.skills) {
    const skillBody = loadSkillBody(skill, options);
    if (!skillBody) continue;
    sections.push([`<skill name="${skill.name}">`, skillBody.trim(), `</skill>`].join('\n'));
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

  // Drop frontmatter from the inlined copy — the agent already knows the
  // skill's name from the wrapping `<skill name="...">` tag, and the
  // YAML metadata has no value once the body is inlined inline.
  try {
    const parsed = matter(raw);
    return parsed.content.trim();
  } catch {
    // Malformed frontmatter — emit the raw body and let the agent see it.
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
