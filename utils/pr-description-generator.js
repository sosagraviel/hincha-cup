#!/usr/bin/env node

/**
 * PR Description Generator
 *
 * Generates comprehensive GitHub Pull Request descriptions from artifacts collected
 * during the implement-ticket workflow (Phases 0-7). Creates rich, informative PR
 * descriptions with test results, visual changes, implementation details, and more.
 *
 * This is a specialized version extracted from ArtifactCollector for enhanced
 * PR description generation with additional formatting and structure.
 *
 * @module pr-description-generator
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * PR Description Template Sections
 */
const TEMPLATES = {
  header: (jiraKey, title) => `## ${jiraKey}: ${title}\n\n`,

  summary: (summary) => `### Summary\n\n${summary}\n\n`,

  visualChanges: (hasVisuals, visualReport) => {
    if (!hasVisuals) return '';

    return `### 🎨 Visual Changes\n\n${visualReport}\n\n`;
  },

  testResults: (testResults) => {
    if (!testResults || !testResults.overall) return '';

    const { overall, unit, integration, e2e } = testResults;
    const emoji = overall.status === 'passed' ? '✅' : '❌';

    let section = `### ${emoji} Test Results\n\n`;
    section += `**Overall Status:** ${overall.status}\n\n`;

    if (unit) {
      section += `- **Unit Tests:** ${unit.passed}/${unit.total} passed (${unit.coverage || 0}% coverage)\n`;
    }
    if (integration) {
      section += `- **Integration Tests:** ${integration.passed}/${integration.total} passed\n`;
    }
    if (e2e) {
      section += `- **E2E Tests:** ${e2e.passed}/${e2e.total} passed\n`;
    }

    section += '\n';
    return section;
  },

  implementationDetails: (implLog) => {
    if (!implLog) return '';

    return `### 📝 Implementation Details\n\n${implLog}\n\n`;
  },

  filesChanged: (files) => {
    if (!files || files.length === 0) return '';

    let section = `### 📂 Files Changed\n\n`;

    const grouped = {
      created: files.filter(f => f.status === 'created'),
      updated: files.filter(f => f.status === 'updated'),
      deleted: files.filter(f => f.status === 'deleted')
    };

    if (grouped.created.length > 0) {
      section += `**Created (${grouped.created.length}):**\n`;
      grouped.created.forEach(f => {
        section += `- \`${f.path}\`\n`;
      });
      section += '\n';
    }

    if (grouped.updated.length > 0) {
      section += `**Updated (${grouped.updated.length}):**\n`;
      grouped.updated.forEach(f => {
        section += `- \`${f.path}\`\n`;
      });
      section += '\n';
    }

    if (grouped.deleted.length > 0) {
      section += `**Deleted (${grouped.deleted.length}):**\n`;
      grouped.deleted.forEach(f => {
        section += `- \`${f.path}\`\n`;
      });
      section += '\n';
    }

    return section;
  },

  securityFindings: (securityResults) => {
    if (!securityResults || securityResults.overallStatus === 'PASS') {
      return `### 🔒 Security\n\n✅ No security issues detected\n\n`;
    }

    const { findings, metrics } = securityResults;

    let section = `### 🔒 Security\n\n`;

    if (metrics.blockingCount > 0) {
      section += `⚠️ **${metrics.blockingCount} blocking security issues found**\n\n`;
    } else if (metrics.majorCount > 0) {
      section += `⚠️ **${metrics.majorCount} major security issues found**\n\n`;
    }

    if (findings.blocking && findings.blocking.length > 0) {
      section += `**Blocking Issues:**\n`;
      findings.blocking.slice(0, 3).forEach(f => {
        section += `- ${f.issue} (\`${f.file}:${f.line}\`)\n`;
      });
      section += '\n';
    }

    return section;
  },

  autonomousDecisions: (decisions) => {
    if (!decisions || decisions.length === 0) return '';

    let section = `### 🤖 Autonomous Decisions\n\n`;
    section += `During implementation, ${decisions.length} design decisions were made autonomously:\n\n`;

    decisions.slice(0, 5).forEach((decision, idx) => {
      section += `${idx + 1}. **${decision.decision}**\n`;
      section += `   - Rationale: ${decision.rationale}\n`;
      if (decision.alternatives) {
        section += `   - Alternatives considered: ${decision.alternatives.join(', ')}\n`;
      }
      section += '\n';
    });

    if (decisions.length > 5) {
      section += `_...and ${decisions.length - 5} more (see decisions/${this.jiraKey}.md)_\n\n`;
    }

    return section;
  },

  artifacts: (artifacts) => {
    if (!artifacts || Object.keys(artifacts).length === 0) return '';

    let section = `### 📦 Artifacts\n\n`;

    if (artifacts.screenshots > 0) {
      section += `- 📸 Screenshots: ${artifacts.screenshots} captured\n`;
    }
    if (artifacts.videos > 0) {
      section += `- 🎥 Videos: ${artifacts.videos} recordings\n`;
    }
    if (artifacts.coverage > 0) {
      section += `- 📊 Coverage Reports: ${artifacts.coverage} reports\n`;
    }
    if (artifacts.traces > 0) {
      section += `- 🔍 Traces: ${artifacts.traces} files\n`;
    }

    section += '\n';
    return section;
  },

  footer: () => `\n---\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>\n`
};

