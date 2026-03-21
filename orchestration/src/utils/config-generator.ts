import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../state/schemas/initialize-project.schema.js';
import { z } from 'zod';

/**
 * Stack Profile Schema
 */
const StackProfileSchema = z.object({
  languages: z.array(z.string()).default([]),
  primary_language: z.string().optional(),
  frameworks: z.object({
    frontend: z.array(z.string()).default([]),
    backend: z.array(z.string()).default([]),
    mobile: z.array(z.string()).default([]).optional()
  }).default({ frontend: [], backend: [], mobile: [] }),
  testing_frameworks: z.record(z.string(), z.array(z.string())).optional(),
  infrastructure: z.array(z.string()).optional(),
  detected_workspaces: z.array(z.object({
    path: z.string(),
    language: z.string(),
    type: z.string(),
    frameworks: z.array(z.string())
  })).optional(),
  file_counts: z.record(z.string(), z.number()).optional(),
  workspaces: z.array(z.any()).optional(),
  package_manager: z.string().optional(),
  workspace_type: z.string().optional()
}).passthrough();

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
    initialization_hash: z.string()
  }),
  analysis_results: z.object({
    phase1_analysis: z.record(z.string(), z.any()),
    phase2_consolidation: z.any(),
    phase3_synthesis: z.any(),
    phase4_context: z.any()
  }),
  stack_profile: z.object({
    languages: z.array(z.string()),
    primary_language: z.string().optional(),
    frameworks: z.object({
      frontend: z.array(z.string()),
      backend: z.array(z.string()),
      mobile: z.array(z.string()).optional()
    }),
    testing_frameworks: z.record(z.string(), z.array(z.string())),
    infrastructure: z.array(z.string()).optional(),
    detected_workspaces: z.array(z.object({
      path: z.string(),
      language: z.string(),
      type: z.string(),
      frameworks: z.array(z.string())
    })),
    file_counts: z.record(z.string(), z.number())
  }),
  resource_state: z.object({
    skills: z.record(z.string(), z.any()),
    agents: z.record(z.string(), z.any()),
    commands: z.record(z.string(), z.any()),
    last_sync: z.string()
  })
});

export type FrameworkConfig = z.infer<typeof FrameworkConfigSchema>;

/**
 * Workspace type inference
 */
function inferWorkspaceType(workspace: any): string {
  const name = (workspace.name || workspace.path || '').toLowerCase();

  if (name.includes('web') || name.includes('frontend') || name.includes('ui')) {
    return 'frontend';
  }
  if (name.includes('backend') || name.includes('api') || name.includes('server')) {
    return 'backend';
  }
  if (name.includes('mobile') || name.includes('ios') || name.includes('android')) {
    return 'mobile';
  }
  if (name.includes('function') || name.includes('lambda') || name.includes('service')) {
    return 'service';
  }
  if (name.includes('lib') || name.includes('package') || name.includes('shared')) {
    return 'library';
  }

  // Default based on frameworks
  if (workspace.frameworks?.frontend?.length > 0) {
    return 'frontend';
  }
  if (workspace.frameworks?.backend?.length > 0) {
    return 'backend';
  }

  return 'service';
}

/**
 * Extract stack data from Phase 1 analysis
 */
