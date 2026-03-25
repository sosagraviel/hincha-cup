import { Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import PNG from 'pngjs';
import pixelmatch from 'pixelmatch';

/**
 * Screenshot Service
 *
 * Handles screenshot capture and comparison for visual regression testing:
 * - Capture screenshots using Playwright
 * - Compare screenshots using pixelmatch
 * - Generate diff images highlighting changes
 * - Calculate diff percentage
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
    viewport: { width: number; height: number } = { width: 1920, height: 1080 }
  ): Promise<ScreenshotMetadata> {
    try {
      // Set viewport
      await page.setViewportSize(viewport);

      // Navigate to URL
      console.log(`[Screenshot] Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000 // 30 second timeout
      });

      // Wait for page to be fully rendered
      await page.waitForTimeout(2000); // Wait 2s for any animations

      // Capture screenshot
      const screenshotPath = join(this.outputDir, `${filename}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });

      console.log(`[Screenshot] ✓ Captured: ${screenshotPath}`);

      return {
        url,
        timestamp: new Date().toISOString(),
        viewport,
        path: screenshotPath
      };

    } catch (error: any) {
      throw new Error(
        `Failed to capture screenshot of ${url}: ${error.message}`
      );
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
    prefix: string
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
   * Compare two screenshots using pixelmatch
   *
   * @param beforePath - Path to "before" screenshot
   * @param afterPath - Path to "after" screenshot
   * @param diffOutputPath - Path to save diff image
   * @param threshold - Pixel diff threshold (0-1, default: 0.1)
   * @returns Comparison result
   */
  async compareScreenshots(
    beforePath: string,
    afterPath: string,
    diffOutputPath: string,
    threshold: number = 0.1
  ): Promise<ComparisonResult> {
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

      // Validate dimensions match
      if (img1.width !== img2.width || img1.height !== img2.height) {
        throw new Error(
          `Image dimensions don't match: ` +
          `${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`
        );
      }

      const { width, height } = img1;
      const totalPixels = width * height;

      // Create diff image
      const diff = new PNG.PNG({ width, height });

      // Compare images
      const diffPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        width,
        height,
        { threshold }
      );

      // Calculate diff percentage
      const diffPercentage = (diffPixels / totalPixels) * 100;

      // Write diff image
      const diffBuffer = PNG.PNG.sync.write(diff);
      writeFileSync(diffOutputPath, diffBuffer);

      console.log(
        `[Screenshot] Diff: ${diffPixels} pixels (${diffPercentage.toFixed(2)}%)`
      );

      // Determine if test passed (< 5% diff)
      const passed = diffPercentage < 5.0;

      return {
        diffPixels,
        diffPercentage,
        totalPixels,
        diffImagePath: diffOutputPath,
        passed,
        threshold
      };

    } catch (error: any) {
      throw new Error(
        `Screenshot comparison failed: ${error.message}`
      );
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
    afterScreenshots: ScreenshotMetadata[]
  ): Promise<ComparisonResult[]> {
    const results: ComparisonResult[] = [];

    // Match screenshots by URL
    const screenshotPairs = beforeScreenshots.map(before => {
      const after = afterScreenshots.find(a => a.url === before.url);
      return { before, after };
    });

    for (const { before, after } of screenshotPairs) {
      if (!after) {
        console.error(`[Screenshot] No matching "after" screenshot for ${before.url}`);
        continue;
      }

      const diffFilename = before.path
        .replace('before-', 'diff-')
        .replace(/\.png$/, '-diff.png');

      try {
        const result = await this.compareScreenshots(
          before.path,
          after.path,
          diffFilename
        );

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
    beforeScreenshots: ScreenshotMetadata[]
  ): any {
    const totalComparisons = results.length;
    const passedComparisons = results.filter(r => r.passed).length;
    const failedComparisons = totalComparisons - passedComparisons;

    const averageDiffPercentage =
      results.reduce((sum, r) => sum + r.diffPercentage, 0) / totalComparisons;

    const maxDiff = Math.max(...results.map(r => r.diffPercentage));
    const minDiff = Math.min(...results.map(r => r.diffPercentage));

    return {
      summary: {
        total_comparisons: totalComparisons,
        passed: passedComparisons,
        failed: failedComparisons,
        pass_rate: ((passedComparisons / totalComparisons) * 100).toFixed(2) + '%'
      },
      statistics: {
        average_diff_percentage: averageDiffPercentage.toFixed(2) + '%',
        max_diff_percentage: maxDiff.toFixed(2) + '%',
        min_diff_percentage: minDiff.toFixed(2) + '%'
      },
      details: results.map((result, index) => ({
        url: beforeScreenshots[index]?.url || 'Unknown',
        diff_percentage: result.diffPercentage.toFixed(2) + '%',
        diff_pixels: result.diffPixels,
        passed: result.passed,
        diff_image: result.diffImagePath
      }))
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