/**
 * Main PRDescriptionGenerator class
 */
class PRDescriptionGenerator {
  constructor(projectRoot, jiraKey) {
    this.projectRoot = projectRoot;
    this.jiraKey = jiraKey;
    this.artifactsDir = path.join(projectRoot, '.claude', 'artifacts', jiraKey);
  }

  /**
   * Generate comprehensive PR description
   *
   * @returns {Promise<string>} - Markdown formatted PR description
   */
  async generate() {
    try {
      console.log('📝 Generating PR description...');

      // Load all artifacts
      const artifacts = await this.loadArtifacts();

      // Build PR description sections
      let description = '';

      // Header
      description += TEMPLATES.header(this.jiraKey, artifacts.title || 'Implementation');

      // Summary
      if (artifacts.summary) {
        description += TEMPLATES.summary(artifacts.summary);
      }

      // Visual Changes
      if (artifacts.visualChanges) {
        description += TEMPLATES.visualChanges(
          artifacts.visualChanges.hasChanges,
          artifacts.visualChanges.report
        );
      }

      // Test Results
      if (artifacts.testResults) {
        description += TEMPLATES.testResults(artifacts.testResults);
      }

      // Security Findings
      if (artifacts.securityResults) {
        description += TEMPLATES.securityFindings(artifacts.securityResults);
      }

      // Implementation Details (condensed)
      if (artifacts.implementationLog) {
        const condensed = this.condenseImplementationLog(artifacts.implementationLog);
        description += TEMPLATES.implementationDetails(condensed);
      }

      // Files Changed
      if (artifacts.filesChanged) {
        description += TEMPLATES.filesChanged(artifacts.filesChanged);
      }

      // Autonomous Decisions
      if (artifacts.autonomousDecisions) {
        description += TEMPLATES.autonomousDecisions(artifacts.autonomousDecisions);
      }

      // Artifacts Summary
      const artifactCounts = {
        screenshots: artifacts.screenshots?.length || 0,
        videos: artifacts.videos?.length || 0,
        coverage: artifacts.coverageReports?.length || 0,
        traces: artifacts.traces?.length || 0
      };
      description += TEMPLATES.artifacts(artifactCounts);

      // Footer
      description += TEMPLATES.footer();

      // Write to file
      const outputPath = path.join(this.artifactsDir, 'pr-description.md');
      fs.writeFileSync(outputPath, description);

      console.log(`✅ PR description generated: ${outputPath}`);

      return description;

    } catch (error) {
      console.error('❌ PR description generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Load all artifacts from the artifacts directory
   *
   * @returns {Promise<Object>} - Artifacts object
   */
  async loadArtifacts() {
    const artifacts = {};

    // Load context
    const contextPath = path.join(this.artifactsDir, 'context', 'full-context.md');
    if (fs.existsSync(contextPath)) {
      artifacts.context = fs.readFileSync(contextPath, 'utf8');
      artifacts.title = this.extractTitleFromContext(artifacts.context);
    }

    // Load implementation plan
    const planPath = path.join(this.artifactsDir, 'plans', 'implementation-plan.md');
    if (fs.existsSync(planPath)) {
      artifacts.plan = fs.readFileSync(planPath, 'utf8');
      artifacts.summary = this.extractSummaryFromPlan(artifacts.plan);
    }

    // Load implementation log
    const implLogPath = path.join(this.artifactsDir, 'implementations', 'implementation-log.md');
    if (fs.existsSync(implLogPath)) {
      artifacts.implementationLog = fs.readFileSync(implLogPath, 'utf8');
      artifacts.filesChanged = this.extractFilesFromLog(artifacts.implementationLog);
    }

    // Load test results
    const testResultsPath = path.join(this.artifactsDir, 'tests', 'test-results.json');
    if (fs.existsSync(testResultsPath)) {
      artifacts.testResults = JSON.parse(fs.readFileSync(testResultsPath, 'utf8'));
    }

    // Load visual verification results
    const visualReportPath = path.join(this.artifactsDir, 'screenshots', 'diffs', 'visual-diff-report.json');
    if (fs.existsSync(visualReportPath)) {
      const visualReport = JSON.parse(fs.readFileSync(visualReportPath, 'utf8'));
      artifacts.visualChanges = {
        hasChanges: visualReport.overallStatus !== 'pass',
        report: this.formatVisualReport(visualReport)
      };
    }

    // Load security results
    const securityPath = path.join(this.artifactsDir, 'security', 'security-results.json');
    if (fs.existsSync(securityPath)) {
      artifacts.securityResults = JSON.parse(fs.readFileSync(securityPath, 'utf8'));
    }

    // Load autonomous decisions
    const decisionsPath = path.join(this.artifactsDir, 'decisions', `${this.jiraKey}.md`);
    if (fs.existsSync(decisionsPath)) {
      const decisionsContent = fs.readFileSync(decisionsPath, 'utf8');
      artifacts.autonomousDecisions = this.parseDecisions(decisionsContent);
    }

    // Load screenshot/video/coverage/trace counts
    artifacts.screenshots = this.countFiles(path.join(this.artifactsDir, 'screenshots'));
    artifacts.videos = this.countFiles(path.join(this.artifactsDir, 'videos'));
    artifacts.coverageReports = this.countFiles(path.join(this.artifactsDir, 'coverage'));
    artifacts.traces = this.countFiles(path.join(this.artifactsDir, 'traces'));

    return artifacts;
  }

  /**
   * Extract ticket title from context
   *
   * @param {string} context - Context markdown
   * @returns {string}
   */
  extractTitleFromContext(context) {
    const match = context.match(/# (.+)/);
    return match ? match[1] : 'Implementation';
  }

  /**
   * Extract summary from implementation plan
   *
   * @param {string} plan - Implementation plan markdown
   * @returns {string}
   */
  extractSummaryFromPlan(plan) {
    const match = plan.match(/## Summary\n\n(.+?)\n\n/s);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract changed files from implementation log
   *
   * @param {string} log - Implementation log
   * @returns {Array<{path: string, status: string}>}
   */
  extractFilesFromLog(log) {
    const files = [];

    // Extract created files
    const createdRegex = /Created:\s+`([^`]+)`/g;
    let match;
    while ((match = createdRegex.exec(log)) !== null) {
      files.push({ path: match[1], status: 'created' });
    }

    // Extract updated files
    const updatedRegex = /Updated:\s+`([^`]+)`/g;
    while ((match = updatedRegex.exec(log)) !== null) {
      files.push({ path: match[1], status: 'updated' });
    }

    // Extract deleted files
    const deletedRegex = /Deleted:\s+`([^`]+)`/g;
    while ((match = deletedRegex.exec(log)) !== null) {
      files.push({ path: match[1], status: 'deleted' });
    }

    return files;
  }

  /**
   * Format visual verification report
   *
   * @param {Object} report - Visual diff report
   * @returns {string}
   */
  formatVisualReport(report) {
    if (!report || report.overallStatus === 'pass') {
      return 'No visual changes detected';
    }

    let formatted = `Visual changes detected (${report.overallScore}% match):\n\n`;

    if (report.diffs && report.diffs.length > 0) {
      report.diffs.forEach((diff, idx) => {
        if (diff.diffPercentage > 1) { // Only show significant diffs
          formatted += `- **${diff.page}** (${diff.viewport}): ${diff.diffPercentage.toFixed(2)}% difference\n`;
        }
      });
    }

    return formatted;
  }

  /**
   * Parse autonomous decisions from markdown
   *
   * @param {string} content - Decisions markdown
   * @returns {Array<Object>}
   */
  parseDecisions(content) {
    const decisions = [];
    const decisionRegex = /## Decision: (.+?)\n\n(.+?)\n\n/gs;
    let match;

    while ((match = decisionRegex.exec(content)) !== null) {
      decisions.push({
        decision: match[1].trim(),
        rationale: match[2].trim()
      });
    }

    return decisions;
  }

  /**
   * Condense implementation log to key highlights
   *
   * @param {string} log - Implementation log
   * @returns {string}
   */
  condenseImplementationLog(log) {
    // Extract only the key implementation steps (first 500 characters)
    const condensed = log.substring(0, 500);

    if (log.length > 500) {
      return condensed + '...\n\n_See full implementation log in artifacts_';
    }

    return condensed;
  }

  /**
   * Count files in directory
   *
   * @param {string} dir - Directory path
   * @returns {Array<string>}
   */
  countFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    const files = [];

    const walk = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };

    walk(dir);
    return files;
  }

  /**
   * Generate minimal PR description (fallback)
   *
   * @returns {string}
   */
  generateMinimal() {
    return `## ${this.jiraKey}: Implementation

Implements ${this.jiraKey}

### Summary

See implementation log and artifacts for details.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
`;
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: pr-description-generator.js <project-root> <jira-key>');
    console.error('');
    console.error('Example:');
    console.error('  pr-description-generator.js /path/to/project PROJ-123');
    process.exit(1);
  }

  const [projectRoot, jiraKey] = args;

  const generator = new PRDescriptionGenerator(projectRoot, jiraKey);
  const description = await generator.generate();

  console.log('\n--- Generated PR Description ---\n');
  console.log(description);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  PRDescriptionGenerator,
  TEMPLATES
};
