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
    file_counts: z
      .object({
        total: z.number(),
        by_language: z.array(
          z.object({
            language: z.string(),
            count: z.number(),
          }),
        ),
      })
      .optional(),
    multi_stack: z
      .object({
        is_monorepo: z.boolean(),
        workspaces: z.array(
          z.object({
            path: z.string(),
            language: z.string(),
            manifest: z.string(),
          }),
        ),
      })
      .optional(),
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
    phase3_synthesis: z
      .object({
        synthesis_timestamp: z.string(),
        raw_content: z.string().optional(),
        extracted_files: z
          .object({
            claude_md: z.string().optional(),
            project_context_md: z.string().optional(),
          })
          .optional(),
        project_understanding: z.any().optional(),
        architectural_patterns: z.array(z.any()).optional(),
        key_insights: z.array(z.any()).optional(),
      })
      .passthrough(),
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
    file_counts: z
      .object({
        total: z.number(),
        by_language: z.array(
          z.object({
            language: z.string(),
            count: z.number(),
          }),
        ),
      })
      .optional(),
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
 * Phase 1 Analysis Data (read from disk files)
 */
export interface Phase1AnalysisData {
  structure_architecture: any;
  tech_stack_dependencies: any;
  code_patterns_testing: any;
  data_flows_integrations?: any;
}

/**
 * Generate framework configuration from disk files and stack profile
 * This function is idempotent - it reads from disk files, not state
 */
export function generateFrameworkConfig(
  projectPath: string,
  tempDir: string,
  phase1Data: Phase1AnalysisData,
  phase3SynthesisContent: string,
  stackProfile: StackProfile,
  frameworkPath: string,
): FrameworkConfig {
  const packageJsonPath = join(frameworkPath, "package.json");
  let frameworkVersion = "2.0.0";
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    frameworkVersion = packageJson.version || "2.0.0";
  }

  const stackProfileData: any = {
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
  };

  // Only include file_counts if it exists
  if (stackProfile.file_counts) {
    stackProfileData.file_counts = stackProfile.file_counts;
  }

  // Read Phase 2 consolidation from disk if it exists
  let phase2Data: any = {
    gaps_identified: [],
    validation_status: "valid",
  };

  if (tempDir) {
    const phase2Path = join(tempDir, "phase2-consolidation.json");
    if (existsSync(phase2Path)) {
      try {
        const fileContent = readFileSync(phase2Path, "utf-8");
        phase2Data = JSON.parse(fileContent);
      } catch (err) {
        // If file exists but can't be read/parsed, use defaults
      }
    }
  }

  const config: FrameworkConfig = {
    version: frameworkVersion,
    schema_version: "1.0.0",
    framework_version: frameworkVersion,
    project_metadata: {
      project_path: projectPath,
      last_analysis: new Date().toISOString(),
      initialization_hash: generateProjectHash(),
    },
    analysis_results: {
      phase1_analysis: {
        structure_architecture: phase1Data.structure_architecture,
        tech_stack_dependencies: phase1Data.tech_stack_dependencies,
        code_patterns_testing: phase1Data.code_patterns_testing,
        ...(phase1Data.data_flows_integrations && {
          data_flows_integrations: phase1Data.data_flows_integrations,
        }),
        all_completed: true,
        completion_timestamp: new Date().toISOString(),
      },
      phase2_consolidation: {
        ...phase2Data,
        timestamp: phase2Data.timestamp || new Date().toISOString(),
      },
      phase3_synthesis: {
        synthesis_timestamp: new Date().toISOString(),
        raw_content: phase3SynthesisContent,
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
