/**
 * Skill Assignment Validator (Plan §C 6.1, gira-exhaustive followup,
 * 2026-05-05).
 *
 * The 2026-05-04 gira run produced agents with 6+ skills that had
 * heavy body-content overlap (e.g. `atomic-design-react`,
 * `react-frontend`, `mastering-typescript` all assigned to the same
 * implementer). The skill-assigner already de-duplicates by NAME,
 * but two skills with different names can ship 60-90% identical
 * prose — the agent's context fills with redundant rules.
 *
 * This validator runs AFTER skill-assigner returns. Two non-blocking
 * warnings:
 *
 *   - `overlapping_skills` — fired when any pair of skills attached
 *     to the same agent share ≥60% of their meaningful tokens
 *     (Jaccard similarity on the skill bodies, code-fences /
 *     boilerplate-frontmatter stripped first).
 *   - `skill_cap_exceeded` — fired when any agent has more than 8
 *     skills attached. The cap is a budget heuristic, not an error;
 *     legitimate stacks (full-stack monorepos) can hit 8 naturally.
 *
 * Stack-agnostic: every check is content-shape based. The token set
 * is derived from the skill body's prose (not its name or path), so
 * a Java skill and a Python skill that happen to ship identical
 * prescriptive rules would both surface the warning.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AgentSkillAssignments, ResolvedSkill } from '../types.js';

export interface SkillAssignmentWarning {
  code: 'overlapping_skills' | 'skill_cap_exceeded';
  agent: string;
  message: string;
}

const DEFAULT_OVERLAP_THRESHOLD = 0.6;
const DEFAULT_SKILL_CAP = 8;

interface ValidateOptions {
  /** Jaccard similarity threshold ∈ (0, 1]. Default 0.6. */
  overlapThreshold?: number;
  /** Per-agent skill ceiling. Default 8. */
  skillCap?: number;
}

/**
 * Walk the assignments map, return warnings for every agent that
 * either exceeds the skill cap or carries skills with body overlap
 * above the threshold. Pure function modulo the file reads
 * (memoised by `path` so a skill assigned to N agents is read once).
 */
export function validateSkillAssignments(
  assignments: AgentSkillAssignments,
  options: ValidateOptions = {},
): SkillAssignmentWarning[] {
  const overlapThreshold = options.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD;
  const skillCap = options.skillCap ?? DEFAULT_SKILL_CAP;
  const warnings: SkillAssignmentWarning[] = [];
  const tokenCache = new Map<string, Set<string>>();

  for (const [agent, skills] of Object.entries(assignments)) {
    if (skills.length > skillCap) {
      warnings.push({
        code: 'skill_cap_exceeded',
        agent,
        message: `Agent ${agent} has ${skills.length} skills (cap: ${skillCap}). Review skill assignments — too many skills crowd the agent context window.`,
      });
    }

    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const a = skills[i];
        const b = skills[j];
        const sim = jaccardSimilarity(
          loadSkillTokens(a, tokenCache),
          loadSkillTokens(b, tokenCache),
        );
        if (sim >= overlapThreshold) {
          warnings.push({
            code: 'overlapping_skills',
            agent,
            message: `Agent ${agent}: skill "${a.name}" and "${b.name}" share ${Math.round(sim * 100)}% of their body tokens. Consider keeping only one.`,
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Lookup or compute the meaningful-token set for a skill body. Skills
 * whose body cannot be read (file missing, readable error, etc.) are
 * treated as empty — they cannot drive the overlap warning, but they
 * also cannot suppress it. Defensive by design.
 */
function loadSkillTokens(skill: ResolvedSkill, cache: Map<string, Set<string>>): Set<string> {
  const cached = cache.get(skill.path);
  if (cached) return cached;
  const tokens = bodyTokens(readSkillBody(skill.path));
  cache.set(skill.path, tokens);
  return tokens;
}

function readSkillBody(skillDirOrFile: string): string {
  // The skill `path` may point to either the SKILL.md file directly
  // or the parent directory. Both are seen in the wild.
  const candidates = [
    skillDirOrFile,
    join(skillDirOrFile, 'SKILL.md'),
    join(skillDirOrFile, 'SKILL.claude.md'),
    join(skillDirOrFile, 'SKILL.codex.md'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        return readFileSync(candidate, 'utf-8');
      } catch {
        // ignore — try the next candidate
      }
    }
  }
  return '';
}

/**
 * Tokenise the meaningful prose of a skill body. We:
 *   - drop YAML frontmatter (delimited by `---` on its own line);
 *   - drop fenced code blocks (` ``` ... ``` `) — code is not the
 *     overlap signal we care about; two skills can ship the same
 *     hello-world fence without overlapping;
 *   - lowercase and strip punctuation;
 *   - drop common stopwords (so "the / a / and / is" don't dominate).
 *
 * Returns the unique-token set for Jaccard comparison.
 */
const STOPWORDS = new Set<string>([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'can',
  'do',
  'for',
  'from',
  'has',
  'have',
  'if',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'should',
  'that',
  'the',
  'then',
  'this',
  'to',
  'use',
  'with',
  'when',
  'will',
]);

function bodyTokens(body: string): Set<string> {
  if (!body) return new Set();
  let text = body;
  // Strip YAML frontmatter at the top of the body.
  text = text.replace(/^---[\s\S]*?---\n/, '');
  // Strip fenced code blocks.
  text = text.replace(/```[\s\S]*?```/g, '');
  // Normalise: lowercase, strip non-letters/digits, collapse whitespace.
  text = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const set = new Set<string>();
  for (const tok of text.split(/\s+/)) {
    if (tok.length < 3) continue; // ignore single + double letters
    if (STOPWORDS.has(tok)) continue;
    set.add(tok);
  }
  return set;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
