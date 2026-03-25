import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

/**
 * Project Config Reader Service
 *
 * Reads configuration files created by initialize-project.
 * NO detection logic - just reads existing config files!
 *
 * Key Philosophy:
 * - This service is LIGHTWEIGHT - it only reads files, never analyzes or detects
 * - All detection/analysis was done by initialize-project
 * - We trust the outputs from initialize-project completely
 * - If files are missing, we fail fast and tell user to run initialize-project first
 */

/**
 * Stack Profile Type (matches config-generator.ts)
 */
export interface StackProfile {
  languages?: string[];
  primary_language?: string;
  frameworks?: {
    frontend: string[];
    backend: string[];
    mobile?: string[];
  };
  testing_frameworks?: Record<string, string[]>;
  infrastructure?: string[];
  detected_workspaces?: Array<{
    path: string;
    language: string;
    type: string;
    frameworks: string[];
  }>;
  file_counts?: Record<string, number>;
  workspaces?: any[];
  package_manager?: string;
  workspace_type?: string;
}

/**
 * Framework Config Type (matches config-generator.ts)
 */
export interface FrameworkConfig {
  version: string;
  schema_version: string;
  framework_version: string;
  project_metadata: {
    project_path: string;
    last_analysis: string;
    initialization_hash: string;
  };
  analysis_results: {
    phase1_analysis: Record<string, any>;
    phase2_consolidation: any;
    phase3_synthesis: any;
    phase4_context: any;
  };
  stack_profile: {
    languages: string[];
    primary_language?: string;
    frameworks: {
      frontend: string[];
      backend: string[];
      mobile?: string[];
    };
    testing_frameworks: Record<string, string[]>;
    infrastructure?: string[];
    detected_workspaces: Array<{
      path: string;
      language: string;
      type: string;
      frameworks: string[];
    }>;
    file_counts: Record<string, number>;
  };
  resource_state: {
    skills: Record<string, any>;
    agents: Record<string, any>;
    commands: Record<string, any>;
    last_sync: string;
  };
}

/**
 * Test Commands Interface
 */
export interface TestCommands {
  unit: string[];
  integration: string[];
  e2e: string[];
}

/**
 * Build Commands Interface
 */
export interface BuildCommands {
  build: string[];
  dev: string[];
  start: string[];
  lint?: string[];
  format?: string[];
}

/**
 * Project Config Reader Service
 *
 * Reads configuration from initialize-project outputs:
 * - .claude/framework-config.json
 * - .claude/CLAUDE.md
 *
 * Throws errors if files are missing (user must run initialize-project first)
 */
