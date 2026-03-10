#!/usr/bin/env node

/**
 * Documentation Change Detector
 *
 * Detects when CLAUDE.md or project-context/SKILL.md needs updates based on code changes.
 * Used by implement-ticket Phase 7 (Documentation Update) to determine if documentation
 * maintenance is required.
 *
 * @module doc-change-detector
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Documentation change detection thresholds and patterns
 */
const DETECTION_RULES = {
  // File patterns that trigger CLAUDE.md updates
  claudeMdTriggers: {
    techStack: [
      /package\.json$/,
      /pyproject\.toml$/,
      /requirements\.txt$/,
      /Gemfile$/,
      /go\.mod$/,
      /Cargo\.toml$/
    ],
    architecture: [
      /docker-compose.*\.yml$/,
      /Makefile$/,
      /\.github\/workflows\//,
      /tsconfig.*\.json$/,
      /\.eslintrc/,
      /vite\.config/,
      /next\.config/
    ],
    commands: [
      /package\.json$/,
      /Makefile$/,
      /\.env\.example$/
    ],
    services: [
      /docker-compose.*\.yml$/,
      /\.env\.example$/
    ]
  },

  // File patterns that trigger project-context updates
  projectContextTriggers: {
    requestLifecycle: [
      /middleware/,
      /guards?/,
      /interceptors?/,
      /filters?/,
      /decorators?/
    ],
    authentication: [
      /auth/,
      /guards?.*auth/,
      /strategies?/,
      /jwt/,
      /session/
    ],
    realTime: [
      /websocket/,
      /socket\.io/,
      /events?/,
      /gateways?/,
      /subscriptions?/
    ],
    errorHandling: [
      /exceptions?/,
      /errors?/,
      /filters?.*exception/
    ],
    dataFlow: [
      /repository/,
      /dto/,
      /entities?/,
      /models?/,
      /serializers?/
    ]
  }
};

/**
 * Main DocumentationChangeDetector class
 */
class DocumentationChangeDetector {
  constructor(projectRoot, jiraKey) {
    this.projectRoot = projectRoot;
    this.jiraKey = jiraKey;
    this.artifactsDir = path.join(projectRoot, '.claude', 'artifacts', jiraKey);
    this.changedFiles = [];
    this.claudeMdPath = path.join(projectRoot, '.claude', 'CLAUDE.md');
    this.projectContextPath = path.join(projectRoot, '.claude', 'skills', 'project-context', 'SKILL.md');
  }

  /**
   * Detect if documentation updates are needed
   *
   * @returns {Promise<DetectionResult>}
   */
  async detect() {
    try {
      console.log('🔍 Detecting documentation changes...');

      // Step 1: Get changed files
      this.changedFiles = await this.getChangedFiles();
      console.log(`   Found ${this.changedFiles.length} changed files`);

      if (this.changedFiles.length === 0) {
        return this.createResult(false, false, 'No files changed');
      }

      // Step 2: Analyze changes
      const claudeMdNeeded = this.detectClaudeMdChanges();
      const projectContextNeeded = this.detectProjectContextChanges();

      // Step 3: Read current documentation state
      const claudeMdExists = fs.existsSync(this.claudeMdPath);
      const projectContextExists = fs.existsSync(this.projectContextPath);

      // Step 4: Generate analysis
      const result = {
        claudeMd: {
          updateNeeded: claudeMdNeeded,
          exists: claudeMdExists,
          sections: this.getAffectedClaudeMdSections(),
          reason: this.getClaudeMdUpdateReason(),
          triggeredBy: this.getClaudeMdTriggers()
        },
        projectContext: {
          updateNeeded: projectContextNeeded,
          exists: projectContextExists,
          sections: this.getAffectedProjectContextSections(),
          reason: this.getProjectContextUpdateReason(),
          triggeredBy: this.getProjectContextTriggers()
        },
        changedFiles: this.changedFiles,
        analysisTimestamp: new Date().toISOString()
      };

      // Step 5: Write result to artifacts
      await this.writeResult(result);

      // Step 6: Log summary
      this.logSummary(result);

      return result;

    } catch (error) {
      console.error('❌ Documentation change detection failed:', error.message);
      throw error;
    }
  }

