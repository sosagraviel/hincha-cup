/**
 * Stack Profile Schema
 *
 * Defines the technology stack detected or configured for a project
 */

import { z } from 'zod';

/**
 * Detected Workspace Schema
 * Represents a workspace/package within a monorepo
 */
export const DetectedWorkspaceSchema = z.object({
  path: z.string(),
  language: z.string(),
  type: z.string(),
  frameworks: z.array(z.string()),
});

export type DetectedWorkspace = z.infer<typeof DetectedWorkspaceSchema>;

/**
 * File Count by Language Schema
 */
export const FileCountByLanguageSchema = z.object({
  language: z.string(),
  count: z.number(),
});

export type FileCountByLanguage = z.infer<typeof FileCountByLanguageSchema>;

/**
 * File Counts Schema
 */
export const FileCountsSchema = z.object({
  total: z.number(),
  by_language: z.array(FileCountByLanguageSchema),
});

export type FileCounts = z.infer<typeof FileCountsSchema>;

/**
 * Multi-Stack Workspace Schema
 */
export const MultiStackWorkspaceSchema = z.object({
  path: z.string(),
  language: z.string(),
  manifest: z.string(),
});

export type MultiStackWorkspace = z.infer<typeof MultiStackWorkspaceSchema>;

/**
 * Multi-Stack Configuration Schema
 */
export const MultiStackSchema = z.object({
  is_monorepo: z.boolean(),
  workspaces: z.array(MultiStackWorkspaceSchema),
});

export type MultiStack = z.infer<typeof MultiStackSchema>;

/**
 * Frameworks by Category Schema
 */
export const FrameworksByCategorySchema = z.object({
  frontend: z.array(z.string()).default([]),
  backend: z.array(z.string()).default([]),
  mobile: z.array(z.string()).default([]).optional(),
});

export type FrameworksByCategory = z.infer<typeof FrameworksByCategorySchema>;

/**
 * Stack Profile Schema
 *
 * Complete schema for project technology stack profile
 * Uses .passthrough() to allow additional custom fields
 */
export const StackProfileSchema = z
  .object({
    languages: z.array(z.string()).default([]),
    primary_language: z.string().optional(),
    frameworks: FrameworksByCategorySchema.default({ frontend: [], backend: [], mobile: [] }),
    testing_frameworks: z.record(z.string(), z.array(z.string())).optional(),
    infrastructure: z.array(z.string()).optional(),
    detected_workspaces: z.array(DetectedWorkspaceSchema).optional(),
    file_counts: FileCountsSchema.optional(),
    multi_stack: MultiStackSchema.optional(),
    workspaces: z.array(z.any()).optional(),
    package_manager: z.string().optional(),
    workspace_type: z.string().optional(),
  })
  .passthrough();

export type StackProfile = z.infer<typeof StackProfileSchema>;