export class ProjectConfigReaderService {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Read framework-config.json
   * Throws if file doesn't exist
   */
  readFrameworkConfig(): FrameworkConfig {
    const configPath = join(this.projectPath, '.claude', 'framework-config.json');

    if (!existsSync(configPath)) {
      throw new Error(
        `Project not initialized. File not found: ${configPath}\n` +
        `Run initialize-project first: npm run initialize`
      );
    }

    try {
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent) as FrameworkConfig;

      // Basic validation
      if (!config.stack_profile) {
        throw new Error('framework-config.json is missing stack_profile');
      }

      return config;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in framework-config.json: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Read stack profile from framework-config.json
   * This is the primary source of truth for stack information
   */
  readStackProfile(): StackProfile {
    const config = this.readFrameworkConfig();
    return config.stack_profile as StackProfile;
  }

  /**
   * Parse CLAUDE.md to extract stack profile section
   * This is a secondary source, mainly for human-readable context
   */
  parseClaudeMd(): {
    stackSection?: string;
    testCommandsSection?: string;
    buildCommandsSection?: string;
  } {
    const claudeMdPath = join(this.projectPath, '.claude', 'CLAUDE.md');

    if (!existsSync(claudeMdPath)) {
      throw new Error(
        `Project not initialized. File not found: ${claudeMdPath}\n` +
        `Run initialize-project first: npm run initialize`
      );
    }

    const claudeMdContent = readFileSync(claudeMdPath, 'utf-8');

    // Extract sections using regex
    const stackMatch = claudeMdContent.match(/## Stack Profile\s*\n+([\s\S]*?)(?=\n##|$)/);
    const testCommandsMatch = claudeMdContent.match(/## Test Commands\s*\n+([\s\S]*?)(?=\n##|$)/);
    const buildCommandsMatch = claudeMdContent.match(/## Build Commands\s*\n+([\s\S]*?)(?=\n##|$)/);

    return {
      stackSection: stackMatch ? stackMatch[1].trim() : undefined,
      testCommandsSection: testCommandsMatch ? testCommandsMatch[1].trim() : undefined,
      buildCommandsSection: buildCommandsMatch ? buildCommandsMatch[1].trim() : undefined
    };
  }

  /**
   * Extract test commands from stack profile
   * Returns empty arrays if not found
   */
  getTestCommands(): TestCommands {
    const stackProfile = this.readStackProfile();
    const testingFrameworks = stackProfile.testing_frameworks || {};

    // Build test commands based on detected testing frameworks
    const commands: TestCommands = {
      unit: [],
      integration: [],
      e2e: []
    };

    // Extract from each language's testing frameworks
    for (const [lang, frameworks] of Object.entries(testingFrameworks)) {
      for (const framework of frameworks) {
        const frameworkLower = framework.toLowerCase();

        // Unit test commands
        if (frameworkLower.includes('jest')) {
          commands.unit.push('npm test');
          commands.unit.push('npx jest');
        } else if (frameworkLower.includes('vitest')) {
          commands.unit.push('npx vitest run');
        } else if (frameworkLower.includes('pytest')) {
          commands.unit.push('pytest');
          commands.unit.push('python -m pytest');
        } else if (frameworkLower.includes('mocha')) {
          commands.unit.push('npx mocha');
        } else if (frameworkLower === 'go' || lang === 'go') {
          commands.unit.push('go test ./...');
        } else if (frameworkLower.includes('cargo') || lang === 'rust') {
          commands.unit.push('cargo test');
        }

        // E2E test commands
        if (frameworkLower.includes('playwright')) {
          commands.e2e.push('npx playwright test');
        } else if (frameworkLower.includes('cypress')) {
          commands.e2e.push('npx cypress run');
        }
      }
    }

    // Remove duplicates
    commands.unit = [...new Set(commands.unit)];
    commands.integration = [...new Set(commands.integration)];
    commands.e2e = [...new Set(commands.e2e)];

    return commands;
  }

  /**
   * Get build commands from package.json or framework conventions
   * Returns empty arrays if not found
   */
  getBuildCommands(): BuildCommands {
    const stackProfile = this.readStackProfile();
    const commands: BuildCommands = {
      build: [],
      dev: [],
      start: []
    };

    // Try to read package.json scripts
    const packageJsonPath = join(this.projectPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const scripts = packageJson.scripts || {};

        // Map common script names
        if (scripts.build) commands.build.push('npm run build');
        if (scripts.dev) commands.dev.push('npm run dev');
        if (scripts.start) commands.start.push('npm start');
        if (scripts.lint) commands.lint = ['npm run lint'];
        if (scripts.format) commands.format = ['npm run format'];
      } catch {
        // Ignore errors, will use fallbacks
      }
    }

    // Add framework-specific fallbacks
    const primaryLang = stackProfile.primary_language?.toLowerCase();

    if (primaryLang === 'javascript' || primaryLang === 'typescript') {
      if (!commands.build.length) commands.build.push('npm run build');
      if (!commands.dev.length) commands.dev.push('npm run dev');
      if (!commands.start.length) commands.start.push('npm start');
    } else if (primaryLang === 'python') {
      if (!commands.build.length) commands.build.push('python setup.py build');
      if (!commands.start.length) commands.start.push('python main.py');
    } else if (primaryLang === 'go') {
      if (!commands.build.length) commands.build.push('go build');
      if (!commands.start.length) commands.start.push('go run .');
    } else if (primaryLang === 'rust') {
      if (!commands.build.length) commands.build.push('cargo build');
      if (!commands.start.length) commands.start.push('cargo run');
    }

    return commands;
  }

  /**
   * Get primary language from stack profile
   */
  getPrimaryLanguage(): string | undefined {
    const stackProfile = this.readStackProfile();
    return stackProfile.primary_language;
  }

  /**
   * Get all detected languages
   */
  getLanguages(): string[] {
    const stackProfile = this.readStackProfile();
    return stackProfile.languages || [];
  }

  /**
   * Get frontend frameworks
   */
  getFrontendFrameworks(): string[] {
    const stackProfile = this.readStackProfile();
    return stackProfile.frameworks?.frontend || [];
  }

  /**
   * Get backend frameworks
   */
  getBackendFrameworks(): string[] {
    const stackProfile = this.readStackProfile();
    return stackProfile.frameworks?.backend || [];
  }

  /**
   * Get infrastructure tools
   */
  getInfrastructure(): string[] {
    const stackProfile = this.readStackProfile();
    return stackProfile.infrastructure || [];
  }

  /**
   * Check if Docker is detected in infrastructure
   */
  hasDocker(): boolean {
    const infrastructure = this.getInfrastructure();
    return infrastructure.some(tool =>
      tool.toLowerCase().includes('docker')
    );
  }

  /**
   * Get all detected workspaces
   */
  getWorkspaces(): Array<{
    path: string;
    language: string;
    type: string;
    frameworks: string[];
  }> {
    const stackProfile = this.readStackProfile();
    return stackProfile.detected_workspaces || stackProfile.workspaces || [];
  }

  /**
   * Get package manager (npm, yarn, pnpm, etc.)
   */
  getPackageManager(): string | undefined {
    const stackProfile = this.readStackProfile();
    return stackProfile.package_manager;
  }

  /**
   * Check if project has been initialized
   */
  static isProjectInitialized(projectPath: string): boolean {
    const configPath = join(projectPath, '.claude', 'framework-config.json');
    return existsSync(configPath);
  }

  /**
   * Validate that all required files exist
   */
  validateInitialization(): { valid: boolean; missing: string[] } {
    const requiredFiles = [
      '.claude/framework-config.json',
      '.claude/CLAUDE.md',
      '.claude/project-context/SKILL.md'
    ];

    const missing: string[] = [];
    for (const file of requiredFiles) {
      const filePath = join(this.projectPath, file);
      if (!existsSync(filePath)) {
        missing.push(file);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }
}