function extractStackFromPhase1(phase1Analysis: Record<string, any>): {
  languages: Set<string>;
  primaryLanguage: string | undefined;
  frameworks: { frontend: string[]; backend: string[]; mobile: string[] };
  testingFrameworks: Record<string, string[]>;
  detectedWorkspaces: any[];
} {
  const languages = new Set<string>();
  const frameworks = { frontend: [] as string[], backend: [] as string[], mobile: [] as string[] };
  const testingFrameworks: Record<string, string[]> = {};
  const detectedWorkspaces: any[] = [];

  // Extract from tech-stack-dependencies analysis
  const techStackData = phase1Analysis.tech_stack_dependencies?.findings || {};

  // Also extract from code_patterns_testing for better testing framework detection
  const codePatterns = phase1Analysis.code_patterns_testing?.findings || {};

  // Extract workspaces and languages
  if (techStackData.multi_stack?.workspaces) {
    for (const ws of techStackData.multi_stack.workspaces) {
      if (ws.language) {
        languages.add(ws.language);
      }

      // Extract dependencies as frameworks
      if (ws.dependencies) {
        const frontendSet = new Set(['react', 'vue', 'angular', 'next', 'nextjs', 'svelte', 'nuxt']);
        const backendSet = new Set(['express', 'fastapi', 'django', 'nestjs', 'flask', 'firebase-functions']);
        const testingSet = new Set(['jest', 'vitest', 'playwright', 'pytest', 'mocha', 'chai']);

        for (const dep of ws.dependencies) {
          const depLower = dep.toLowerCase().replace(/[^a-z]/g, '');

          if (frontendSet.has(depLower) && !frameworks.frontend.includes(dep)) {
            frameworks.frontend.push(dep);
          } else if (backendSet.has(depLower) && !frameworks.backend.includes(dep)) {
            frameworks.backend.push(dep);
          }

          if (testingSet.has(depLower)) {
            const lang = ws.language || 'javascript';
            if (!testingFrameworks[lang]) {
              testingFrameworks[lang] = [];
            }
            if (!testingFrameworks[lang].includes(dep)) {
              testingFrameworks[lang].push(dep);
            }
          }
        }
      }

      // Add to detected workspaces
      detectedWorkspaces.push({
        path: ws.path || '',
        language: ws.language || 'javascript',
        type: inferWorkspaceType(ws),
        frameworks: ws.dependencies || []
      });
    }
  }

  // Extract testing frameworks from code_patterns_testing (more accurate)
  if (codePatterns.multi_stack?.workspaces) {
    for (const ws of codePatterns.multi_stack.workspaces) {
      if (ws.testing_framework) {
        const lang = (ws.language || 'javascript').toLowerCase();
        if (!testingFrameworks[lang]) {
          testingFrameworks[lang] = [];
        }
        if (!testingFrameworks[lang].includes(ws.testing_framework)) {
          testingFrameworks[lang].push(ws.testing_framework);
        }
      }
    }
  }

  // Determine primary language (most common)
  let primaryLanguage: string | undefined;
  if (languages.size > 0) {
    const langCounts: Record<string, number> = {};
    for (const ws of techStackData.multi_stack?.workspaces || []) {
      if (ws.language) {
        langCounts[ws.language] = (langCounts[ws.language] || 0) + 1;
      }
    }

    if (Object.keys(langCounts).length > 0) {
      primaryLanguage = Object.entries(langCounts)
        .sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  return {
    languages,
    primaryLanguage,
    frameworks,
    testingFrameworks,
    detectedWorkspaces
  };
}

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
  frameworkPath: string
): FrameworkConfig {
  // Read framework version
  const packageJsonPath = join(frameworkPath, 'package.json');
  let frameworkVersion = '2.0.0';
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    frameworkVersion = packageJson.version || '2.0.0';
  }

  // Use the provided stack profile (which Phase 4 extracted from disk)
  // After idempotency refactor, state.phase1_analysis only contains completion status
  const stackProfileData = {
    languages: stackProfile.languages || [],
    primary_language: stackProfile.primary_language,
    frameworks: stackProfile.frameworks || { frontend: [], backend: [], mobile: [] },
    testing_frameworks: stackProfile.testing_frameworks || {},
    infrastructure: stackProfile.infrastructure,
    detected_workspaces: stackProfile.detected_workspaces || stackProfile.workspaces || [],
    file_counts: stackProfile.file_counts || {}
  };

  // Build framework config
  const config: FrameworkConfig = {
    version: frameworkVersion, // Add for backward compatibility with validation
    schema_version: '1.0.0',
    framework_version: frameworkVersion,
    project_metadata: {
      project_path: state.project_path,
      last_analysis: new Date().toISOString(),
      initialization_hash: generateProjectHash()
    },
    analysis_results: {
      phase1_analysis: state.phase1_analysis || {},
      phase2_consolidation: {
        gaps_identified: [],
        consolidation_timestamp: state.phase2_consolidation?.timestamp || new Date().toISOString(),
        validation_status: 'valid'
      },
      phase3_synthesis: {
        synthesis_timestamp: state.phase3_synthesis?.timestamp || new Date().toISOString(),
        project_understanding: {},
        architectural_patterns: [],
        key_insights: []
      },
      phase4_context: {
        context_generation_timestamp: new Date().toISOString(),
        files_generated: [
          '.claude/CLAUDE.md',
          '.claude/project-context/SKILL.md'
        ]
      }
    },
    stack_profile: stackProfileData,
    resource_state: {
      skills: {},
      agents: {},
      commands: {},
      last_sync: new Date().toISOString()
    }
  };

  // Validate config
  FrameworkConfigSchema.parse(config);

  return config;
}
