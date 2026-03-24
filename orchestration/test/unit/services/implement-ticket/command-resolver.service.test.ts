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
        testing_frameworks: {
          typescript: ['vitest'],
        },
        primary_language: 'typescript',
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
          testing_frameworks: { javascript: ['jest'] },
          primary_language: 'javascript',
        },
      };
      const jestService = new CommandResolverService(jestConfig as any);
      const result = jestService.getTestCommand('unit');
      expect(result.some(cmd => cmd.includes('jest'))).toBe(true);
    });

    it('should handle pytest framework', () => {
      const pytestConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          testing_frameworks: { python: ['pytest'] },
          primary_language: 'python',
        },
      };
      const pytestService = new CommandResolverService(pytestConfig as any);
      const result = pytestService.getTestCommand('unit');
      expect(result.some(cmd => cmd.includes('pytest'))).toBe(true);
    });

    it('should handle mocha framework', () => {
      const mochaConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          testing_frameworks: { javascript: ['mocha'] },
          primary_language: 'javascript',
        },
      };
      const mochaService = new CommandResolverService(mochaConfig as any);
      const result = mochaService.getTestCommand('unit');
      expect(result.some(cmd => cmd.includes('mocha'))).toBe(true);
    });

    it('should handle ava framework', () => {
      const avaConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          testing_frameworks: { typescript: ['ava'] },
          primary_language: 'typescript',
        },
      };
      const avaService = new CommandResolverService(avaConfig as any);
      const result = avaService.getTestCommand('unit');
      expect(result.some(cmd => cmd.includes('ava'))).toBe(true);
    });

    it('should handle go tests', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          testing_frameworks: { go: ['testing'] },
          primary_language: 'go',
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getTestCommand('unit');
      expect(result.some(cmd => cmd.includes('go test'))).toBe(true);
    });

    it('should handle rust tests', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          testing_frameworks: { rust: ['cargo'] },
          primary_language: 'rust',
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getTestCommand('unit');
      expect(result.some(cmd => cmd.includes('cargo test'))).toBe(true);
    });

    it('should handle junit framework', () => {
      const junitConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'maven',
          testing_frameworks: { java: ['junit'] },
          primary_language: 'java',
        },
      };
      const junitService = new CommandResolverService(junitConfig as any);
      const result = junitService.getTestCommand('unit');
      expect(result.some(cmd => cmd.includes('mvn') || cmd.includes('gradle'))).toBe(true);
    });

    it('should handle playwright for e2e', () => {
      const playwrightConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          testing_frameworks: { typescript: ['playwright'] },
          primary_language: 'typescript',
        },
      };
      const playwrightService = new CommandResolverService(playwrightConfig as any);
      const result = playwrightService.getTestCommand('e2e');
      expect(result.some(cmd => cmd.includes('playwright'))).toBe(true);
    });

    it('should handle cypress for e2e', () => {
      const cypressConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          testing_frameworks: { javascript: ['cypress'] },
          primary_language: 'javascript',
        },
      };
      const cypressService = new CommandResolverService(cypressConfig as any);
      const result = cypressService.getTestCommand('e2e');
      expect(result.some(cmd => cmd.includes('cypress'))).toBe(true);
    });

    it('should handle testcafe for e2e', () => {
      const testcafeConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          testing_frameworks: { javascript: ['testcafe'] },
          primary_language: 'javascript',
        },
      };
      const testcafeService = new CommandResolverService(testcafeConfig as any);
      const result = testcafeService.getTestCommand('e2e');
      expect(result.some(cmd => cmd.includes('testcafe'))).toBe(true);
    });

    it('should use fallbacks when no frameworks detected', () => {
      const emptyConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'npm',
          testing_frameworks: {},
          primary_language: 'typescript',
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
      expect(result.some(cmd => cmd.includes('build'))).toBe(true);
    });

    it('should handle python build', () => {
      const pythonConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          testing_frameworks: {},
          primary_language: 'python',
        },
      };
      const pythonService = new CommandResolverService(pythonConfig as any);
      const result = pythonService.getBuildCommand();
      expect(result.some(cmd => cmd.includes('setup.py') || cmd.includes('pip install'))).toBe(true);
    });

    it('should handle go build', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          testing_frameworks: {},
          primary_language: 'go',
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getBuildCommand();
      expect(result.some(cmd => cmd.includes('go build'))).toBe(true);
    });

    it('should handle rust build', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          testing_frameworks: {},
          primary_language: 'rust',
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getBuildCommand();
      expect(result.some(cmd => cmd.includes('cargo build'))).toBe(true);
    });

    it('should handle java build', () => {
      const javaConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'maven',
          testing_frameworks: {},
          primary_language: 'java',
        },
      };
      const javaService = new CommandResolverService(javaConfig as any);
      const result = javaService.getBuildCommand();
      expect(result.some(cmd => cmd.includes('mvn') || cmd.includes('gradle'))).toBe(true);
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
          testing_frameworks: {},
          primary_language: 'javascript',
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
          testing_frameworks: {},
          primary_language: 'typescript',
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
          testing_frameworks: {},
          primary_language: 'python',
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
          testing_frameworks: {},
          primary_language: 'go',
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getInstallCommand();
      expect(result).toContain('go mod download');
    });

    it('should handle cargo package manager', () => {
      const cargoConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          testing_frameworks: {},
          primary_language: 'rust',
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
          testing_frameworks: {},
          primary_language: 'typescript',
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
      expect(result.some(cmd => cmd.includes('lint') || cmd.includes('eslint'))).toBe(true);
    });

    it('should get lint command for python', () => {
      const pythonConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          testing_frameworks: {},
          primary_language: 'python',
        },
      };
      const pythonService = new CommandResolverService(pythonConfig as any);
      const result = pythonService.getLintCommand();
      expect(result.some(cmd => cmd.includes('pylint') || cmd.includes('flake8') || cmd.includes('ruff'))).toBe(true);
    });

    it('should get lint command for go', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          testing_frameworks: {},
          primary_language: 'go',
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getLintCommand();
      expect(result.some(cmd => cmd.includes('golangci-lint') || cmd.includes('go vet'))).toBe(true);
    });

    it('should get lint command for rust', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          testing_frameworks: {},
          primary_language: 'rust',
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getLintCommand();
      expect(result.some(cmd => cmd.includes('cargo clippy'))).toBe(true);
    });
  });

  describe('getFormatCommand', () => {
    it('should get format command for typescript', () => {
      const result = service.getFormatCommand();
      expect(Array.isArray(result)).toBe(true);
      expect(result.some(cmd => cmd.includes('format') || cmd.includes('prettier'))).toBe(true);
    });

    it('should get format command for python', () => {
      const pythonConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'pip',
          testing_frameworks: {},
          primary_language: 'python',
        },
      };
      const pythonService = new CommandResolverService(pythonConfig as any);
      const result = pythonService.getFormatCommand();
      expect(result.some(cmd => cmd.includes('black') || cmd.includes('autopep8'))).toBe(true);
    });

    it('should get format command for go', () => {
      const goConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'go',
          testing_frameworks: {},
          primary_language: 'go',
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getFormatCommand();
      expect(result.some(cmd => cmd.includes('gofmt') || cmd.includes('go fmt'))).toBe(true);
    });

    it('should get format command for rust', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          package_manager: 'cargo',
          testing_frameworks: {},
          primary_language: 'rust',
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getFormatCommand();
      expect(result.some(cmd => cmd.includes('cargo fmt') || cmd.includes('rustfmt'))).toBe(true);
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
          testing_frameworks: {},
          primary_language: 'typescript',
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
          testing_frameworks: {},
          primary_language: 'python',
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
          testing_frameworks: {},
          primary_language: 'go',
        },
      };
      const goService = new CommandResolverService(goConfig as any);
      const result = goService.getPackageManager();
      expect(result).toBe('go');
    });

    it('should return cargo for rust', () => {
      const rustConfig = {
        project_name: 'test',
        stack_profile: {
          testing_frameworks: {},
          primary_language: 'rust',
        },
      };
      const rustService = new CommandResolverService(rustConfig as any);
      const result = rustService.getPackageManager();
      expect(result).toBe('cargo');
    });

    it('should default to npm for unknown language', () => {
      const unknownConfig = {
        project_name: 'test',
        stack_profile: {
          testing_frameworks: {},
          primary_language: 'unknown-lang',
        },
      };
      const unknownService = new CommandResolverService(unknownConfig as any);
      const result = unknownService.getPackageManager();
      expect(result).toBe('npm');
    });

  });

  describe('executeWithFallback', () => {
    it('should throw error when no commands provided', async () => {
      await expect(service.executeWithFallback([], '/test/path')).rejects.toThrow('No commands provided');
    });

    it('should execute first successful command', async () => {
      const result = await service.executeWithFallback(['echo "test"'], '/tmp');
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('test');
    });

    it('should try fallback when first command fails', async () => {
      const result = await service.executeWithFallback(
        ['this-command-does-not-exist', 'echo "fallback"'],
        '/tmp'
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('fallback');
    });

    it('should throw error when all commands fail', async () => {
      await expect(
        service.executeWithFallback(
          ['this-does-not-exist-1', 'this-does-not-exist-2'],
          '/tmp'
        )
      ).rejects.toThrow('All commands failed');
    });

    it('should handle timeout', async () => {
      await expect(
        service.executeWithFallback(['sleep 10'], '/tmp', 100)
      ).rejects.toThrow();
    });

    it('should try fallback when command returns non-zero exit code', async () => {
      const result = await service.executeWithFallback(
        ['exit 1', 'echo "second"'],
        '/tmp'
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('second');
    });

    it('should handle command that exits with error and fallback succeeds', async () => {
      const result = await service.executeWithFallback(
        ['false', 'true'],
        '/tmp'
      );
      expect(result.success).toBe(true);
    });

  });
});