  /**
   * Get list of changed files from git
   *
   * @returns {Promise<string[]>}
   */
  async getChangedFiles() {
    try {
      // Try to get changed files from implementation log first
      const implLogPath = path.join(this.artifactsDir, 'implementations', 'implementation-log.md');

      if (fs.existsSync(implLogPath)) {
        const implLog = fs.readFileSync(implLogPath, 'utf8');

        // Extract file paths from implementation log
        const fileRegex = /(?:Created|Updated|Modified):\s+`([^`]+)`/g;
        const files = [];
        let match;

        while ((match = fileRegex.exec(implLog)) !== null) {
          files.push(match[1]);
        }

        if (files.length > 0) {
          console.log('   Using files from implementation log');
          return files;
        }
      }

      // Fallback: Get uncommitted changes from git
      console.log('   Getting changed files from git...');

      // Get staged files
      const staged = execSync('git diff --cached --name-only', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      }).trim().split('\n').filter(f => f);

      // Get unstaged files
      const unstaged = execSync('git diff --name-only', {
        cwd: this.projectRoot,
        encoding: 'utf8'
      }).trim().split('\n').filter(f => f);

      // Combine and deduplicate
      const allFiles = [...new Set([...staged, ...unstaged])];

      return allFiles;

    } catch (error) {
      console.warn('⚠️  Could not get changed files from git:', error.message);
      return [];
    }
  }

  /**
   * Detect if CLAUDE.md updates are needed
   *
   * @returns {boolean}
   */
  detectClaudeMdChanges() {
    for (const file of this.changedFiles) {
      // Tech stack changes
      if (DETECTION_RULES.claudeMdTriggers.techStack.some(pattern => pattern.test(file))) {
        return true;
      }

      // Architecture changes
      if (DETECTION_RULES.claudeMdTriggers.architecture.some(pattern => pattern.test(file))) {
        return true;
      }

      // Command changes
      if (DETECTION_RULES.claudeMdTriggers.commands.some(pattern => pattern.test(file))) {
        return true;
      }

      // Services changes
      if (DETECTION_RULES.claudeMdTriggers.services.some(pattern => pattern.test(file))) {
        return true;
      }

      // New directory structure
      if (this.isNewDirectoryStructure(file)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect if project-context updates are needed
   *
   * @returns {boolean}
   */
  detectProjectContextChanges() {
    for (const file of this.changedFiles) {
      // Request lifecycle changes
      if (DETECTION_RULES.projectContextTriggers.requestLifecycle.some(pattern => pattern.test(file))) {
        return true;
      }

      // Authentication changes
      if (DETECTION_RULES.projectContextTriggers.authentication.some(pattern => pattern.test(file))) {
        return true;
      }

      // Real-time architecture changes
      if (DETECTION_RULES.projectContextTriggers.realTime.some(pattern => pattern.test(file))) {
        return true;
      }

      // Error handling changes
      if (DETECTION_RULES.projectContextTriggers.errorHandling.some(pattern => pattern.test(file))) {
        return true;
      }

      // Data flow changes
      if (DETECTION_RULES.projectContextTriggers.dataFlow.some(pattern => pattern.test(file))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file represents new directory structure
   *
   * @param {string} file - File path
   * @returns {boolean}
   */
  isNewDirectoryStructure(file) {
    const depth = file.split('/').length;

    // If file is more than 3 levels deep and contains common structural keywords
    if (depth > 3) {
      const structuralKeywords = ['modules', 'features', 'components', 'services', 'packages'];
      return structuralKeywords.some(keyword => file.includes(keyword));
    }

    return false;
  }

  /**
   * Get affected CLAUDE.md sections
   *
   * @returns {string[]}
   */
  getAffectedClaudeMdSections() {
    const sections = [];

    for (const file of this.changedFiles) {
      if (DETECTION_RULES.claudeMdTriggers.techStack.some(p => p.test(file))) {
        sections.push('Tech Stack');
      }
      if (DETECTION_RULES.claudeMdTriggers.architecture.some(p => p.test(file))) {
        sections.push('Architecture');
      }
      if (DETECTION_RULES.claudeMdTriggers.commands.some(p => p.test(file))) {
        sections.push('Common Commands');
      }
      if (DETECTION_RULES.claudeMdTriggers.services.some(p => p.test(file))) {
        sections.push('Services & Ports');
      }
      if (this.isNewDirectoryStructure(file)) {
        sections.push('File Placement Guide');
      }
    }

    return [...new Set(sections)]; // Deduplicate
  }

  /**
   * Get affected project-context sections
   *
   * @returns {string[]}
   */
  getAffectedProjectContextSections() {
    const sections = [];

    for (const file of this.changedFiles) {
      if (DETECTION_RULES.projectContextTriggers.requestLifecycle.some(p => p.test(file))) {
        sections.push('Request Lifecycle');
      }
      if (DETECTION_RULES.projectContextTriggers.authentication.some(p => p.test(file))) {
        sections.push('Authentication Flow');
      }
      if (DETECTION_RULES.projectContextTriggers.realTime.some(p => p.test(file))) {
        sections.push('Real-Time Architecture');
      }
      if (DETECTION_RULES.projectContextTriggers.errorHandling.some(p => p.test(file))) {
        sections.push('Error Handling Chain');
      }
      if (DETECTION_RULES.projectContextTriggers.dataFlow.some(p => p.test(file))) {
        sections.push('Data Flow Patterns');
      }
    }

    return [...new Set(sections)]; // Deduplicate
  }

  /**
   * Get reason for CLAUDE.md update
   *
   * @returns {string}
   */
  getClaudeMdUpdateReason() {
    const triggers = this.getClaudeMdTriggers();

    if (triggers.length === 0) {
      return 'No architectural changes detected';
    }

    const reasons = [];

    if (triggers.some(t => t.type === 'techStack')) {
      reasons.push('Technology stack modified');
    }
    if (triggers.some(t => t.type === 'architecture')) {
      reasons.push('Architecture configuration changed');
    }
    if (triggers.some(t => t.type === 'commands')) {
      reasons.push('Development commands updated');
    }
    if (triggers.some(t => t.type === 'services')) {
      reasons.push('Services or ports changed');
    }
    if (triggers.some(t => t.type === 'structure')) {
      reasons.push('New directory structure introduced');
    }

    return reasons.join('; ');
  }

  /**
   * Get reason for project-context update
   *
   * @returns {string}
   */
  getProjectContextUpdateReason() {
    const triggers = this.getProjectContextTriggers();

    if (triggers.length === 0) {
      return 'No architectural patterns changed';
    }

    const reasons = [];

    if (triggers.some(t => t.type === 'requestLifecycle')) {
      reasons.push('Request lifecycle modified');
    }
    if (triggers.some(t => t.type === 'authentication')) {
      reasons.push('Authentication flow changed');
    }
    if (triggers.some(t => t.type === 'realTime')) {
      reasons.push('Real-time architecture updated');
    }
    if (triggers.some(t => t.type === 'errorHandling')) {
      reasons.push('Error handling patterns changed');
    }
    if (triggers.some(t => t.type === 'dataFlow')) {
      reasons.push('Data flow patterns modified');
    }

    return reasons.join('; ');
  }

  /**
   * Get specific files that triggered CLAUDE.md updates
   *
   * @returns {Array<{file: string, type: string}>}
   */
  getClaudeMdTriggers() {
    const triggers = [];

    for (const file of this.changedFiles) {
      if (DETECTION_RULES.claudeMdTriggers.techStack.some(p => p.test(file))) {
        triggers.push({ file, type: 'techStack' });
      }
      if (DETECTION_RULES.claudeMdTriggers.architecture.some(p => p.test(file))) {
        triggers.push({ file, type: 'architecture' });
      }
      if (DETECTION_RULES.claudeMdTriggers.commands.some(p => p.test(file))) {
        triggers.push({ file, type: 'commands' });
      }
      if (DETECTION_RULES.claudeMdTriggers.services.some(p => p.test(file))) {
        triggers.push({ file, type: 'services' });
      }
      if (this.isNewDirectoryStructure(file)) {
        triggers.push({ file, type: 'structure' });
      }
    }

    return triggers;
  }

  /**
   * Get specific files that triggered project-context updates
   *
   * @returns {Array<{file: string, type: string}>}
   */
  getProjectContextTriggers() {
    const triggers = [];

    for (const file of this.changedFiles) {
      if (DETECTION_RULES.projectContextTriggers.requestLifecycle.some(p => p.test(file))) {
        triggers.push({ file, type: 'requestLifecycle' });
      }
      if (DETECTION_RULES.projectContextTriggers.authentication.some(p => p.test(file))) {
        triggers.push({ file, type: 'authentication' });
      }
      if (DETECTION_RULES.projectContextTriggers.realTime.some(p => p.test(file))) {
        triggers.push({ file, type: 'realTime' });
      }
      if (DETECTION_RULES.projectContextTriggers.errorHandling.some(p => p.test(file))) {
        triggers.push({ file, type: 'errorHandling' });
      }
      if (DETECTION_RULES.projectContextTriggers.dataFlow.some(p => p.test(file))) {
        triggers.push({ file, type: 'dataFlow' });
      }
    }

    return triggers;
  }

  /**
   * Write detection result to artifacts
   *
   * @param {Object} result - Detection result
   */
  async writeResult(result) {
    const outputPath = path.join(this.artifactsDir, 'doc-update-analysis.json');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`   Analysis saved to: ${outputPath}`);
  }

  /**
   * Log detection summary
   *
   * @param {Object} result - Detection result
   */
  logSummary(result) {
    console.log('\n📊 Documentation Change Detection Summary:');
    console.log('─────────────────────────────────────────');

    console.log(`\n📄 CLAUDE.md:`);
    if (result.claudeMd.updateNeeded) {
      console.log(`   ⚠️  UPDATE NEEDED`);
      console.log(`   Sections: ${result.claudeMd.sections.join(', ')}`);
      console.log(`   Reason: ${result.claudeMd.reason}`);
      console.log(`   Triggers: ${result.claudeMd.triggeredBy.length} files`);
    } else {
      console.log(`   ✅ No updates needed`);
    }

    console.log(`\n📚 project-context/SKILL.md:`);
    if (result.projectContext.updateNeeded) {
      console.log(`   ⚠️  UPDATE NEEDED`);
      console.log(`   Sections: ${result.projectContext.sections.join(', ')}`);
      console.log(`   Reason: ${result.projectContext.reason}`);
      console.log(`   Triggers: ${result.projectContext.triggeredBy.length} files`);
    } else {
      console.log(`   ✅ No updates needed`);
    }

    console.log('\n─────────────────────────────────────────\n');
  }

  /**
   * Create detection result object
   *
   * @param {boolean} claudeMdNeeded
   * @param {boolean} projectContextNeeded
   * @param {string} reason
   * @returns {Object}
   */
  createResult(claudeMdNeeded, projectContextNeeded, reason) {
    return {
      claudeMd: {
        updateNeeded: claudeMdNeeded,
        exists: fs.existsSync(this.claudeMdPath),
        sections: [],
        reason: reason,
        triggeredBy: []
      },
      projectContext: {
        updateNeeded: projectContextNeeded,
        exists: fs.existsSync(this.projectContextPath),
        sections: [],
        reason: reason,
        triggeredBy: []
      },
      changedFiles: [],
      analysisTimestamp: new Date().toISOString()
    };
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: doc-change-detector.js <project-root> <jira-key>');
    console.error('');
    console.error('Example:');
    console.error('  doc-change-detector.js /path/to/project PROJ-123');
    process.exit(1);
  }

  const [projectRoot, jiraKey] = args;

  const detector = new DocumentationChangeDetector(projectRoot, jiraKey);
  const result = await detector.detect();

  // Exit code based on whether updates are needed
  const exitCode = (result.claudeMd.updateNeeded || result.projectContext.updateNeeded) ? 1 : 0;
  process.exit(exitCode);
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
  DocumentationChangeDetector,
  DETECTION_RULES
};
