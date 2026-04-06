import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import {
  FrameworkConfigSchema,
  type FrameworkConfig,
  type StackProfile,
} from "../../../schemas/index.js";

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

  // Service-centric stack profile (pass through directly)
  const stackProfileData: any = {
    // CORE: Services array (source of truth)
    services: stackProfile.services,

    // METADATA
    is_monorepo: stackProfile.is_monorepo,
    workspace_tool: stackProfile.workspace_tool,
    package_manager: stackProfile.package_manager,
    infrastructure: stackProfile.infrastructure,
    file_counts: stackProfile.file_counts,
  };

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
