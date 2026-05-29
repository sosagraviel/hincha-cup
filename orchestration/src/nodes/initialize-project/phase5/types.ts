/**
 * Phase 5: Resources Types
 *
 * Centralized type definitions for Phase 5 components
 */

import { z } from 'zod';

/**
 * Agent metadata
 */
export interface AgentMetadata {
  name: string;
  filename: string;
  model: 'opus' | 'sonnet' | 'haiku';
  description: string;
}

/**
 * Generated agent result.
 *
 * `assignedSkills` carries the resolved-skill list that was attached to
 * this agent at generation time. It is consumed by the Codex skill-body
 * inliner (see helpers/codex-skill-inliner.ts) which embeds each skill's
 * on-disk body into the agent prompt at write time — Codex does not
 * auto-load skills from frontmatter the way Claude Code does, so the
 * bridge has to ship the bodies in the agent file itself. Empty for
 * agents that don't carry skills (e.g., visual-verifier).
 */
export interface GeneratedAgent extends AgentMetadata {
  content: string;
  path: string;
  assignedSkills?: ResolvedSkill[];
}

/**
 * Agent skill assignments interface
 * Maps agent names to their assigned skills
 */
export interface AgentSkillAssignments {
  planner: ResolvedSkill[];
  [agentName: string]: ResolvedSkill[]; // implementer-typescript, implementer-python, etc.
}

/**
 * Skill Config Schema
 *
 * `agent_roles` controls which generated agents inherit this skill via the
 * `skills:` frontmatter. Two roles exist today: `planner` and
 * `implementer`. When the field is omitted, the skill defaults to BOTH
 * roles (backwards compatible). Skills that are tooling-only (test
 * runners, container helpers, cloud CLIs) declare `["implementer"]` so
 * they don't bloat the planner's preloaded context with bodies the
 * planner can't and won't run.
 *
 * `is_linkable_to_agents: false` overrides `agent_roles` — a skill that
 * is not linkable to any agent (Confluence / Notion / Jira fetchers,
 * external-doc ingestion) is copied to disk but never attached to any
 * generated agent regardless of `agent_roles`.
 */
export const SkillConfigSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  triggers: z.array(z.string()).optional(),
  trigger_mode: z.enum(['always', 'triggered', 'generated']).default('triggered'),
  compatible_languages: z.array(z.string()).optional(),
  is_linkable_to_agents: z.boolean().optional(),
  agent_roles: z.array(z.enum(['planner', 'implementer'])).optional(),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

export const SkillsConfigFileSchema = z.object({
  skills: z.array(SkillConfigSchema),
});

/**
 * Agent roles a skill can attach to. See SkillConfigSchema for semantics.
 */
export type AgentRole = 'planner' | 'implementer';

/**
 * Resolved skill with reason
 */
export interface ResolvedSkill {
  name: string;
  path: string;
  relative_path: string;
  reason: string;
  description: string;
  compatible_languages?: string[];
  trigger_mode?: 'always' | 'triggered' | 'generated';
  is_linkable_to_agents?: boolean;
  /**
   * Roles this skill should attach to via `skills:` frontmatter on
   * generated agents. When omitted, defaults to BOTH `planner` and
   * `implementer` (backwards compatible). Skills annotated as
   * `["implementer"]` keep their bodies out of the planner's preloaded
   * context — see plan.md §B.
   */
  agent_roles?: AgentRole[];
}

/**
 * Detected stack with both normalized and original package names
 */
export interface DetectedStack {
  normalized: Set<string>;
  original: Set<string>;
}

/**
 * Result of trigger matching
 */
export interface TriggerMatchResult {
  matches: boolean;
  matchedTriggers: string[];
}

/**
 * Language-specific command set
 */
export interface CommandSet {
  lint: string;
  format: string;
  typecheck: string;
  test: string;
  build: string;
}

/**
 * Template variables for agent generation
 */
export interface TemplateVariables {
  stack?: string;
  skills: string[];
  lint_command?: string;
  format_command?: string;
  typecheck_command?: string;
  test_command?: string;
  build_command?: string;
}
