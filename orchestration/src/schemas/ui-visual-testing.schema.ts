/**
 * UI Visual Testing Configuration Schema
 *
 * Zod schema for ui-visual-testing.json config files.
 * Maps screens to Figma frames and Playwright capture targets.
 *
 * Lookup order:
 *   1. {componentDir}/ui-visual-testing.json — co-located with component
 *   2. {projectRoot}/ui-visual-testing.json — project-wide fallback
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const ViewportSchema = z.object({
  width: z.number().min(320).max(3840),
  height: z.number().min(240).max(2160),
});

export const IgnoreRegionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
  reason: z.string().optional(),
});

export const ScreenEntrySchema = z.object({
  label: z.string().min(1).max(100),
  figmaNodeId: z.string().optional(),
  route: z.string().min(1),
  viewport: ViewportSchema,
  captureSelector: z.string().optional(),
  waitForSelector: z.string().optional(),
  delay: z.number().min(0).max(30000).optional(),
  modes: z.array(z.enum(['figma', 'screenshot'])).default(['figma', 'screenshot']),
  ignoreRegions: z.array(IgnoreRegionSchema).optional(),
});

export const ThresholdsSchema = z.object({
  figma: z.number().min(0).max(100).default(2),
  regression: z.number().min(0).max(100).default(5),
});

export const FigmaConfigSchema = z.object({
  fileKey: z.string().optional(),
  accessMethod: z.enum(['mcp', 'token', 'manual']).optional(),
});

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

export const UIVisualTestingConfigSchema = z.object({
  $schema: z.string().optional(),
  figma: FigmaConfigSchema.optional(),
  thresholds: ThresholdsSchema.default({ figma: 2, regression: 5 }),
  maxIterations: z.number().min(1).max(10).default(3),
  screens: z.array(ScreenEntrySchema).min(1),
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type Viewport = z.infer<typeof ViewportSchema>;
export type IgnoreRegion = z.infer<typeof IgnoreRegionSchema>;
export type ScreenEntry = z.infer<typeof ScreenEntrySchema>;
export type Thresholds = z.infer<typeof ThresholdsSchema>;
export type FigmaConfig = z.infer<typeof FigmaConfigSchema>;
export type UIVisualTestingConfig = z.infer<typeof UIVisualTestingConfigSchema>;
