import { execSync } from 'child_process';
import type { FrameworkConfig, StackProfile } from '../../schemas/index.js';
import type { TestCommands, BuildCommands } from './project-config-reader.service.js';

/**
 * Command Execution Result
 */
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
  exitCode: number;
}

/**
 * Command Resolver Service
 *
 * Resolves and executes commands with fallback chaining.
 * Primary source: framework-config.json (from initialize-project)
 * Fallback: Minimal safety net for common patterns
 *
 * Key Philosophy:
 * - Trust initialize-project's analysis as primary source
 * - Only use fallbacks when config is incomplete
 * - Support auto-repair (try next fallback if command fails)
 * - Keep fallbacks minimal and language-specific
 */
export class CommandResolverService {
  private frameworkConfig: FrameworkConfig;
  private stackProfile: StackProfile;

  constructor(frameworkConfig: FrameworkConfig) {
    this.frameworkConfig = frameworkConfig;
    this.stackProfile = frameworkConfig.stack_profile;
  }

  /**
   * Get testing frameworks from services
   */
  private getTestingFrameworks(): Record<string, string[]> {
    const testingFw: Record<string, string[]> = {};

    for (const service of this.stackProfile.services) {
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
   * Get primary language (language with most files)
   */
  private getPrimaryLanguage(): string | undefined {
    const services = this.stackProfile.services;
    if (!services || services.length === 0) return undefined;

    const languageCounts: Record<string, number> = {};
    for (const service of services) {
      const lang = service.language;
      languageCounts[lang] = (languageCounts[lang] || 0) + (service.file_count || 1);
    }

    return Object.entries(languageCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  }

  /**
   * Get test command for a specific type with fallbacks
   * @param type - Test type: 'unit', 'integration', or 'e2e'
   * @returns Array of commands to try (ordered by preference)
   */
  getTestCommand(type: 'unit' | 'integration' | 'e2e'): string[] {
    const commands: string[] = [];

    // Extract from testing frameworks in stack profile
    const testingFrameworks = this.getTestingFrameworks();
    const primaryLang = this.getPrimaryLanguage()?.toLowerCase();

    // Build commands from detected frameworks
    for (const [lang, frameworks] of Object.entries(testingFrameworks)) {
      const frameworkList = frameworks;
      for (const framework of frameworkList) {
        const frameworkLower = framework.toLowerCase();

        if (type === 'unit') {
          // Unit test commands
          if (frameworkLower.includes('jest')) {
            commands.push('npm test');
            commands.push('npx jest');
            commands.push('yarn test');
          } else if (frameworkLower.includes('vitest')) {
            commands.push('npx vitest run');
            commands.push('npm run test');
          } else if (frameworkLower.includes('pytest')) {
            commands.push('pytest');
            commands.push('python -m pytest');
          } else if (frameworkLower.includes('mocha')) {
            commands.push('npx mocha');
            commands.push('npm test');
          } else if (frameworkLower.includes('ava')) {
            commands.push('npx ava');
          } else if (lang === 'go') {
            commands.push('go test ./...');
            commands.push('go test -v ./...');
          } else if (lang === 'rust') {
            commands.push('cargo test');
            commands.push('cargo test --all');
          } else if (frameworkLower.includes('junit')) {
            commands.push('mvn test');
            commands.push('gradle test');
          } else if (frameworkLower.includes('rspec')) {
            commands.push('bundle exec rspec');
            commands.push('rspec');
          } else if (frameworkLower.includes('minitest') || frameworkLower.includes('test::unit')) {
            commands.push('bundle exec rails test');
            commands.push('bundle exec rake test');
            commands.push('rake test');
          }
        } else if (type === 'e2e') {
          // E2E test commands
          if (frameworkLower.includes('playwright')) {
            commands.push('npx playwright test');
            commands.push('npm run test:e2e');
          } else if (frameworkLower.includes('cypress')) {
            commands.push('npx cypress run');
            commands.push('npm run test:e2e');
          } else if (frameworkLower.includes('testcafe')) {
            commands.push('npx testcafe');
          } else if (frameworkLower.includes('capybara')) {
            commands.push('bundle exec rspec spec/system');
            commands.push('bundle exec rails test:system');
          }
        }
      }
    }

    // Add language-specific fallbacks if no commands found
    if (commands.length === 0) {
      commands.push(...this.getDefaultTestFallbacks(type, primaryLang));
    }

    // Remove duplicates while preserving order
    return [...new Set(commands)];
  }

  /**
   * Get default test fallbacks for a language
   */
  private getDefaultTestFallbacks(
    type: 'unit' | 'integration' | 'e2e',
    language?: string,
  ): string[] {
    const fallbacks: string[] = [];

    if (type === 'unit') {
      if (language === 'typescript' || language === 'javascript') {
        fallbacks.push('npm test', 'npx jest', 'npx vitest run');
      } else if (language === 'python') {
        fallbacks.push('pytest', 'python -m pytest', 'python -m unittest');
      } else if (language === 'go') {
        fallbacks.push('go test ./...', 'go test -v ./...');
      } else if (language === 'rust') {
        fallbacks.push('cargo test', 'cargo test --all');
      } else if (language === 'java') {
        fallbacks.push('mvn test', 'gradle test');
      } else if (language === 'csharp') {
        fallbacks.push('dotnet test');
      } else if (language === 'scala') {
        fallbacks.push('sbt test');
      } else if (language === 'ruby') {
        fallbacks.push('bundle exec rspec', 'bundle exec rails test', 'bundle exec rake test');
      }
    } else if (type === 'e2e') {
      if (language === 'typescript' || language === 'javascript') {
        fallbacks.push('npx playwright test', 'npx cypress run');
      } else if (language === 'ruby') {
        fallbacks.push('bundle exec rspec spec/system', 'bundle exec rails test:system');
      }
    }

    return fallbacks;
  }

  /**
   * Get build command with fallbacks
   */
  getBuildCommand(): string[] {
    const commands: string[] = [];
    const primaryLang = this.getPrimaryLanguage()?.toLowerCase();

    // Language-specific build commands
    if (primaryLang === 'typescript' || primaryLang === 'javascript') {
      commands.push('npm run build', 'yarn build', 'pnpm build');
    } else if (primaryLang === 'python') {
      commands.push('python setup.py build', 'pip install -e .');
    } else if (primaryLang === 'go') {
      commands.push('go build', 'go build ./...');
    } else if (primaryLang === 'rust') {
      commands.push('cargo build', 'cargo build --release');
    } else if (primaryLang === 'java') {
      commands.push('mvn compile', 'gradle build');
    } else if (primaryLang === 'csharp') {
      commands.push('dotnet build', 'dotnet publish -c Release');
    } else if (primaryLang === 'scala') {
      commands.push('sbt compile', 'sbt package');
    } else if (primaryLang === 'ruby') {
      // Ruby (including Rails) is interpreted — there is no build step.
    }

    return commands.filter(Boolean);
  }

  /**
   * Get lint command with fallbacks
   */
  getLintCommand(): string[] {
    const commands: string[] = [];
    const primaryLang = this.getPrimaryLanguage()?.toLowerCase();

    if (primaryLang === 'typescript' || primaryLang === 'javascript') {
      commands.push('npm run lint', 'npx eslint .', 'yarn lint');
    } else if (primaryLang === 'python') {
      commands.push('pylint **/*.py', 'flake8', 'ruff check .');
    } else if (primaryLang === 'go') {
      commands.push('golangci-lint run', 'go vet ./...');
    } else if (primaryLang === 'rust') {
      commands.push('cargo clippy', 'cargo clippy --all-targets');
    } else if (primaryLang === 'csharp') {
      commands.push('dotnet format --verify-no-changes');
    } else if (primaryLang === 'scala') {
      commands.push('sbt scalafmtCheckAll', 'sbt "scalafixAll --check"');
    } else if (primaryLang === 'ruby') {
      commands.push('bundle exec rubocop', 'rubocop');
    }

    return commands.filter(Boolean);
  }

  /**
   * Get format command with fallbacks
   */
  getFormatCommand(): string[] {
    const commands: string[] = [];
    const primaryLang = this.getPrimaryLanguage()?.toLowerCase();

    if (primaryLang === 'typescript' || primaryLang === 'javascript') {
      commands.push('npm run format', 'npx prettier --write .', 'yarn format');
    } else if (primaryLang === 'python') {
      commands.push('black .', 'autopep8 --in-place --recursive .');
    } else if (primaryLang === 'go') {
      commands.push('gofmt -w .', 'go fmt ./...');
    } else if (primaryLang === 'rust') {
      commands.push('cargo fmt', 'rustfmt **/*.rs');
    } else if (primaryLang === 'csharp') {
      commands.push('dotnet format');
    } else if (primaryLang === 'scala') {
      commands.push('sbt scalafmtAll');
    } else if (primaryLang === 'ruby') {
      commands.push('bundle exec rubocop -a', 'rubocop -a');
    }

    return commands.filter(Boolean);
  }

  /**
   * Execute command with fallback chaining
   * Tries each command in order until one succeeds
   *
   * @param commands - Array of commands to try (ordered by preference)
   * @param cwd - Working directory
   * @param timeout - Timeout in milliseconds (default: 120000 = 2 minutes)
   * @returns Command execution result
   */
  async executeWithFallback(
    commands: string[],
    cwd: string,
    timeout: number = 120000,
  ): Promise<CommandResult> {
    if (commands.length === 0) {
      throw new Error('No commands provided to executeWithFallback');
    }

    let lastError: Error | undefined;

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const isLastCommand = i === commands.length - 1;

      try {
        const result = await this.executeCommand(command, cwd, timeout);

        if (result.success) {
          return result;
        }

        // Command failed, try next fallback
        lastError = new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr}`);

        if (!isLastCommand) {
          console.log(`[Command Resolver] Command failed: ${command}`);
          console.log(`[Command Resolver] Trying next fallback: ${commands[i + 1]}`);
          continue;
        }
      } catch (error) {
        lastError = error as Error;

        if (!isLastCommand) {
          console.log(`[Command Resolver] Command error: ${command} - ${lastError.message}`);
          console.log(`[Command Resolver] Trying next fallback: ${commands[i + 1]}`);
          continue;
        }
      }
    }

    // All commands failed
    throw new Error(
      `All commands failed. Last error: ${lastError?.message}\n` +
        `Tried commands: ${commands.join(', ')}`,
    );
  }

  /**
   * Execute a single command
   *
   * @param command - Command to execute
   * @param cwd - Working directory
   * @param timeout - Timeout in milliseconds
   * @returns Command execution result
   */
  private async executeCommand(
    command: string,
    cwd: string,
    timeout: number,
  ): Promise<CommandResult> {
    try {
      const output = execSync(command, {
        cwd,
        timeout,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      return {
        success: true,
        stdout: output,
        stderr: '',
        command,
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        success: false,
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message,
        command,
        exitCode: error.status || 1,
      };
    }
  }

  /**
   * Validate that a command exists in the system
   * @param command - Command to validate (e.g., 'npm', 'docker', 'gh')
   * @returns true if command is available
   */
  validateCommand(command: string): boolean {
    try {
      execSync(`which ${command}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all available commands for a category
   */
  getAllCommands(category: 'test' | 'build' | 'lint' | 'format'): string[] {
    switch (category) {
      case 'test':
        return [
          ...this.getTestCommand('unit'),
          ...this.getTestCommand('integration'),
          ...this.getTestCommand('e2e'),
        ];
      case 'build':
        return this.getBuildCommand();
      case 'lint':
        return this.getLintCommand();
      case 'format':
        return this.getFormatCommand();
      default:
        return [];
    }
  }

  /**
   * Get package manager (npm, yarn, pnpm, etc.)
   */
  getPackageManager(): string {
    const packageManager = this.stackProfile.package_manager;

    if (packageManager) {
      return packageManager.toLowerCase();
    }

    // Fallback detection
    const primaryLang = this.getPrimaryLanguage()?.toLowerCase();

    if (primaryLang === 'typescript' || primaryLang === 'javascript') {
      // Try to detect from lock files
      try {
        if (this.validateCommand('pnpm')) return 'pnpm';
        if (this.validateCommand('yarn')) return 'yarn';
        return 'npm';
      } catch {
        return 'npm';
      }
    } else if (primaryLang === 'python') {
      return 'pip';
    } else if (primaryLang === 'go') {
      return 'go';
    } else if (primaryLang === 'rust') {
      return 'cargo';
    } else if (primaryLang === 'csharp') {
      return 'dotnet';
    } else if (primaryLang === 'scala') {
      return 'sbt';
    } else if (primaryLang === 'java') {
      return 'mvn';
    } else if (primaryLang === 'ruby') {
      return 'bundler';
    }

    return 'npm'; // Safe default
  }

  /**
   * Get install command for the package manager
   */
  getInstallCommand(): string {
    const packageManager = this.getPackageManager();

    switch (packageManager) {
      case 'npm':
        return 'npm install';
      case 'yarn':
        return 'yarn install';
      case 'pnpm':
        return 'pnpm install';
      case 'pip':
        return 'pip install -r requirements.txt';
      case 'go':
        return 'go mod download';
      case 'cargo':
        return 'cargo build';
      case 'dotnet':
        return 'dotnet restore';
      case 'sbt':
        return 'sbt update';
      case 'mvn':
        return 'mvn dependency:resolve';
      case 'bundler':
      case 'bundle':
        return 'bundle install';
      default:
        return 'npm install';
    }
  }
}
