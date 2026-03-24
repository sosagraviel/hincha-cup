import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectConfigReaderService } from '../../../../src/services/implement-ticket/project-config-reader.service.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('ProjectConfigReaderService', () => {
  let service: ProjectConfigReaderService;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('framework-config.json')) {
        return JSON.stringify({
          version: '1.0.0',
          stack_profile: {
            languages: ['typescript'],
            primary_language: 'typescript',
            frameworks: { frontend: ['react'], backend: ['express'] },
            testing_frameworks: { typescript: ['vitest'] },
          },
        });
      }
      if (path.includes('stack-profile.json')) {
        return JSON.stringify({
          languages: ['typescript'],
          primary_language: 'typescript',
        });
      }
      return '{}';
    });

    service = new ProjectConfigReaderService('/test/project');
  });

  describe('isProjectInitialized', () => {
    it('should return true if framework config exists', () => {
      const result = ProjectConfigReaderService.isProjectInitialized('/test/project');
      expect(result).toBe(true);
    });

    it('should return false if framework config missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = ProjectConfigReaderService.isProjectInitialized('/test/project');
      expect(result).toBe(false);
    });
  });

  describe('readFrameworkConfig', () => {
    it('should read and parse framework config', () => {
      const config = service.readFrameworkConfig();
      expect(config.version).toBe('1.0.0');
    });

    it('should throw if file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => service.readFrameworkConfig()).toThrow();
    });
  });

  describe('readStackProfile', () => {
    it('should read stack profile from framework config', () => {
      const profile = service.readStackProfile();
      expect(profile.primary_language).toBe('typescript');
    });
  });

  describe('getTestCommands', () => {
    it('should return test commands', () => {
      const commands = service.getTestCommands();
      expect(commands).toBeDefined();
    });
  });

  describe('hasDocker', () => {
    it('should detect docker in infrastructure', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              infrastructure: ['docker'],
            },
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      expect(service.hasDocker()).toBe(true);
    });

    it('should return false if no docker', () => {
      expect(service.hasDocker()).toBe(false);
    });
  });

  describe('parseClaudeMd', () => {
    it('should parse CLAUDE.md sections', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('CLAUDE.md')) {
          return `# Project Context
## Stack Profile
- TypeScript
- React
## Test Commands
- npm test
## Build Commands
- npm run build
`;
        }
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: {} });
        }
        return '{}';
      });

      const result = service.parseClaudeMd();
      expect(result.stackSection).toContain('TypeScript');
      expect(result.testCommandsSection).toContain('npm test');
      expect(result.buildCommandsSection).toContain('npm run build');
    });

    it('should throw if CLAUDE.md not found', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('CLAUDE.md')) return false;
        return true;
      });

      expect(() => service.parseClaudeMd()).toThrow('Project not initialized');
    });

    it('should handle missing sections', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('CLAUDE.md')) {
          return '# Project Context';
        }
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: {} });
        }
        return '{}';
      });

      const result = service.parseClaudeMd();
      expect(result.stackSection).toBeUndefined();
      expect(result.testCommandsSection).toBeUndefined();
      expect(result.buildCommandsSection).toBeUndefined();
    });
  });

  describe('getBuildCommands', () => {
    it('should read build commands from package.json', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('package.json')) {
          return JSON.stringify({
            scripts: {
              build: 'tsc',
              dev: 'vite',
              start: 'node dist/index.js',
              lint: 'eslint .',
              format: 'prettier --write .'
            }
          });
        }
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: { primary_language: 'typescript' } });
        }
        return '{}';
      });

      const commands = service.getBuildCommands();
      expect(commands.build).toContain('npm run build');
      expect(commands.dev).toContain('npm run dev');
      expect(commands.start).toContain('npm start');
      expect(commands.lint).toContain('npm run lint');
      expect(commands.format).toContain('npm run format');
    });

    it('should use fallbacks for typescript without package.json', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('package.json')) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: { primary_language: 'typescript' } });
        }
        return '{}';
      });

      const commands = service.getBuildCommands();
      expect(commands.build).toContain('npm run build');
      expect(commands.dev).toContain('npm run dev');
      expect(commands.start).toContain('npm start');
    });

    it('should handle python build commands', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('package.json')) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: { primary_language: 'python' } });
        }
        return '{}';
      });

      const commands = service.getBuildCommands();
      expect(commands.build).toContain('python setup.py build');
      expect(commands.start).toContain('python main.py');
    });

    it('should handle go build commands', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('package.json')) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: { primary_language: 'go' } });
        }
        return '{}';
      });

      const commands = service.getBuildCommands();
      expect(commands.build).toContain('go build');
      expect(commands.start).toContain('go run .');
    });

    it('should handle rust build commands', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('package.json')) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: { primary_language: 'rust' } });
        }
        return '{}';
      });

      const commands = service.getBuildCommands();
      expect(commands.build).toContain('cargo build');
      expect(commands.start).toContain('cargo run');
    });

    it('should ignore package.json parse errors', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('package.json')) {
          return 'invalid json';
        }
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: { primary_language: 'typescript' } });
        }
        return '{}';
      });

      const commands = service.getBuildCommands();
      expect(commands.build).toContain('npm run build');
    });
  });

  describe('getTestCommands with different frameworks', () => {
    it('should detect jest commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: { javascript: ['jest'] }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      expect(commands.unit).toContain('npm test');
      expect(commands.unit).toContain('npx jest');
    });

    it('should detect pytest commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: { python: ['pytest'] }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      expect(commands.unit).toContain('pytest');
      expect(commands.unit).toContain('python -m pytest');
    });

    it('should detect mocha commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: { javascript: ['mocha'] }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      expect(commands.unit).toContain('npx mocha');
    });

    it('should detect go test commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: { go: ['testing'] }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      expect(commands.unit).toContain('go test ./...');
    });

    it('should detect rust cargo test commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: { rust: ['cargo'] }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      expect(commands.unit).toContain('cargo test');
    });

    it('should detect playwright e2e commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: { typescript: ['playwright'] }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      expect(commands.e2e).toContain('npx playwright test');
    });

    it('should detect cypress e2e commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: { javascript: ['cypress'] }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      expect(commands.e2e).toContain('npx cypress run');
    });

    it('should remove duplicate commands', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              testing_frameworks: {
                typescript: ['vitest'],
                javascript: ['vitest']
              }
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const commands = service.getTestCommands();
      const vitestCount = commands.unit.filter(cmd => cmd.includes('vitest')).length;
      expect(vitestCount).toBe(1);
    });
  });

  describe('getPrimaryLanguage', () => {
    it('should return primary language', () => {
      const result = service.getPrimaryLanguage();
      expect(result).toBe('typescript');
    });
  });

  describe('getLanguages', () => {
    it('should return all languages', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              languages: ['typescript', 'javascript', 'python']
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getLanguages();
      expect(result).toContain('typescript');
      expect(result).toContain('python');
    });

    it('should return empty array if no languages', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: {} });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getLanguages();
      expect(result).toEqual([]);
    });
  });

  describe('getFrontendFrameworks', () => {
    it('should return frontend frameworks', () => {
      const result = service.getFrontendFrameworks();
      expect(result).toContain('react');
    });

    it('should return empty array if no frontend frameworks', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: {} });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getFrontendFrameworks();
      expect(result).toEqual([]);
    });
  });

  describe('getBackendFrameworks', () => {
    it('should return backend frameworks', () => {
      const result = service.getBackendFrameworks();
      expect(result).toContain('express');
    });

    it('should return empty array if no backend frameworks', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({ stack_profile: {} });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getBackendFrameworks();
      expect(result).toEqual([]);
    });
  });

  describe('getInfrastructure', () => {
    it('should return infrastructure tools', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              infrastructure: ['docker', 'kubernetes']
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getInfrastructure();
      expect(result).toContain('docker');
      expect(result).toContain('kubernetes');
    });
  });

  describe('getWorkspaces', () => {
    it('should return detected workspaces', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              detected_workspaces: [
                { path: '/app', language: 'typescript', type: 'frontend', frameworks: ['react'] }
              ]
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getWorkspaces();
      expect(result.length).toBe(1);
      expect(result[0].language).toBe('typescript');
    });

    it('should fallback to workspaces property', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              workspaces: [
                { path: '/api', language: 'python' }
              ]
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getWorkspaces();
      expect(result.length).toBe(1);
    });
  });

  describe('getPackageManager', () => {
    it('should return package manager', () => {
      vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        if (path.includes('framework-config.json')) {
          return JSON.stringify({
            stack_profile: {
              package_manager: 'pnpm'
            }
          });
        }
        return '{}';
      });

      service = new ProjectConfigReaderService('/test/project');
      const result = service.getPackageManager();
      expect(result).toBe('pnpm');
    });
  });

  describe('validateInitialization', () => {
    it('should validate all required files exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = service.validateInitialization();
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing files', () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('SKILL.md')) return false;
        return true;
      });

      const result = service.validateInitialization();
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('.claude/project-context/SKILL.md');
    });
  });

  describe('error handling', () => {
    it('should throw error if framework config has invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json {');

      expect(() => service.readFrameworkConfig()).toThrow('Invalid JSON');
    });

    it('should throw error if framework config missing stack_profile', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' }));

      expect(() => service.readFrameworkConfig()).toThrow('missing stack_profile');
    });
  });
});
