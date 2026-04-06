/**
 * Phase 5: Resources Types
 *
 * Centralized type definitions for Phase 5 components
 */

import { z } from "zod";

// ============================================================================
// AGENT GENERATOR TYPES
// ============================================================================

/**
 * Agent metadata
 */
export interface AgentMetadata {
  name: string;
  filename: string;
  model: "opus" | "sonnet" | "haiku";
  description: string;
}

/**
 * Generated agent result
 */
export interface GeneratedAgent extends AgentMetadata {
  content: string;
  path: string;
}

/**
 * Agent skill assignments interface
 * Maps agent names to their assigned skills
 */
export interface AgentSkillAssignments {
  planner: ResolvedSkill[];
  [agentName: string]: ResolvedSkill[]; // implementer-typescript, implementer-python, etc.
}

// ============================================================================
// SKILL RESOLVER TYPES
// ============================================================================

/**
 * Skill Config Schema
 */
export const SkillConfigSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  triggers: z.array(z.string()).optional(),
  trigger_mode: z.enum(["always", "triggered", "generated"]).default("triggered"),
  compatible_languages: z.array(z.string()).optional(),
  is_linkable_to_agents: z.boolean().optional(),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

export const SkillsConfigFileSchema = z.object({
  skills: z.array(SkillConfigSchema),
});

/**
 * Resolved skill with reason
 */
export interface ResolvedSkill {
  name: string;
  path: string;
  relative_path: string; // Relative path from skills directory (e.g., "010-foundation/start-task")
  reason: string;
  description: string;
  compatible_languages?: string[];
  trigger_mode?: "always" | "triggered" | "generated";
  is_linkable_to_agents?: boolean;
}

/**
 * Detected stack with both normalized and original package names
 */
export interface DetectedStack {
  normalized: Set<string>; // For exact matching: "firebase" -> "firebase"
  original: Set<string>; // For prefix matching with delimiters: "@google-cloud/firestore"
}

/**
 * Result of trigger matching
 */
export interface TriggerMatchResult {
  matches: boolean;
  matchedTriggers: string[];
}

// ============================================================================
// COMMAND EXTRACTION TYPES
// ============================================================================

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
