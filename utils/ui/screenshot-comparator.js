/**
 * Screenshot Comparator Utility
 *
 * Visual diff calculation using pixelmatch.
 * Compares before/after screenshots with expected designs.
 *
 * Usage:
 *   const comparator = new ScreenshotComparator('PROJ-123');
 *   const report = await comparator.compareScreenshots(beforeDir, afterDir, expectedDir);
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

class ScreenshotComparator {
  constructor(jiraKey, options = {}) {
    this.jiraKey = jiraKey;
    this.options = {
      threshold: options.threshold || 0.1, // Pixelmatch threshold (0-1)
      maxDiffPercent: options.maxDiffPercent || 5, // Max acceptable diff percentage
      includeAntiAliasing: options.includeAntiAliasing !== false,
      ...options
    };
    this.diffDir = path.join(options.projectRoot || process.cwd(), `.claude/screenshots/${jiraKey}/diffs`);
  }

  /**
   * Compare screenshots from before/after/expected directories
   * @param {string} beforeDir - Before screenshots directory
   * @param {string} afterDir - After screenshots directory
   * @param {string} expectedDir - Expected screenshots directory (optional)
   * @returns {Promise<Object>} Comparison report
   */
  async compareScreenshots(beforeDir, afterDir, expectedDir = null) {
    console.log('[ScreenshotComparator] Starting visual comparison...');

    // Ensure diff directory exists
    await this.ensureDiffDirectory();

    const comparisons = [];

    // Get all screenshots from after directory
    const afterFiles = await this.getScreenshotFiles(afterDir);

    for (const afterFile of afterFiles) {
      console.log(`[ScreenshotComparator] Comparing ${afterFile}...`);

      let comparison = null;

      // Priority 1: Compare with expected design if available
      if (expectedDir) {
        const expectedPath = path.join(expectedDir, afterFile);
        if (existsSync(expectedPath)) {
          comparison = await this.compareImages(
            expectedPath,
            path.join(afterDir, afterFile),
            `expected-vs-after-${afterFile}`
          );
          comparison.comparisonType = 'expected-vs-after';
        }
      }

      // Priority 2: Compare with before screenshot
      if (!comparison) {
        const beforePath = path.join(beforeDir, afterFile.replace('-after-', '-before-'));
        if (existsSync(beforePath)) {
          comparison = await this.compareImages(
            beforePath,
            path.join(afterDir, afterFile),
            `before-vs-after-${afterFile}`
          );
          comparison.comparisonType = 'before-vs-after';
        }
      }

      if (comparison) {
        comparisons.push({
          ...comparison,
          fileName: afterFile
        });
      } else {
        console.warn(`[ScreenshotComparator] No comparison baseline found for ${afterFile}`);
      }
    }

    // Generate report
    const report = this.generateReport(comparisons);

    // Save report
    await this.saveReport(report);

    console.log('[ScreenshotComparator] Comparison complete');
    console.log(`[ScreenshotComparator] Overall score: ${report.overallScore.toFixed(2)}%`);
    console.log(`[ScreenshotComparator] Status: ${report.status}`);

    return report;
  }

  /**
   * Compare two images
   * @param {string} image1Path - Path to first image
   * @param {string} image2Path - Path to second image
   * @param {string} diffFileName - Diff image file name
   * @returns {Promise<Object>} Comparison result
   */
  async compareImages(image1Path, image2Path, diffFileName) {
    try {
      // Read images
      const img1 = PNG.sync.read(await fs.readFile(image1Path));
      const img2 = PNG.sync.read(await fs.readFile(image2Path));

      // Check if dimensions match
      if (img1.width !== img2.width || img1.height !== img2.height) {
        return {
          image1: image1Path,
          image2: image2Path,
          diffImage: null,
          diffPixels: null,
          diffPercent: 100,
          status: 'FAIL',
          error: `Image dimensions mismatch: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`
        };
      }

      // Create diff image
      const diff = new PNG({ width: img1.width, height: img1.height });

      // Compare images
      const diffPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        img1.width,
        img1.height,
        {
          threshold: this.options.threshold,
          includeAA: this.options.includeAntiAliasing
        }
      );

      const totalPixels = img1.width * img1.height;
      const diffPercent = (diffPixels / totalPixels) * 100;

      // Save diff image
      const diffPath = path.join(this.diffDir, diffFileName);
      await fs.writeFile(diffPath, PNG.sync.write(diff));

      // Determine status
      let status = 'PASS';
      if (diffPercent > this.options.maxDiffPercent) {
        status = 'FAIL';
      } else if (diffPercent > this.options.maxDiffPercent / 2) {
        status = 'WARN';
      }

      return {
        image1: image1Path,
        image2: image2Path,
        diffImage: diffPath,
        diffPixels,
        totalPixels,
        diffPercent: diffPercent.toFixed(2),
        status,
        passed: status === 'PASS'
      };

    } catch (error) {
      console.error(`[ScreenshotComparator] Error comparing images:`, error.message);
      return {
        image1: image1Path,
        image2: image2Path,
        diffImage: null,
        diffPixels: null,
        diffPercent: null,
        status: 'ERROR',
        error: error.message
      };
    }
  }

  /**
   * Generate comparison report
   * @param {Array} comparisons - Array of comparison results
   * @returns {Object} Report
   */
  generateReport(comparisons) {
    const totalComparisons = comparisons.length;
    const passedComparisons = comparisons.filter(c => c.status === 'PASS').length;
    const failedComparisons = comparisons.filter(c => c.status === 'FAIL').length;
    const warnComparisons = comparisons.filter(c => c.status === 'WARN').length;
    const errorComparisons = comparisons.filter(c => c.status === 'ERROR').length;

    // Calculate overall diff score (average)
    const validComparisons = comparisons.filter(c => c.diffPercent !== null);
    const overallScore = validComparisons.length > 0
      ? validComparisons.reduce((sum, c) => sum + parseFloat(c.diffPercent), 0) / validComparisons.length
      : 0;

    // Determine overall status
    let overallStatus = 'PASS';
    if (failedComparisons > 0 || errorComparisons > 0) {
      overallStatus = 'FAIL';
    } else if (warnComparisons > 0) {
      overallStatus = 'WARN';
    }

    return {
      jiraKey: this.jiraKey,
      timestamp: new Date().toISOString(),
      summary: {
        total: totalComparisons,
        passed: passedComparisons,
        failed: failedComparisons,
        warnings: warnComparisons,
        errors: errorComparisons
      },
      overallScore: parseFloat(overallScore.toFixed(2)),
      status: overallStatus,
      maxDiffPercent: this.options.maxDiffPercent,
      comparisons: comparisons.map(c => ({
        fileName: c.fileName,
        comparisonType: c.comparisonType,
        diffPercent: c.diffPercent,
        status: c.status,
        diffImage: c.diffImage ? path.relative(process.cwd(), c.diffImage) : null,
        error: c.error
      })),
      recommendations: this.generateRecommendations(comparisons, overallStatus)
    };
  }

  /**
   * Generate fix recommendations
   * @param {Array} comparisons - Array of comparison results
   * @param {string} overallStatus - Overall status
   * @returns {Array} Array of recommendations
   */
  generateRecommendations(comparisons, overallStatus) {
    const recommendations = [];

    if (overallStatus === 'PASS') {
      recommendations.push({
        type: 'success',
        message: 'All visual changes are within acceptable threshold. Ready to proceed.'
      });
      return recommendations;
    }

    // Analyze failed comparisons
    const failedComparisons = comparisons.filter(c => c.status === 'FAIL');

    for (const comparison of failedComparisons) {
      const diffPercent = parseFloat(comparison.diffPercent);

      if (diffPercent > 50) {
        recommendations.push({
          type: 'critical',
          file: comparison.fileName,
          message: `Major visual differences detected (${diffPercent.toFixed(2)}%). Review layout, colors, and positioning.`,
          diffImage: comparison.diffImage
        });
      } else if (diffPercent > 20) {
        recommendations.push({
          type: 'major',
          file: comparison.fileName,
          message: `Significant visual differences (${diffPercent.toFixed(2)}%). Check styling, spacing, and responsive behavior.`,
          diffImage: comparison.diffImage
        });
      } else {
        recommendations.push({
          type: 'minor',
          file: comparison.fileName,
          message: `Minor visual differences (${diffPercent.toFixed(2)}%). Review fonts, borders, or subtle styling issues.`,
          diffImage: comparison.diffImage
        });
      }
    }

    return recommendations;
  }

  /**
   * Save comparison report
   * @param {Object} report - Comparison report
   */
  async saveReport(report) {
    const reportPath = path.join(this.diffDir, 'visual-diff-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[ScreenshotComparator] Report saved to ${reportPath}`);
  }

  /**
   * Get screenshot files from directory
   * @param {string} dir - Directory path
   * @returns {Promise<Array>} Array of file names
   */
  async getScreenshotFiles(dir) {
    if (!existsSync(dir)) {
      return [];
    }

    const files = await fs.readdir(dir);
    return files.filter(f => f.endsWith('.png'));
  }

  /**
   * Ensure diff directory exists
   */
  async ensureDiffDirectory() {
    if (!existsSync(this.diffDir)) {
      await fs.mkdir(this.diffDir, { recursive: true });
    }
  }

  /**
   * Generate markdown summary for PR
   * @param {Object} report - Comparison report
   * @returns {string} Markdown content
   */
  static generateMarkdownSummary(report) {
    let markdown = `## 🎨 Visual Verification\n\n`;

    markdown += `**Overall Diff Score**: ${report.overallScore.toFixed(2)}% `;

    if (report.status === 'PASS') {
      markdown += `✅ **PASSED**\n\n`;
    } else if (report.status === 'WARN') {
      markdown += `⚠️ **WARNING**\n\n`;
    } else {
      markdown += `❌ **FAILED**\n\n`;
    }

    markdown += `**Summary**:\n`;
    markdown += `- Total Comparisons: ${report.summary.total}\n`;
    markdown += `- Passed: ${report.summary.passed} ✓\n`;
    markdown += `- Failed: ${report.summary.failed}\n`;
    if (report.summary.warnings > 0) {
      markdown += `- Warnings: ${report.summary.warnings}\n`;
    }
    if (report.summary.errors > 0) {
      markdown += `- Errors: ${report.summary.errors}\n`;
    }
    markdown += `\n`;

    // Show failed comparisons
    if (report.summary.failed > 0) {
      markdown += `### ❌ Failed Comparisons\n\n`;

      const failedComparisons = report.comparisons.filter(c => c.status === 'FAIL');
      for (const comparison of failedComparisons) {
        markdown += `**${comparison.fileName}**\n`;
        markdown += `- Diff: ${comparison.diffPercent}%\n`;
        if (comparison.diffImage) {
          markdown += `- [View Diff](${comparison.diffImage})\n`;
        }
        markdown += `\n`;
      }
    }

    // Show recommendations
    if (report.recommendations && report.recommendations.length > 0) {
      markdown += `### 💡 Recommendations\n\n`;

      for (const rec of report.recommendations) {
        const icon = rec.type === 'success' ? '✅' : rec.type === 'critical' ? '🔴' : rec.type === 'major' ? '🟠' : '🟡';
        markdown += `${icon} ${rec.message}\n`;
        if (rec.diffImage) {
          markdown += `   - [View Diff](${rec.diffImage})\n`;
        }
      }
      markdown += `\n`;
    }

    return markdown;
  }

  /**
   * Cleanup diff images
   */
  async cleanup() {
    if (existsSync(this.diffDir)) {
      await fs.rm(this.diffDir, { recursive: true, force: true });
      console.log(`[ScreenshotComparator] Cleaned up diff images`);
    }
  }
}

module.exports = { ScreenshotComparator };
