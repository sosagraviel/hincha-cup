import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { type FrameworkConfig, type StackProfile } from '../../schemas/index.js';
import { type Service, type ServiceType } from '../../schemas/stack-profile.schema.js';
import {
  resolveConfigPath,
  resolveFrameworkConfigPath,
  resolveInstructionFilePath,
  getProviderPaths,
} from '../../utils/provider-paths.js';

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
 * - .claude/framework-config.json or .codex/framework-config.json
 * - .claude/CLAUDE.md or .codex/CLAUDE.md
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
    const configPath = resolveFrameworkConfigPath(this.projectPath);

    if (!existsSync(configPath)) {
      throw new Error(
        `Project not initialized. File not found: ${configPath}\n` +
          `Run initialize-project first: npm run initialize`,
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
    return config.stack_profile;
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
    const claudeMdPath = resolveInstructionFilePath(this.projectPath);

    if (!existsSync(claudeMdPath)) {
      throw new Error(
        `Project not initialized. File not found: ${claudeMdPath}\n` +
          `Run initialize-project first: npm run initialize`,
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
      buildCommandsSection: buildCommandsMatch ? buildCommandsMatch[1].trim() : undefined,
    };
  }

  /**
   * Get test commands aggregated from all services
   * Returns empty arrays if not found
   */
  getTestCommands(): TestCommands {
    const services = this.getServices();
    const commands: TestCommands = { unit: [], integration: [], e2e: [] };

    for (const service of services) {
      const serviceCommands = this.getTestCommandsForService(service.id);
      commands.unit.push(...serviceCommands.unit);
      commands.integration.push(...serviceCommands.integration);
      commands.e2e.push(...serviceCommands.e2e);
    }

    // Deduplicate
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
    const commands: BuildCommands = {
      build: [],
      dev: [],
      start: [],
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

    // Add framework-specific fallbacks based on primary language
    const primaryLang = this.getPrimaryLanguage()?.toLowerCase();

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
    } else if (primaryLang === 'scala') {
      if (!commands.build.length) commands.build.push('sbt compile');
      if (!commands.start.length) commands.start.push('sbt run');
    } else if (primaryLang === 'java') {
      if (!commands.build.length) commands.build.push('mvn compile');
      if (!commands.start.length) commands.start.push('mvn spring-boot:run');
    } else if (primaryLang === 'ruby') {
      if (!commands.start.length) commands.start.push('bin/rails server', 'ruby app.rb');
    }

    return commands;
  }

  // ========== SERVICE-ORIENTED METHODS ==========

  /**
   * Get all services from stack profile
   */
  getServices(): Service[] {
    const stackProfile = this.readStackProfile();
    return stackProfile.services || [];
  }

  /**
   * Get service by ID
   */
  getServiceById(serviceId: string): Service | undefined {
    const services = this.getServices();
    return services.find((s) => s.id === serviceId);
  }

  /**
   * Get services by type
   */
  getServicesByType(type: ServiceType): Service[] {
    const services = this.getServices();
    return services.filter((s) => s.type === type);
  }

  /**
   * Get services by language
   */
  getServicesByLanguage(language: string): Service[] {
    const services = this.getServices();
    return services.filter((s) => s.language.toLowerCase() === language.toLowerCase());
  }

  /**
   * Get all unique languages from services
   */
  getLanguages(): string[] {
    const services = this.getServices();
    const languages = new Set(services.map((s) => s.language));
    return Array.from(languages);
  }

  /**
   * Get primary language (language with most files)
   */
  getPrimaryLanguage(): string | undefined {
    const services = this.getServices();
    if (services.length === 0) return undefined;

    const languageCounts: Record<string, number> = {};
    for (const service of services) {
      const lang = service.language;
      languageCounts[lang] = (languageCounts[lang] || 0) + (service.file_count || 1);
    }

    return Object.entries(languageCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  }

  /**
   * Check if project is polyglot (multiple languages)
   */
  isPolyglotArchitecture(): boolean {
    const languages = this.getLanguages();
    return languages.length > 1;
  }

  /**
   * Get all unique databases used across services
   */
  getAllDatabases(): string[] {
    const services = this.getServices();
    const dbSet = new Set<string>();

    for (const service of services) {
      if (service.databases) {
        for (const db of service.databases) {
          dbSet.add(db.type);
        }
      }
    }

    return Array.from(dbSet);
  }

  /**
   * Get all frontend frameworks from frontend services
   */
  getFrontendFrameworks(): string[] {
    const frontendServices = this.getServicesByType('frontend');
    const frameworks: string[] = [];

    for (const service of frontendServices) {
      if (service.frameworks.main) frameworks.push(service.frameworks.main);
      if (service.frameworks.ui) frameworks.push(service.frameworks.ui);
    }

    return [...new Set(frameworks)];
  }

  /**
   * Get all backend frameworks from backend/serverless services
   */
  getBackendFrameworks(): string[] {
    const services = this.getServices();
    const backendServices = services.filter((s) => s.type === 'backend' || s.type === 'serverless');
    const frameworks: string[] = [];

    for (const service of backendServices) {
      if (service.frameworks.main) frameworks.push(service.frameworks.main);
    }

    return [...new Set(frameworks)];
  }

  /**
   * Get testing frameworks grouped by language
   */
  getTestingFrameworks(): Record<string, string[]> {
    const services = this.getServices();
    const testingFw: Record<string, string[]> = {};

    for (const service of services) {
      const lang = service.language;
      if (!testingFw[lang]) testingFw[lang] = [];

      if (service.testing?.unit?.framework) testingFw[lang].push(service.testing.unit.framework);
      if (service.testing?.integration?.framework)
        testingFw[lang].push(service.testing.integration.framework);
      if (service.testing?.e2e?.framework) testingFw[lang].push(service.testing.e2e.framework);
    }

    // Deduplicate
    for (const lang in testingFw) {
      testingFw[lang] = [...new Set(testingFw[lang])];
    }

    return testingFw;
  }

  /**
   * Get test commands for specific service
   */
  getTestCommandsForService(serviceId: string): TestCommands {
    const service = this.getServiceById(serviceId);
    if (!service || !service.testing) {
      return { unit: [], integration: [], e2e: [] };
    }

    const commands: TestCommands = { unit: [], integration: [], e2e: [] };

    if (service.testing.unit) {
      commands.unit.push(
        ...this.generateTestCommands(service.testing.unit.framework, service.language),
      );
    }
    if (service.testing.integration) {
      commands.integration.push(
        ...this.generateTestCommands(service.testing.integration.framework, service.language),
      );
    }
    if (service.testing.e2e) {
      commands.e2e.push(
        ...this.generateTestCommands(service.testing.e2e.framework, service.language),
      );
    }

    return commands;
  }

  /**
   * Generate test commands for a framework/language combination
   */
  private generateTestCommands(framework: string, language: string): string[] {
    const fw = framework.toLowerCase();

    if (fw.includes('jest')) return ['npm test', 'npx jest'];
    if (fw.includes('vitest')) return ['npx vitest run'];
    if (fw.includes('pytest')) return ['pytest', 'python -m pytest'];
    if (fw.includes('go test')) return ['go test ./...'];
    if (fw.includes('cargo')) return ['cargo test'];
    if (fw.includes('scalatest') || fw.includes('munit')) return ['sbt test'];
    if (fw.includes('rspec')) return ['bundle exec rspec'];
    if (fw.includes('minitest')) return ['bundle exec rake test'];
    if (fw.includes('playwright')) return ['npx playwright test'];
    if (fw.includes('cypress')) return ['npx cypress run'];
    if (fw.includes('mocha')) return ['npx mocha'];
    if (fw.includes('junit')) return ['mvn test', 'gradle test'];

    return [];
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
    return infrastructure.some((tool) => tool.toLowerCase().includes('docker'));
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
    const configPath = resolveFrameworkConfigPath(projectPath);
    return existsSync(configPath);
  }

  /**
   * Validate that all required files exist
   */
  validateInitialization(): { valid: boolean; missing: string[] } {
    const paths = getProviderPaths();
    const requiredFiles = [
      `${paths.configDir}/framework-config.json`,
      `${paths.configDir}/${paths.instructionFile}`,
      `${paths.configDir}/project-context/SKILL.md`,
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
      missing,
    };
  }
}
