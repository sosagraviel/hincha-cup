/**
 * Framework Config Schema
 *
 * Complete Zod schema for validating framework-config.json structure
 * This is the authoritative schema used for generating and validating framework config files
 */

import { z } from 'zod';
import { StackProfileSchema } from './stack-profile.schema.js';

/**
 * Resource Info Schema
 * Tracks metadata for synced skills and agents
 */
export const ResourceInfoSchema = z
  .object({
    managed_by_framework: z.boolean(),
    user_modified: z.boolean().optional(),
    file_hash: z.string().optional(),
    source_hash: z.string().optional(),
    template_hash: z.string().optional(),
    source_path: z.string().optional(),
    template_path: z.string().optional(),
    last_sync: z.string().optional(),
  })
  .passthrough();

export type ResourceInfo = z.infer<typeof ResourceInfoSchema>;

/**
 * Phase 3 Synthesis Schema
 */
export const Phase3SynthesisSchema = z
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
  .passthrough();

export type Phase3Synthesis = z.infer<typeof Phase3SynthesisSchema>;

/**
 * Analysis Results Schema
 */
export const AnalysisResultsSchema = z.object({
  phase1_analysis: z.record(z.string(), z.any()),
  phase2_consolidation: z.any(),
  phase3_synthesis: Phase3SynthesisSchema,
  phase4_context: z.any(),
});

export type AnalysisResults = z.infer<typeof AnalysisResultsSchema>;

/**
 * Project Metadata Schema
 */
export const ProjectMetadataSchema = z
  .object({
    project_path: z.string(),
    last_analysis: z.string(),
    initialization_hash: z.string(),
  })
  .passthrough();

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

/**
 * Resource State Schema
 */
export const ResourceStateSchema = z.object({
  skills: z.record(z.string(), ResourceInfoSchema),
  agents: z.record(z.string(), ResourceInfoSchema),
  commands: z.record(z.string(), z.any()),
  last_sync: z.string(),
});

export type ResourceState = z.infer<typeof ResourceStateSchema>;

/**
 * Framework Config Schema (Complete)
 *
 * This is the complete schema for framework-config.json
 * Includes all fields: version info, analysis results (optional), stack profile, and resource state
 */
export const FrameworkConfigSchema = z.object({
  version: z.string(), // For backward compatibility
  schema_version: z.string(),
  framework_version: z.string(),
  project_metadata: ProjectMetadataSchema,
  analysis_results: AnalysisResultsSchema.optional(), // Made optional to avoid config bloat
  stack_profile: StackProfileSchema,
  resource_state: ResourceStateSchema,
});

export type FrameworkConfig = z.infer<typeof FrameworkConfigSchema>;
