import { Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import PNG from 'pngjs';
import pixelmatch from 'pixelmatch';
import type { ScreenEntry } from '../../schemas/ui-visual-testing.schema.js';

/**
 * Screenshot Service
 *
 * Handles screenshot capture and comparison for visual regression testing:
 * - Capture screenshots using Playwright
 * - Compare screenshots using pixelmatch
 * - Generate diff images highlighting changes
 * - Calculate diff percentage
 * - Support configurable thresholds, anti-aliasing handling, and region masking
 */

export interface ScreenshotMetadata {
  url: string;
  timestamp: string;
  viewport: {
    width: number;
    height: number;
  };
  path: string;
}

export interface ComparisonResult {
  diffPixels: number;
  diffPercentage: number;
  totalPixels: number;
  diffImagePath: string;
  passed: boolean;
  threshold: number;
}

export interface CompareOptions {
  /** Per-pixel sensitivity (0-1 scale), default 0.1 */
  pixelThreshold?: number;
  /** Overall diff percentage to pass, default 5.0 */
  passPercentage?: number;
  /** Include anti-aliasing diffs, default false */
  includeAA?: boolean;
  /** Regions to ignore during comparison */
  ignoreRegions?: IgnoreRegion[];
}

export interface IgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Service for screenshot capture and comparison
 */
export class ScreenshotService {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Wait for page to be ready for screenshot capture.
   * Replaces the fixed 2-second wait with configurable, signal-based readiness.
   */
  async waitForPageReady(
    page: Page,
    options: {
      waitForSelector?: string;
      waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
      delay?: number;
    } = {},
  ): Promise<void> {
    const { waitForSelector, waitForLoadState = 'domcontentloaded', delay = 0 } = options;

    await page.waitForLoadState(waitForLoadState);

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, {
        state: 'visible',
        timeout: 10000,
      });
    }

    if (delay > 0) {
      await page.waitForTimeout(delay);
    }
  }

  /**
   * Capture screenshot of a page
   *
   * @param page - Playwright Page instance
   * @param url - URL to capture
   * @param filename - Output filename (without extension)
   * @param viewport - Viewport size (default: 1920x1080)
   * @returns Screenshot metadata
   */
  async captureScreenshot(
    page: Page,
    url: string,
    filename: string,
    viewport: { width: number; height: number } = { width: 1920, height: 1080 },
  ): Promise<ScreenshotMetadata> {
    try {
      // Set viewport
      await page.setViewportSize(viewport);

      // Navigate to URL
      console.log(`[Screenshot] Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000, // 30 second timeout
      });

      // Wait for page to be fully rendered
      await this.waitForPageReady(page, { waitForLoadState: 'networkidle', delay: 500 });

      // Capture screenshot
      const screenshotPath = join(this.outputDir, `${filename}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });

      console.log(`[Screenshot] ✓ Captured: ${screenshotPath}`);

      return {
        url,
        timestamp: new Date().toISOString(),
        viewport,
        path: screenshotPath,
      };
    } catch (error: any) {
      throw new Error(`Failed to capture screenshot of ${url}: ${error.message}`);
    }
  }

  /**
   * Capture screenshot using a ui-visual-testing.json screen entry.
   * Uses the entry's viewport, captureSelector, waitForSelector, and delay.
   */
  async captureWithConfig(
    page: Page,
    baseUrl: string,
    screenEntry: ScreenEntry,
    prefix: string,
  ): Promise<ScreenshotMetadata> {
    const url = `${baseUrl}${screenEntry.route}`;
    const label = screenEntry.label.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const viewportLabel = `${screenEntry.viewport.width}x${screenEntry.viewport.height}`;
    const filename = `${prefix}-${label}-${viewportLabel}`;

    try {
      await page.setViewportSize(screenEntry.viewport);

      console.log(`[Screenshot] Navigating to ${url} (${viewportLabel})...`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      await this.waitForPageReady(page, {
        waitForSelector: screenEntry.waitForSelector,
        waitForLoadState: 'domcontentloaded',
        delay: screenEntry.delay,
      });

      const screenshotPath = join(this.outputDir, `${filename}.png`);

      if (screenEntry.captureSelector) {
        const element = await page.$(screenEntry.captureSelector);
        if (element) {
          await element.screenshot({ path: screenshotPath });
        } else {
          console.warn(
            `[Screenshot] Selector "${screenEntry.captureSelector}" not found, capturing full page`,
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });
        }
      } else {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }

      console.log(`[Screenshot] ✓ Captured: ${screenshotPath}`);

      return {
        url,
        timestamp: new Date().toISOString(),
        viewport: screenEntry.viewport,
        path: screenshotPath,
      };
    } catch (error: any) {
      throw new Error(`Failed to capture screenshot of ${url}: ${error.message}`);
    }
  }

  /**
   * Capture multiple screenshots (common pages)
   *
   * @param page - Playwright Page instance
   * @param baseUrl - Base URL (e.g., http://localhost:3000)
   * @param routes - Routes to capture (e.g., ['/', '/about', '/dashboard'])
   * @param prefix - Filename prefix (e.g., 'before' or 'after')
   * @returns Array of screenshot metadata
   */
  async captureMultipleScreenshots(
    page: Page,
    baseUrl: string,
    routes: string[],
    prefix: string,
  ): Promise<ScreenshotMetadata[]> {
    const screenshots: ScreenshotMetadata[] = [];

    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      const filename = `${prefix}-${route.replace(/\//g, '_') || 'home'}`;

      try {
        const metadata = await this.captureScreenshot(page, url, filename);
        screenshots.push(metadata);
      } catch (error: any) {
        console.error(`[Screenshot] Failed to capture ${url}: ${error.message}`);
        // Continue with other routes even if one fails
      }
    }

    return screenshots;
  }

  /**
   * Compare two screenshots using pixelmatch.
   *
   * Accepts either the legacy number parameter (pixelThreshold) or a
   * CompareOptions object for full control over comparison behavior.
   *
   * @param beforePath - Path to "before" screenshot
   * @param afterPath - Path to "after" screenshot
   * @param diffOutputPath - Path to save diff image
   * @param options - Comparison options or legacy threshold number
   * @returns Comparison result
   */
  async compareScreenshots(
    beforePath: string,
    afterPath: string,
    diffOutputPath: string,
    options: CompareOptions | number = {},
  ): Promise<ComparisonResult> {
    // Backward compatibility: accept number as pixelThreshold
    const opts: CompareOptions =
      typeof options === 'number' ? { pixelThreshold: options } : options;

    const { pixelThreshold = 0.1, passPercentage = 5.0, includeAA = false, ignoreRegions } = opts;

    try {
      // Validate files exist
      if (!existsSync(beforePath)) {
        throw new Error(`Before screenshot not found: ${beforePath}`);
      }

      if (!existsSync(afterPath)) {
        throw new Error(`After screenshot not found: ${afterPath}`);
      }

      // Read images
      console.log(`[Screenshot] Comparing ${beforePath} vs ${afterPath}...`);

      const img1 = PNG.PNG.sync.read(readFileSync(beforePath));
      const img2 = PNG.PNG.sync.read(readFileSync(afterPath));

      // Handle dimension mismatch: resize to smaller dimensions
      if (img1.width !== img2.width || img1.height !== img2.height) {
        const widthDiff = Math.abs(img1.width - img2.width) / Math.min(img1.width, img2.width);
        const heightDiff = Math.abs(img1.height - img2.height) / Math.min(img1.height, img2.height);

        if (widthDiff > 0.2 || heightDiff > 0.2) {
          console.warn(
            `[Screenshot] ⚠ Image dimensions differ by >20%: ` +
              `${img1.width}x${img1.height} vs ${img2.width}x${img2.height}. ` +
              `This may indicate a viewport configuration issue.`,
          );
        }

        // For now, throw an error but with a more helpful message
        // Full dimension normalization via sharp will be added when sharp is installed
        throw new Error(
          `Image dimensions don't match: ` +
            `${img1.width}x${img1.height} vs ${img2.width}x${img2.height}. ` +
            `Ensure both captures use the same viewport and deviceScaleFactor.`,
        );
      }

      const { width, height } = img1;
      const totalPixels = width * height;

      // Apply ignore regions (paint both images with same color in masked areas)
      if (ignoreRegions && ignoreRegions.length > 0) {
        applyIgnoreRegions(img1.data, img2.data, width, ignoreRegions);
      }

      // Create diff image
      const diff = new PNG.PNG({ width, height });

      // Compare images with anti-aliasing handling
      const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
        threshold: pixelThreshold,
        includeAA,
      });

      // Calculate diff percentage
      const diffPercentage = (diffPixels / totalPixels) * 100;

      // Write diff image
      const diffBuffer = PNG.PNG.sync.write(diff);
      writeFileSync(diffOutputPath, diffBuffer);

      console.log(`[Screenshot] Diff: ${diffPixels} pixels (${diffPercentage.toFixed(2)}%)`);

      // Use configurable pass percentage (was hardcoded to 5.0)
      const passed = diffPercentage < passPercentage;

      return {
        diffPixels,
        diffPercentage,
        totalPixels,
        diffImagePath: diffOutputPath,
        passed,
        threshold: pixelThreshold,
      };
    } catch (error: any) {
      throw new Error(`Screenshot comparison failed: ${error.message}`);
    }
  }

  /**
   * Compare multiple screenshot pairs
   *
   * @param beforeScreenshots - Array of "before" screenshots
   * @param afterScreenshots - Array of "after" screenshots
   * @returns Array of comparison results
   */
  async compareMultipleScreenshots(
    beforeScreenshots: ScreenshotMetadata[],
    afterScreenshots: ScreenshotMetadata[],
  ): Promise<ComparisonResult[]> {
    const results: ComparisonResult[] = [];

    // Match screenshots by URL
    const screenshotPairs = beforeScreenshots.map((before) => {
      const after = afterScreenshots.find((a) => a.url === before.url);
      return { before, after };
    });

    for (const { before, after } of screenshotPairs) {
      if (!after) {
        console.error(`[Screenshot] No matching "after" screenshot for ${before.url}`);
        continue;
      }

      const diffFilename = before.path.replace('before-', 'diff-').replace(/\.png$/, '-diff.png');

      try {
        const result = await this.compareScreenshots(before.path, after.path, diffFilename);

        results.push(result);
      } catch (error: any) {
        console.error(`[Screenshot] Comparison failed for ${before.url}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Generate comparison report
   *
   * @param results - Array of comparison results
   * @param beforeScreenshots - Array of "before" screenshots
   * @returns Comparison report summary
   */
  generateComparisonReport(
    results: ComparisonResult[],
    beforeScreenshots: ScreenshotMetadata[],
  ): any {
    const totalComparisons = results.length;
    const passedComparisons = results.filter((r) => r.passed).length;
    const failedComparisons = totalComparisons - passedComparisons;

    const averageDiffPercentage =
      results.reduce((sum, r) => sum + r.diffPercentage, 0) / totalComparisons;

    const maxDiff = Math.max(...results.map((r) => r.diffPercentage));
    const minDiff = Math.min(...results.map((r) => r.diffPercentage));

    return {
      summary: {
        total_comparisons: totalComparisons,
        passed: passedComparisons,
        failed: failedComparisons,
        pass_rate: ((passedComparisons / totalComparisons) * 100).toFixed(2) + '%',
      },
      statistics: {
        average_diff_percentage: averageDiffPercentage.toFixed(2) + '%',
        max_diff_percentage: maxDiff.toFixed(2) + '%',
        min_diff_percentage: minDiff.toFixed(2) + '%',
      },
      details: results.map((result, index) => ({
        url: beforeScreenshots[index]?.url || 'Unknown',
        diff_percentage: result.diffPercentage.toFixed(2) + '%',
        diff_pixels: result.diffPixels,
        passed: result.passed,
        diff_image: result.diffImagePath,
      })),
    };
  }

  /**
   * Determine routes to capture based on project type
   *
   * @param projectPath - Path to project
   * @returns Array of routes to capture
   */
  async determineRoutesToCapture(projectPath: string): Promise<string[]> {
    // Default routes for most web applications
    const defaultRoutes = ['/', '/about', '/contact'];

    // TODO: Could be enhanced to:
    // - Parse routing config from framework-specific files
    // - Read from sitemap.xml
    // - Extract from Next.js/React Router configs
    // For now, return default routes

    return defaultRoutes;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Paint ignore regions with identical color on both images
 * so they produce zero diff in those areas.
 */
function applyIgnoreRegions(
  img1Data: Buffer,
  img2Data: Buffer,
  width: number,
  regions: IgnoreRegion[],
): void {
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        const idx = (y * width + x) * 4;
        // Set both images to same pixel value in this region
        img1Data[idx] = img2Data[idx] = 0;
        img1Data[idx + 1] = img2Data[idx + 1] = 0;
        img1Data[idx + 2] = img2Data[idx + 2] = 0;
        img1Data[idx + 3] = img2Data[idx + 3] = 255;
      }
    }
  }
}
