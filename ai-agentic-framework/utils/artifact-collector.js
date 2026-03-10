/**
 * Artifact Collector Utility
 *
 * Collects test artifacts (screenshots, videos, test results, coverage reports) for PR documentation.
 *
 * Usage:
 *   const collector = new ArtifactCollector('PROJ-123', '/path/to/project');
 *   await collector.collect();
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');
const { glob } = require('glob');

class ArtifactCollector {
  constructor(jiraKey, projectRoot) {
    this.jiraKey = jiraKey;
    this.projectRoot = projectRoot;
    this.artifactsDir = path.join(projectRoot, `.claude/artifacts/${jiraKey}`);
    this.artifacts = {
      screenshots: [],
      videos: [],
      testResults: [],
      coverage: [],
      traces: []
    };
  }

  /**
   * Collect all artifacts
   * @returns {Promise<Object>} Collected artifacts
   */
  async collect() {
    console.log(`[ArtifactCollector] Collecting artifacts for ${this.jiraKey}`);

    // Ensure artifacts directory exists
    await this.ensureArtifactsDirectory();

    // Collect different artifact types
    await this.collectScreenshots();
    await this.collectVideos();
    await this.collectTestResults();
    await this.collectCoverage();
    await this.collectTraces();

    // Generate manifest
    await this.generateManifest();

    console.log(`[ArtifactCollector] Collection complete`);

    return this.artifacts;
  }

  /**
   * Ensure artifacts directory exists
   */
  async ensureArtifactsDirectory() {
    if (!existsSync(this.artifactsDir)) {
      await fs.mkdir(this.artifactsDir, { recursive: true });
    }

    // Create subdirectories
    const subdirs = ['screenshots', 'videos', 'test-results', 'coverage', 'traces'];
    for (const subdir of subdirs) {
      const subdirPath = path.join(this.artifactsDir, subdir);
      if (!existsSync(subdirPath)) {
        await fs.mkdir(subdirPath, { recursive: true });
      }
    }
  }

  /**
   * Collect screenshots
   */
  async collectScreenshots() {
    const screenshotPatterns = [
      '**/screenshots/**/*.{png,jpg,jpeg}',
      '**/test-results/**/*.{png,jpg,jpeg}',
      '**/.claude/screenshots/**/*.{png,jpg,jpeg}',
      '**/playwright-report/**/*.{png,jpg,jpeg}'
    ];

    for (const pattern of screenshotPatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.projectRoot,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        });

        for (const file of files) {
          await this.copyArtifact(file, 'screenshots');
        }
      } catch (error) {
        // Pattern may not match, continue
      }
    }

    console.log(`[ArtifactCollector] Collected ${this.artifacts.screenshots.length} screenshots`);
  }

  /**
   * Collect videos
   */
  async collectVideos() {
    const videoPatterns = [
      '**/test-results/**/*.{webm,mp4}',
      '**/videos/**/*.{webm,mp4}',
      '**/playwright-report/**/*.{webm,mp4}',
      '**/cypress/videos/**/*.mp4'
    ];

    for (const pattern of videoPatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.projectRoot,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        });

        for (const file of files) {
          await this.copyArtifact(file, 'videos');
        }
      } catch (error) {
        // Pattern may not match, continue
      }
    }

    console.log(`[ArtifactCollector] Collected ${this.artifacts.videos.length} videos`);
  }

  /**
   * Collect test results
   */
  async collectTestResults() {
    const testResultPatterns = [
      '**/test-results/**/*.{json,xml}',
      '**/junit.xml',
      '**/test-report.json',
      '**/.jest-test-results.json',
      '**/coverage/**/lcov.info'
    ];

    for (const pattern of testResultPatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.projectRoot,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        });

        for (const file of files) {
          await this.copyArtifact(file, 'test-results');
        }
      } catch (error) {
        // Pattern may not match, continue
      }
    }

    console.log(`[ArtifactCollector] Collected ${this.artifacts.testResults.length} test result files`);
  }

  /**
   * Collect coverage reports
   */
  async collectCoverage() {
    const coveragePatterns = [
      '**/coverage/**/index.html',
      '**/coverage/**/coverage-summary.json',
      '**/htmlcov/index.html', // Python coverage
      '**/target/**/jacoco/**/*.html', // Java Jacoco
      '**/target/tarpaulin-report.html' // Rust tarpaulin
    ];

    for (const pattern of coveragePatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.projectRoot,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        });

        for (const file of files) {
          await this.copyArtifact(file, 'coverage');
        }
      } catch (error) {
        // Pattern may not match, continue
      }
    }

    console.log(`[ArtifactCollector] Collected ${this.artifacts.coverage.length} coverage reports`);
  }

  /**
   * Collect Playwright traces
   */
  async collectTraces() {
    const tracePatterns = [
      '**/test-results/**/*.zip',
      '**/traces/**/*.zip'
    ];

    for (const pattern of tracePatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.projectRoot,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        });

        for (const file of files) {
          await this.copyArtifact(file, 'traces');
        }
      } catch (error) {
        // Pattern may not match, continue
      }
    }

    console.log(`[ArtifactCollector] Collected ${this.artifacts.traces.length} trace files`);
  }

  /**
   * Copy artifact to artifacts directory
   * @param {string} sourcePath - Source file path
   * @param {string} category - Artifact category
   */
  async copyArtifact(sourcePath, category) {
    const fileName = path.basename(sourcePath);
    const destPath = path.join(this.artifactsDir, category, fileName);

    try {
      await fs.copyFile(sourcePath, destPath);

      const stats = await fs.stat(destPath);

      this.artifacts[category].push({
        fileName,
        sourcePath,
        destPath,
        relativePath: path.relative(this.projectRoot, destPath),
        size: stats.size,
        collectedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error(`[ArtifactCollector] Error copying ${sourcePath}:`, error.message);
    }
  }

  /**
   * Generate manifest file
   */
  async generateManifest() {
    const manifest = {
      jiraKey: this.jiraKey,
      collectedAt: new Date().toISOString(),
      summary: {
        screenshots: this.artifacts.screenshots.length,
        videos: this.artifacts.videos.length,
        testResults: this.artifacts.testResults.length,
        coverage: this.artifacts.coverage.length,
        traces: this.artifacts.traces.length
      },
      artifacts: this.artifacts
    };

    const manifestPath = path.join(this.artifactsDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    console.log(`[ArtifactCollector] Manifest written to ${manifestPath}`);
  }

  /**
   * Generate PR-ready markdown documentation
   * @param {Object} testResults - Test results from TestOrchestrator
   * @returns {Promise<string>} Markdown content
   */
  async generatePRDocumentation(testResults) {
    let markdown = '';

    // Visual Changes Section
    if (this.artifacts.screenshots.length > 0) {
      markdown += '## 📸 Visual Changes\n\n';

      // Group screenshots by before/after
      const beforeScreenshots = this.artifacts.screenshots.filter(s => s.fileName.includes('before'));
      const afterScreenshots = this.artifacts.screenshots.filter(s => s.fileName.includes('after'));

      if (beforeScreenshots.length > 0 && afterScreenshots.length > 0) {
        markdown += '### Before vs After\n\n';

        for (let i = 0; i < Math.min(beforeScreenshots.length, afterScreenshots.length); i++) {
          markdown += `| Before | After |\n`;
          markdown += `|--------|-------|\n`;
          markdown += `| ![Before](${beforeScreenshots[i].relativePath}) | ![After](${afterScreenshots[i].relativePath}) |\n\n`;
        }
      } else {
        // Just list all screenshots
        for (const screenshot of this.artifacts.screenshots) {
          markdown += `![${screenshot.fileName}](${screenshot.relativePath})\n\n`;
        }
      }
    }

    // Test Results Section
    if (testResults) {
      markdown += '## ✅ Test Results\n\n';

      // Unit Tests
      if (testResults.unit && testResults.unit.length > 0) {
        markdown += '### Unit Tests\n\n';
        for (const result of testResults.unit) {
          markdown += `**${result.framework}** (${result.language}):\n`;
          markdown += `- Total: ${result.total} tests\n`;
          markdown += `- Passed: ${result.passed} ✓\n`;
          markdown += `- Failed: ${result.failed}\n`;
          if (result.coverage) {
            markdown += `- Coverage: ${result.coverage}%\n`;
          }
          markdown += `\n`;
        }
      }

      // Integration Tests
      if (testResults.integration && testResults.integration.length > 0) {
        markdown += '### Integration Tests\n\n';
        for (const result of testResults.integration) {
          markdown += `**${result.framework}** (${result.language}):\n`;
          markdown += `- Total: ${result.total} tests\n`;
          markdown += `- Passed: ${result.passed} ✓\n`;
          markdown += `- Failed: ${result.failed}\n`;
          markdown += `\n`;
        }
      }

      // E2E Tests
      if (testResults.e2e && testResults.e2e.length > 0) {
        markdown += '### E2E Tests\n\n';
        for (const result of testResults.e2e) {
          markdown += `**${result.framework}** (${result.language}):\n`;
          markdown += `- Total: ${result.total} tests\n`;
          markdown += `- Passed: ${result.passed} ✓\n`;
          markdown += `- Failed: ${result.failed}\n`;
          markdown += `- Duration: ${Math.round(result.duration / 1000)}s\n`;
          markdown += `\n`;
        }
      }
    }

    // Videos Section
    if (this.artifacts.videos.length > 0) {
      markdown += '## 🎥 Test Recordings\n\n';

      for (const video of this.artifacts.videos) {
        markdown += `- [${video.fileName}](${video.relativePath})\n`;
      }

      markdown += `\n`;
    }

    // Coverage Section
    if (this.artifacts.coverage.length > 0) {
      markdown += '## 📊 Coverage Reports\n\n';

      for (const coverage of this.artifacts.coverage) {
        markdown += `- [${coverage.fileName}](${coverage.relativePath})\n`;
      }

      markdown += `\n`;
    }

    return markdown;
  }

  /**
   * Clean up artifacts
   */
  async cleanup() {
    if (existsSync(this.artifactsDir)) {
      await fs.rm(this.artifactsDir, { recursive: true, force: true });
      console.log(`[ArtifactCollector] Cleaned up artifacts for ${this.jiraKey}`);
    }
  }

  /**
   * Get artifact summary
   * @returns {Object} Summary
   */
  getSummary() {
    return {
      jiraKey: this.jiraKey,
      artifactsDir: this.artifactsDir,
      screenshots: this.artifacts.screenshots.length,
      videos: this.artifacts.videos.length,
      testResults: this.artifacts.testResults.length,
      coverage: this.artifacts.coverage.length,
      traces: this.artifacts.traces.length,
      totalSize: this.calculateTotalSize()
    };
  }

  /**
   * Calculate total size of artifacts
   * @returns {number} Total size in bytes
   */
  calculateTotalSize() {
    let totalSize = 0;

    for (const category of Object.values(this.artifacts)) {
      for (const artifact of category) {
        totalSize += artifact.size || 0;
      }
    }

    return totalSize;
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Bytes
   * @returns {string} Formatted string
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = { ArtifactCollector };
