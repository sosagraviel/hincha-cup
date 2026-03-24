import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { InitializeProjectState } from "../state/schemas/initialize-project.schema.js";
import { z } from "zod";

/**
 * Stack Profile Schema
 */
const StackProfileSchema = z
  .object({
    languages: z.array(z.string()).default([]),
    primary_language: z.string().optional(),
    frameworks: z
      .object({
        frontend: z.array(z.string()).default([]),
        backend: z.array(z.string()).default([]),
        mobile: z.array(z.string()).default([]).optional(),
      })
      .default({ frontend: [], backend: [], mobile: [] }),
    testing_frameworks: z.record(z.string(), z.array(z.string())).optional(),
    infrastructure: z.array(z.string()).optional(),
    detected_workspaces: z
      .array(
        z.object({
          path: z.string(),
          language: z.string(),
          type: z.string(),
          frameworks: z.array(z.string()),
        }),
      )
      .optional(),
    file_counts: z.record(z.string(), z.number()).optional(),
    workspaces: z.array(z.any()).optional(),
    package_manager: z.string().optional(),
    workspace_type: z.string().optional(),
  })
  .passthrough();

export type StackProfile = z.infer<typeof StackProfileSchema>;

/**
 * Framework Config Schema
 */
const FrameworkConfigSchema = z.object({
  version: z.string(), // For backward compatibility
  schema_version: z.string(),
  framework_version: z.string(),
  project_metadata: z.object({
    project_path: z.string(),
    last_analysis: z.string(),
    initialization_hash: z.string(),
  }),
  analysis_results: z.object({
    phase1_analysis: z.record(z.string(), z.any()),
    phase2_consolidation: z.any(),
    phase3_synthesis: z.any(),
    phase4_context: z.any(),
  }),
  stack_profile: z.object({
    languages: z.array(z.string()),
    primary_language: z.string().optional(),
    frameworks: z.object({
      frontend: z.array(z.string()),
      backend: z.array(z.string()),
      mobile: z.array(z.string()).optional(),
    }),
    testing_frameworks: z.record(z.string(), z.array(z.string())),
    infrastructure: z.array(z.string()).optional(),
    detected_workspaces: z.array(
      z.object({
        path: z.string(),
        language: z.string(),
        type: z.string(),
        frameworks: z.array(z.string()),
      }),
    ),
    file_counts: z.record(z.string(), z.number()),
  }),
  resource_state: z.object({
    skills: z.record(z.string(), z.any()),
    agents: z.record(z.string(), z.any()),
    commands: z.record(z.string(), z.any()),
    last_sync: z.string(),
  }),
});

export type FrameworkConfig = z.infer<typeof FrameworkConfigSchema>;

/**
 * Generate project hash for tracking changes
 */
function generateProjectHash(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Generate framework configuration from workflow state and stack profile
 */
export function generateFrameworkConfig(
  state: InitializeProjectState,
  stackProfile: StackProfile,
  frameworkPath: string,
): FrameworkConfig {
  const packageJsonPath = join(frameworkPath, "package.json");
  let frameworkVersion = "2.0.0";
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    frameworkVersion = packageJson.version || "2.0.0";
  }

  const stackProfileData = {
    languages: stackProfile.languages || [],
    primary_language: stackProfile.primary_language,
    frameworks: stackProfile.frameworks || {
      frontend: [],
      backend: [],
      mobile: [],
    },
    testing_frameworks: stackProfile.testing_frameworks || {},
    infrastructure: stackProfile.infrastructure,
    detected_workspaces:
      stackProfile.detected_workspaces || stackProfile.workspaces || [],
    file_counts: stackProfile.file_counts || {},
  };

  const config: FrameworkConfig = {
    version: frameworkVersion,
    schema_version: "1.0.0",
    framework_version: frameworkVersion,
    project_metadata: {
      project_path: state.project_path,
      last_analysis: new Date().toISOString(),
      initialization_hash: generateProjectHash(),
    },
    analysis_results: {
      phase1_analysis: state.phase1_analysis || {},
      phase2_consolidation: {
        gaps_identified: [],
        consolidation_timestamp:
          state.phase2_consolidation?.timestamp || new Date().toISOString(),
        validation_status: "valid",
      },
      phase3_synthesis: {
        synthesis_timestamp:
          state.phase3_synthesis?.timestamp || new Date().toISOString(),
        project_understanding: {},
        architectural_patterns: [],
        key_insights: [],
      },
      phase4_context: {
        context_generation_timestamp: new Date().toISOString(),
        files_generated: [
          ".claude/CLAUDE.md",
          ".claude/project-context/SKILL.md",
        ],
      },
    },
    stack_profile: stackProfileData,
    resource_state: {
      skills: {},
      agents: {},
      commands: {},
      last_sync: new Date().toISOString(),
    },
  };

  FrameworkConfigSchema.parse(config);

  return config;
}
