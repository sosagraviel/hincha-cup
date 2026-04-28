import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandResolverService } from '../../../../src/services/implement-ticket/command-resolver.service.js';

describe('CommandResolverService', () => {
  let service: CommandResolverService;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockFrameworkConfig = {
      project_name: 'test-project',
      stack_profile: {
        package_manager: 'npm',
        services: [
          {
            id: 'main',
            path: 'src',
            type: 'backend',
            language: 'typescript',
            frameworks: { testing: 'vitest' },
            file_count: 100,
            testing: {
              unit: { framework: 'vitest' },
            },
          },
        ],
        is_monorepo: false,
      },
      test_commands: {
        unit: ['npm', 'test'],
        integration: ['npm', 'run', 'test:integration'],
        e2e: ['npm', 'run', 'test:e2e'],
      },
    };
    service = new CommandResolverService(mockFrameworkConfig as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTestCommand', () => {
    it('should get unit test command for vitest', () => {
      const result = service.getTestCommand('unit');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should get integration test command', () => {
      const result = service.getTestCommand('integration');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get e2e test command', () => {
      const result = service.getTestCommand('e2e');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle jest framework', () => {
      const jestConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'javascript',
              frameworks: { testing: 'jest' },
              file_count: 100,
              testing: {
                unit: { framework: 'jest' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const jestService = new CommandResolverService(jestConfig as any);
      const result = jestService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('jest'))).toBe(true);
    });

    it('should handle pytest framework', () => {
      const pytestConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'python',
              frameworks: { testing: 'pytest' },
              file_count: 100,
              testing: {
                unit: { framework: 'pytest' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const pytestService = new CommandResolverService(pytestConfig as any);
      const result = pytestService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('pytest'))).toBe(true);
    });

    it('should handle mocha framework', () => {
      const mochaConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'javascript',
              frameworks: { testing: 'mocha' },
              file_count: 100,
              testing: {
                unit: { framework: 'mocha' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const mochaService = new CommandResolverService(mochaConfig as any);
      const result = mochaService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('mocha'))).toBe(true);
    });

    it('should handle ava framework', () => {
      const avaConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { testing: 'ava' },
              file_count: 100,
              testing: {
                unit: { framework: 'ava' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const avaService = new CommandResolverService(avaConfig as any);
      const result = avaService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('ava'))).toBe(true);
    });

    it('should handle go tests', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          services: [
            {
              id: 'main',
              path: 'cmd',
              type: 'backend',
              language: 'go',
              frameworks: { testing: 'testing' },
              file_count: 100,
              testing: {
                unit: { framework: 'testing' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('go test'))).toBe(true);
    });

    it('should handle rust tests', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'rust',
              frameworks: { testing: 'cargo' },
              file_count: 100,
              testing: {
                unit: { framework: 'cargo' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('cargo test'))).toBe(true);
    });

    it('should handle rspec framework', () => {
      const rspecConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'bundler',
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: { testing: 'rspec' },
              file_count: 100,
              testing: {
                unit: { framework: 'rspec' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const rspecService = new CommandResolverService(rspecConfig as any);
      const result = rspecService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('rspec'))).toBe(true);
    });

    it('should handle minitest framework', () => {
      const minitestConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'bundler',
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: { testing: 'minitest' },
              file_count: 100,
              testing: {
                unit: { framework: 'minitest' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const minitestService = new CommandResolverService(minitestConfig as any);
      const result = minitestService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('rails test') || cmd.includes('rake test'))).toBe(
        true,
      );
    });

    it('should handle capybara for e2e (system tests)', () => {
      const capybaraConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'bundler',
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: { testing: 'capybara' },
              file_count: 100,
              testing: {
                e2e: { framework: 'capybara' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const capybaraService = new CommandResolverService(capybaraConfig as any);
      const result = capybaraService.getTestCommand('e2e');
      expect(result.some((cmd) => cmd.includes('system') || cmd.includes('test:system'))).toBe(
        true,
      );
    });

    it('should handle junit framework', () => {
      const junitConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'maven',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'java',
              frameworks: { testing: 'junit' },
              file_count: 100,
              testing: {
                unit: { framework: 'junit' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const junitService = new CommandResolverService(junitConfig as any);
      const result = junitService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('mvn') || cmd.includes('gradle'))).toBe(true);
    });

    it('should handle scala test fallbacks', () => {
      const scalaConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'scala',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const scalaService = new CommandResolverService(scalaConfig as any);
      const result = scalaService.getTestCommand('unit');
      expect(result.some((cmd) => cmd.includes('sbt test'))).toBe(true);
    });

    it('should handle playwright for e2e', () => {
      const playwrightConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'frontend',
              language: 'typescript',
              frameworks: { testing: 'playwright' },
              file_count: 100,
              testing: {
                e2e: { framework: 'playwright' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const playwrightService = new CommandResolverService(playwrightConfig as any);
      const result = playwrightService.getTestCommand('e2e');
      expect(result.some((cmd) => cmd.includes('playwright'))).toBe(true);
    });

    it('should handle cypress for e2e', () => {
      const cypressConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'frontend',
              language: 'javascript',
              frameworks: { testing: 'cypress' },
              file_count: 100,
              testing: {
                e2e: { framework: 'cypress' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const cypressService = new CommandResolverService(cypressConfig as any);
      const result = cypressService.getTestCommand('e2e');
      expect(result.some((cmd) => cmd.includes('cypress'))).toBe(true);
    });

    it('should handle testcafe for e2e', () => {
      const testcafeConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'frontend',
              language: 'javascript',
              frameworks: { testing: 'testcafe' },
              file_count: 100,
              testing: {
                e2e: { framework: 'testcafe' },
              },
            },
          ],
          is_monorepo: false,
        },
      };
      const testcafeService = new CommandResolverService(testcafeConfig as any);
      const result = testcafeService.getTestCommand('e2e');
      expect(result.some((cmd) => cmd.includes('testcafe'))).toBe(true);
    });

    it('should use fallbacks when no frameworks detected', () => {
      const emptyConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const emptyService = new CommandResolverService(emptyConfig as any);
      const result = emptyService.getTestCommand('unit');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getBuildCommand', () => {
    it('should get build command for typescript', () => {
      const result = service.getBuildCommand();
      expect(Array.isArray(result)).toBe(true);
      expect(result.some((cmd) => cmd.includes('build'))).toBe(true);
    });

    it('should handle python build', () => {
      const pythonConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'python',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const pythonService = new CommandResolverService(pythonConfig as any);
      const result = pythonService.getBuildCommand();
      expect(result.some((cmd) => cmd.includes('setup.py') || cmd.includes('pip install'))).toBe(
        true,
      );
    });

    it('should handle go build', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          services: [
            {
              id: 'main',
              path: 'cmd',
              type: 'backend',
              language: 'go',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getBuildCommand();
      expect(result.some((cmd) => cmd.includes('go build'))).toBe(true);
    });

    it('should handle rust build', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'rust',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getBuildCommand();
      expect(result.some((cmd) => cmd.includes('cargo build'))).toBe(true);
    });

    it('should handle ruby build (rails assets:precompile / gem build)', () => {
      const rubyConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'bundler',
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rubyService = new CommandResolverService(rubyConfig as any);
      const result = rubyService.getBuildCommand();
      expect(result.some((cmd) => cmd.includes('rails assets:precompile'))).toBe(true);
      expect(result.some((cmd) => cmd.includes('gem build'))).toBe(true);
      expect(result.some((cmd) => cmd === 'bundle install')).toBe(false);
    });

    it('should handle java build', () => {
      const javaConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'maven',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'java',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const javaService = new CommandResolverService(javaConfig as any);
      const result = javaService.getBuildCommand();
      expect(result.some((cmd) => cmd.includes('mvn') || cmd.includes('gradle'))).toBe(true);
    });

    it('should handle scala build', () => {
      const scalaConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'scala',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const scalaService = new CommandResolverService(scalaConfig as any);
      const result = scalaService.getBuildCommand();
      expect(result.some((cmd) => cmd.includes('sbt'))).toBe(true);
    });
  });

  describe('getInstallCommand', () => {
    it('should get install command for npm', () => {
      const result = service.getInstallCommand();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('install');
    });

    it('should handle yarn package manager', () => {
      const yarnConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'yarn',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'javascript',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const yarnService = new CommandResolverService(yarnConfig as any);
      const result = yarnService.getInstallCommand();
      expect(result).toContain('yarn');
    });

    it('should handle pnpm package manager', () => {
      const pnpmConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pnpm',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const pnpmService = new CommandResolverService(pnpmConfig as any);
      const result = pnpmService.getInstallCommand();
      expect(result).toContain('pnpm');
    });

    it('should handle pip package manager', () => {
      const pipConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'python',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const pipService = new CommandResolverService(pipConfig as any);
      const result = pipService.getInstallCommand();
      expect(result).toContain('pip');
      expect(result).toContain('requirements.txt');
    });

    it('should handle go package manager', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          services: [
            {
              id: 'main',
              path: 'cmd',
              type: 'backend',
              language: 'go',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getInstallCommand();
      expect(result).toContain('go mod download');
    });

    it('should handle bundler package manager (ruby)', () => {
      const bundlerConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'bundler',
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const bundlerService = new CommandResolverService(bundlerConfig as any);
      const result = bundlerService.getInstallCommand();
      expect(result).toBe('bundle install');
    });

    it('should handle cargo package manager', () => {
      const cargoConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'rust',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const cargoService = new CommandResolverService(cargoConfig as any);
      const result = cargoService.getInstallCommand();
      expect(result).toContain('cargo build');
    });

    it('should default to npm install for unknown package manager', () => {
      const unknownConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'unknown',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const unknownService = new CommandResolverService(unknownConfig as any);
      const result = unknownService.getInstallCommand();
      expect(result).toBe('npm install');
    });
  });

  describe('getLintCommand', () => {
    it('should get lint command for typescript', () => {
      const result = service.getLintCommand();
      expect(Array.isArray(result)).toBe(true);
      expect(result.some((cmd) => cmd.includes('lint') || cmd.includes('eslint'))).toBe(true);
    });

    it('should get lint command for python', () => {
      const pythonConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'python',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const pythonService = new CommandResolverService(pythonConfig as any);
      const result = pythonService.getLintCommand();
      expect(
        result.some(
          (cmd) => cmd.includes('pylint') || cmd.includes('flake8') || cmd.includes('ruff'),
        ),
      ).toBe(true);
    });

    it('should get lint command for go', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          services: [
            {
              id: 'main',
              path: 'cmd',
              type: 'backend',
              language: 'go',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getLintCommand();
      expect(result.some((cmd) => cmd.includes('golangci-lint') || cmd.includes('go vet'))).toBe(
        true,
      );
    });

    it('should get lint command for ruby (rubocop)', () => {
      const rubyConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'bundler',
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rubyService = new CommandResolverService(rubyConfig as any);
      const result = rubyService.getLintCommand();
      expect(result.some((cmd) => cmd.includes('rubocop'))).toBe(true);
    });

    it('should get lint command for rust', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'rust',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getLintCommand();
      expect(result.some((cmd) => cmd.includes('cargo clippy'))).toBe(true);
    });

    it('should get lint command for scala', () => {
      const scalaConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'scala',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const scalaService = new CommandResolverService(scalaConfig as any);
      const result = scalaService.getLintCommand();
      expect(result.some((cmd) => cmd.includes('sbt'))).toBe(true);
    });
  });

  describe('getFormatCommand', () => {
    it('should get format command for typescript', () => {
      const result = service.getFormatCommand();
      expect(Array.isArray(result)).toBe(true);
      expect(result.some((cmd) => cmd.includes('format') || cmd.includes('prettier'))).toBe(true);
    });

    it('should get format command for python', () => {
      const pythonConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'python',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const pythonService = new CommandResolverService(pythonConfig as any);
      const result = pythonService.getFormatCommand();
      expect(result.some((cmd) => cmd.includes('black') || cmd.includes('autopep8'))).toBe(true);
    });

    it('should get format command for go', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          services: [
            {
              id: 'main',
              path: 'cmd',
              type: 'backend',
              language: 'go',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getFormatCommand();
      expect(result.some((cmd) => cmd.includes('gofmt') || cmd.includes('go fmt'))).toBe(true);
    });

    it('should get format command for ruby (rubocop -a)', () => {
      const rubyConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'bundler',
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rubyService = new CommandResolverService(rubyConfig as any);
      const result = rubyService.getFormatCommand();
      expect(result.some((cmd) => cmd.includes('rubocop -a'))).toBe(true);
    });

    it('should get format command for rust', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'rust',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getFormatCommand();
      expect(result.some((cmd) => cmd.includes('cargo fmt') || cmd.includes('rustfmt'))).toBe(true);
    });

    it('should get format command for scala', () => {
      const scalaConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'scala',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const scalaService = new CommandResolverService(scalaConfig as any);
      const result = scalaService.getFormatCommand();
      expect(result.some((cmd) => cmd.includes('sbt scalafmtAll'))).toBe(true);
    });
  });

  describe('validateCommand', () => {
    it('should validate existing command', () => {
      const result = service.validateCommand('node');
      expect(typeof result).toBe('boolean');
    });

    it('should return false for non-existing command', () => {
      const result = service.validateCommand('this-command-definitely-does-not-exist-12345');
      expect(result).toBe(false);
    });
  });

  describe('getAllCommands', () => {
    it('should get all test commands', () => {
      const result = service.getAllCommands('test');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should get all build commands', () => {
      const result = service.getAllCommands('build');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should get all lint commands', () => {
      const result = service.getAllCommands('lint');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should get all format commands', () => {
      const result = service.getAllCommands('format');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown category', () => {
      const result = service.getAllCommands('unknown' as any);
      expect(result).toEqual([]);
    });
  });

  describe('getPackageManager', () => {
    it('should return package manager from config', () => {
      const result = service.getPackageManager();
      expect(result).toBe('npm');
    });

    it('should fallback to npm for typescript without package manager', () => {
      const noPackageConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const noPackageService = new CommandResolverService(noPackageConfig as any);
      const result = noPackageService.getPackageManager();
      expect(['npm', 'yarn', 'pnpm']).toContain(result);
    });

    it('should return pip for python', () => {
      const pythonConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'python',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const pythonService = new CommandResolverService(pythonConfig as any);
      const result = pythonService.getPackageManager();
      expect(result).toBe('pip');
    });

    it('should return go for go language', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'cmd',
              type: 'backend',
              language: 'go',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getPackageManager();
      expect(result).toBe('go');
    });

    it('should return bundler for ruby', () => {
      const rubyConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'app',
              type: 'backend',
              language: 'ruby',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rubyService = new CommandResolverService(rubyConfig as any);
      const result = rubyService.getPackageManager();
      expect(result).toBe('bundler');
    });

    it('should return cargo for rust', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'rust',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getPackageManager();
      expect(result).toBe('cargo');
    });

    it('should return sbt for scala', () => {
      const scalaConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'scala',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const scalaService = new CommandResolverService(scalaConfig as any);
      const result = scalaService.getPackageManager();
      expect(result).toBe('sbt');
    });

    it('should default to npm for unknown language', () => {
      const unknownConfig = {
        project_name: 'test',
        stack_profile: {
          services: [
            {
              id: 'main',
              path: 'src',
              type: 'backend',
              language: 'unknown-lang',
              frameworks: {},
              file_count: 100,
            },
          ],
          is_monorepo: false,
        },
      };
      const unknownService = new CommandResolverService(unknownConfig as any);
      const result = unknownService.getPackageManager();
      expect(result).toBe('npm');
    });
  });

  describe('executeWithFallback', () => {
    it('should throw error when no commands provided', async () => {
      await expect(service.executeWithFallback([], '/test/path')).rejects.toThrow(
        'No commands provided',
      );
    });

    it('should execute first successful command', async () => {
      const result = await service.executeWithFallback(['echo "test"'], '/tmp');
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('test');
    });

    it('should try fallback when first command fails', async () => {
      const result = await service.executeWithFallback(
        ['this-command-does-not-exist', 'echo "fallback"'],
        '/tmp',
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('fallback');
    });

    it('should throw error when all commands fail', async () => {
      await expect(
        service.executeWithFallback(['this-does-not-exist-1', 'this-does-not-exist-2'], '/tmp'),
      ).rejects.toThrow('All commands failed');
    });

    it('should handle timeout', async () => {
      await expect(service.executeWithFallback(['sleep 10'], '/tmp', 100)).rejects.toThrow();
    });

    it('should try fallback when command returns non-zero exit code', async () => {
      const result = await service.executeWithFallback(['exit 1', 'echo "second"'], '/tmp');
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('second');
    });

    it('should handle command that exits with error and fallback succeeds', async () => {
      const result = await service.executeWithFallback(['false', 'true'], '/tmp');
      expect(result.success).toBe(true);
    });
  });
});
