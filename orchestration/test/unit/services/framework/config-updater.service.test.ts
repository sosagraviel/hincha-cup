import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigUpdaterService } from '../../../../src/services/framework/config-updater.service.js';
import type {
  FrameworkConfig,
  ResourceInfo,
} from '../../../../src/services/framework/config-updater.service.js';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as childProcess from 'child_process';

// Mock modules
vi.mock('fs');
vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('ajv', () => {
  const mockValidate = Object.assign(vi.fn().mockReturnValue(true), { errors: null });

  const MockAjv = vi.fn().mockImplementation(() => ({
    compile: vi.fn().mockReturnValue(mockValidate),
  }));

  return { default: MockAjv };
});
vi.mock('ajv-formats', () => ({
  default: vi.fn(),
}));

describe('ConfigUpdaterService', () => {
  let service: ConfigUpdaterService;
  const projectPath = '/test/project';
  const frameworkPath = '/test/framework';
  const configPath = '/test/project/.claude/framework-config.json';

  const createMockConfig = (overrides: Partial<FrameworkConfig> = {}): FrameworkConfig => ({
    version: '2.0.0',
    schema_version: '1.0.0',
    framework_version: '2.0.0',
    project_metadata: {
      project_path: '/test/project',
      initialization_hash: 'abc123',
      last_analysis: '2024-01-01T00:00:00Z',
    },
    analysis_results: {
      phase1_analysis: {},
      phase2_consolidation: {},
      phase3_synthesis: {
        synthesis_timestamp: '2024-01-01T00:00:00Z',
      },
      phase4_context: {},
    },
    stack_profile: {
      services: [
        {
          id: 'backend',
          name: 'Backend API',
          path: 'src/backend',
          type: 'backend',
          language: 'typescript',
          language_version: '5.3',
          frameworks: {
            main: 'Express',
          },
          testing: {
            unit: {
              framework: 'vitest',
            },
          },
          package_manager: 'npm',
          manifest_file: 'src/backend/package.json',
        },
        {
          id: 'frontend',
          name: 'Frontend Web',
          path: 'src/frontend',
          type: 'frontend',
          language: 'typescript',
          language_version: '5.3',
          frameworks: {
            main: 'React 19',
            ui: 'Tailwind CSS',
          },
          testing: {
            unit: {
              framework: 'vitest',
            },
          },
          package_manager: 'npm',
          manifest_file: 'src/frontend/package.json',
        },
      ],
      is_monorepo: false,
      package_manager: 'npm',
    },
    resource_state: {
      skills: {},
      agents: {},
      commands: {},
      last_sync: '2024-01-01T00:00:00Z',
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ConfigUpdaterService(projectPath, frameworkPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readConfig', () => {
    it('should read and parse config file', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.readConfig();

      expect(fs.existsSync).toHaveBeenCalledWith(configPath);
      expect(fsPromises.readFile).toHaveBeenCalledWith(configPath, 'utf-8');
      expect(result).toEqual(mockConfig);
    });

    it('should throw error if config file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(service.readConfig()).rejects.toThrow('Configuration file not found');
    });

    it('should throw error if config file is invalid JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue('invalid json');

      await expect(service.readConfig()).rejects.toThrow();
    });
  });

  describe('writeConfig', () => {
    it('should write config to file', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      await service.writeConfig(mockConfig);

      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        configPath,
        JSON.stringify(mockConfig, null, 2),
      );
    });

    it('should create directory if it does not exist', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      await service.writeConfig(mockConfig);

      expect(fsPromises.mkdir).toHaveBeenCalledWith(expect.stringContaining('.claude'), {
        recursive: true,
      });
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });
  });

  describe('validateConfig', () => {
    it('should validate config successfully', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ type: 'object' }));

      const result = await service.validateConfig(mockConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate config successfully with mocked Ajv', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ type: 'object' }));

      const result = await service.validateConfig(mockConfig);

      // With our mocked Ajv that always returns true
      expect(result.valid).toBe(true);
    });

    it('should detect invalid config structure', async () => {
      // Create an invalid config with missing required fields
      const invalidConfig = {
        version: '2.0.0',
        // Missing schema_version, framework_version, project_metadata, etc.
      } as any;

      const result = await service.validateConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('updateService', () => {
    it('should add a new service to stack profile', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const newService = {
        id: 'mobile',
        name: 'Mobile App',
        path: 'src/mobile',
        type: 'mobile' as const,
        language: 'typescript',
        language_version: '5.3',
        frameworks: {
          main: 'React Native',
        },
        package_manager: 'npm',
        manifest_file: 'src/mobile/package.json',
      };

      const result = await service.updateService(newService);

      expect(result.updated).toBe(true);
      expect(result.config?.stack_profile.services).toContainEqual(newService);
      expect(result.config?.stack_profile.services?.length).toBe(3);
    });

    it('should update an existing service', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const updatedBackendService = {
        id: 'backend',
        name: 'Updated Backend',
        path: 'src/backend',
        type: 'backend' as const,
        language: 'typescript',
        language_version: '5.4',
        frameworks: {
          main: 'NestJS',
        },
        package_manager: 'npm',
        manifest_file: 'src/backend/package.json',
      };

      const result = await service.updateService(updatedBackendService);

      expect(result.updated).toBe(true);
      expect(result.config?.stack_profile.services?.length).toBe(2);
      const updatedService = result.config?.stack_profile.services?.find((s) => s.id === 'backend');
      expect(updatedService?.name).toBe('Updated Backend');
      expect(updatedService?.language_version).toBe('5.4');
    });
  });

  describe('removeService', () => {
    it('should remove a service from stack profile', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const result = await service.removeService('frontend');

      expect(result).toBe(true);
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it('should return false if service does not exist', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.removeService('non-existent');

      expect(result).toBe(false);
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getService', () => {
    it('should retrieve a service by ID', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.getService('backend');

      expect(result).toBeDefined();
      expect(result?.id).toBe('backend');
      expect(result?.language).toBe('typescript');
    });

    it('should return undefined if service does not exist', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.getService('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('getServices', () => {
    it('should retrieve all services', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.getServices();

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('backend');
      expect(result[1].id).toBe('frontend');
    });
  });

  describe('updateResourceState', () => {
    it('should update skill resource state', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const metadata: Partial<ResourceInfo> = {
        managed_by_framework: true,
        file_hash: 'hash123',
        source_hash: 'source123',
      };

      const result = await service.updateResourceState('skills', 'test-skill', metadata);

      expect(result.resource_state.skills['test-skill']).toBeDefined();
      expect(result.resource_state.skills['test-skill'].managed_by_framework).toBe(true);
      expect(result.resource_state.skills['test-skill'].file_hash).toBe('hash123');
      expect(result.resource_state.skills['test-skill'].last_sync).toBeDefined();
    });

    it('should update agent resource state', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const metadata: Partial<ResourceInfo> = {
        managed_by_framework: true,
        template_hash: 'template123',
      };

      const result = await service.updateResourceState('agents', 'test-agent', metadata);

      expect(result.resource_state.agents['test-agent']).toBeDefined();
      expect(result.resource_state.agents['test-agent'].template_hash).toBe('template123');
    });

    it('should merge with existing resource state', async () => {
      const mockConfig = createMockConfig({
        resource_state: {
          skills: {
            'existing-skill': {
              managed_by_framework: true,
              file_hash: 'old-hash',
            },
          },
          agents: {},
          commands: {},
          last_sync: '2024-01-01T00:00:00Z',
        },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const result = await service.updateResourceState('skills', 'existing-skill', {
        file_hash: 'new-hash',
        source_hash: 'source123',
      });

      expect(result.resource_state.skills['existing-skill'].file_hash).toBe('new-hash');
      expect(result.resource_state.skills['existing-skill'].source_hash).toBe('source123');
      expect(result.resource_state.skills['existing-skill'].managed_by_framework).toBe(true);
    });
  });

  describe('removeResourceFromState', () => {
    it('should remove skill from resource state', async () => {
      const mockConfig = createMockConfig({
        resource_state: {
          skills: {
            'skill-to-remove': { managed_by_framework: true },
          },
          agents: {},
          commands: {},
          last_sync: '2024-01-01T00:00:00Z',
        },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const result = await service.removeResourceFromState('skills', 'skill-to-remove');

      expect(result).toBe(true);
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it('should return false if resource does not exist', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.removeResourceFromState('skills', 'non-existent');

      expect(result).toBe(false);
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('hashFile', () => {
    it('should hash file content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('file content');

      const hash = service.hashFile('/test/file.txt');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hash length
    });

    it('should throw error if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => service.hashFile('/test/missing.txt')).toThrow('File not found');
    });

    it('should produce different hashes for different content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValueOnce('content 1');
      const hash1 = service.hashFile('/test/file1.txt');

      vi.mocked(fs.readFileSync).mockReturnValueOnce('content 2');
      const hash2 = service.hashFile('/test/file2.txt');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashDirectory', () => {
    it('should hash directory contents', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['file1.txt', 'file2.txt'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('file content');

      const hash = service.hashDirectory('/test/dir');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    it('should throw error if directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => service.hashDirectory('/test/missing')).toThrow('Directory not found');
    });

    it('should recursively hash subdirectories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(['subdir', 'file1.txt'] as any)
        .mockReturnValueOnce(['file2.txt'] as any);

      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ isDirectory: () => true } as any)
        .mockReturnValueOnce({ isDirectory: () => false } as any)
        .mockReturnValueOnce({ isDirectory: () => false } as any);

      vi.mocked(fs.readFileSync).mockReturnValue('content');

      const hash = service.hashDirectory('/test/dir');

      expect(hash).toBeDefined();
    });
  });

  describe('detectUserModifications', () => {
    it('should detect modified skills', async () => {
      const mockConfig = createMockConfig({
        resource_state: {
          skills: {
            'modified-skill': {
              managed_by_framework: true,
              file_hash: 'original-hash',
            },
          },
          agents: {},
          commands: {},
          last_sync: '2024-01-01T00:00:00Z',
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.readdirSync).mockReturnValue(['file.txt'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('modified content');

      const result = await service.detectUserModifications();

      expect(result.skills.length).toBe(1);
      expect(result.skills[0].name).toBe('modified-skill');
      expect(result.skills[0].expectedHash).toBe('original-hash');
    });

    it('should detect modified agents', async () => {
      const mockConfig = createMockConfig({
        resource_state: {
          skills: {},
          agents: {
            'modified-agent': {
              managed_by_framework: true,
              file_hash: 'original-hash',
            },
          },
          commands: {},
          last_sync: '2024-01-01T00:00:00Z',
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.readFileSync).mockReturnValue('modified agent content');

      const result = await service.detectUserModifications();

      expect(result.agents.length).toBe(1);
      expect(result.agents[0].name).toBe('modified-agent');
    });

    it('should skip non-framework-managed resources', async () => {
      const mockConfig = createMockConfig({
        resource_state: {
          skills: {
            'user-skill': {
              managed_by_framework: false,
              file_hash: 'hash',
            },
          },
          agents: {},
          commands: {},
          last_sync: '2024-01-01T00:00:00Z',
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.detectUserModifications();

      expect(result.skills.length).toBe(0);
    });

    it('should skip resources with no hash', async () => {
      const mockConfig = createMockConfig({
        resource_state: {
          skills: {
            'no-hash-skill': {
              managed_by_framework: true,
            },
          },
          agents: {},
          commands: {},
          last_sync: '2024-01-01T00:00:00Z',
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.detectUserModifications();

      expect(result.skills.length).toBe(0);
    });
  });

  describe('markResourceAsUserManaged', () => {
    it('should mark skill as user-managed', async () => {
      const mockConfig = createMockConfig({
        resource_state: {
          skills: {
            'test-skill': {
              managed_by_framework: true,
            },
          },
          agents: {},
          commands: {},
          last_sync: '2024-01-01T00:00:00Z',
        },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.markResourceAsUserManaged('skills', 'test-skill');

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('user-managed'));

      consoleSpy.mockRestore();
    });

    it('should return false if resource does not exist', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await service.markResourceAsUserManaged('skills', 'non-existent');

      expect(result).toBe(false);
    });
  });

  describe('updateFrameworkVersion', () => {
    it('should update framework version', async () => {
      const mockConfig = createMockConfig({ framework_version: '1.0.0' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const result = await service.updateFrameworkVersion('2.5.0');

      expect(result.oldVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('2.5.0');
    });
  });

  describe('getFrameworkVersion', () => {
    it('should read version from package.json', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '3.0.0' }));

      const version = await service.getFrameworkVersion();

      expect(version).toBe('3.0.0');
    });

    it('should return default version if package.json not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const version = await service.getFrameworkVersion();

      expect(version).toBe('2.0.0');
    });

    it('should return default version if version not in package.json', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const version = await service.getFrameworkVersion();

      expect(version).toBe('2.0.0');
    });
  });

  describe('isFrameworkUpdated', () => {
    it('should detect version mismatch', async () => {
      const mockConfig = createMockConfig({ framework_version: '1.0.0' });
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // config exists
        .mockReturnValueOnce(true); // package.json exists
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '2.0.0' }));

      const result = await service.isFrameworkUpdated();

      expect(result.updated).toBe(true);
      expect(result.current).toBe('2.0.0');
      expect(result.configured).toBe('1.0.0');
    });

    it('should detect no update needed', async () => {
      const mockConfig = createMockConfig({ framework_version: '2.0.0' });
      vi.mocked(fs.existsSync).mockReturnValueOnce(true).mockReturnValueOnce(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '2.0.0' }));

      const result = await service.isFrameworkUpdated();

      expect(result.updated).toBe(false);
      expect(result.current).toBe('2.0.0');
      expect(result.configured).toBe('2.0.0');
    });
  });

  describe('generateProjectHash', () => {
    it('should generate project hash using find command', () => {
      vi.mocked(childProcess.execSync).mockReturnValue('abc123def456\n');

      const hash = service.generateProjectHash();

      expect(hash).toBe('abc123def456');
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('find'),
        expect.any(Object),
      );
    });

    it('should return random hash if find command fails', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('find failed');
      });

      const hash = service.generateProjectHash();

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not generate project hash'),
        expect.any(String),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('detectProjectChanges', () => {
    it('should detect project changes', async () => {
      const mockConfig = createMockConfig({
        project_metadata: {
          project_path: '/test/project',
          initialization_hash: 'old-hash',
          last_analysis: '2024-01-01T00:00:00Z',
        },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(childProcess.execSync).mockReturnValue('new-hash\n');

      const result = await service.detectProjectChanges();

      expect(result.changed).toBe(true);
      expect(result.currentHash).toBe('new-hash');
      expect(result.storedHash).toBe('old-hash');
    });

    it('should detect no changes', async () => {
      const mockConfig = createMockConfig({
        project_metadata: {
          project_path: '/test/project',
          initialization_hash: 'same-hash',
          last_analysis: '2024-01-01T00:00:00Z',
        },
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(childProcess.execSync).mockReturnValue('same-hash\n');

      const result = await service.detectProjectChanges();

      expect(result.changed).toBe(false);
      expect(result.currentHash).toBe('same-hash');
    });
  });

  describe('updateProjectMetadata', () => {
    it('should update project metadata', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
      vi.mocked(childProcess.execSync).mockReturnValue('new-hash\n');

      const result = await service.updateProjectMetadata({ custom_field: 'value' });

      expect(result.project_metadata.custom_field).toBe('value');
      expect(result.project_metadata.last_analysis).toBeDefined();
      expect(result.project_metadata.initialization_hash).toBeDefined();
    });

    it('should not override provided initialization_hash', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);

      const result = await service.updateProjectMetadata({ initialization_hash: 'custom-hash' });

      expect(result.project_metadata.initialization_hash).toBe('custom-hash');
    });
  });

  describe('getAllFiles', () => {
    it('should get all files recursively', () => {
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(['file1.txt', 'subdir'] as any)
        .mockReturnValueOnce(['file2.txt'] as any);

      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ isDirectory: () => false } as any)
        .mockReturnValueOnce({ isDirectory: () => true } as any)
        .mockReturnValueOnce({ isDirectory: () => false } as any);

      const files = service.getAllFiles('/test/dir');

      expect(files.length).toBe(2);
      expect(files.some((f) => f.includes('file1.txt'))).toBe(true);
      expect(files.some((f) => f.includes('file2.txt'))).toBe(true);
    });

    it('should handle empty directory', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);

      const files = service.getAllFiles('/test/empty');

      expect(files.length).toBe(0);
    });
  });
});
