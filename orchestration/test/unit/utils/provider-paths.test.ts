import { describe, it, expect, afterEach } from 'vitest';
import {
  setActiveProvider,
  getActiveProvider,
  getProviderPaths,
  resolveConfigPath,
  resolveInstructionFilePath,
  resolveTempPath,
  resolveBackupPath,
  resolveFrameworkConfigPath,
  getInstructionFileName,
} from '../../../src/utils/provider-paths.js';
import { Provider } from '../../../src/providers/types.js';

describe('provider-paths', () => {
  afterEach(() => {
    // Reset to default after each test
    setActiveProvider(Provider.CLAUDE);
  });

  describe('setActiveProvider / getActiveProvider', () => {
    it('should default to CLAUDE', () => {
      expect(getActiveProvider()).toBe(Provider.CLAUDE);
    });

    it('should set and get CODEX', () => {
      setActiveProvider(Provider.CODEX);
      expect(getActiveProvider()).toBe(Provider.CODEX);
    });
  });

  describe('getProviderPaths', () => {
    it('should return claude paths by default', () => {
      const paths = getProviderPaths();
      expect(paths.configDir).toBe('.claude');
      expect(paths.instructionFile).toBe('CLAUDE.md');
      expect(paths.tempDir).toBe('.claude-temp');
    });

    it('should return codex paths when active', () => {
      setActiveProvider(Provider.CODEX);
      const paths = getProviderPaths();
      expect(paths.configDir).toBe('.codex');
      expect(paths.instructionFile).toBe('AGENTS.md');
      expect(paths.tempDir).toBe('.codex-temp');
    });

    it('should accept explicit provider parameter', () => {
      const claudePaths = getProviderPaths(Provider.CLAUDE);
      const codexPaths = getProviderPaths(Provider.CODEX);
      expect(claudePaths.configDir).toBe('.claude');
      expect(codexPaths.configDir).toBe('.codex');
    });
  });

  describe('resolveConfigPath', () => {
    it('should resolve claude config path by default', () => {
      expect(resolveConfigPath('/project')).toBe('/project/.claude');
    });

    it('should resolve codex config path when active', () => {
      setActiveProvider(Provider.CODEX);
      expect(resolveConfigPath('/project')).toBe('/project/.codex');
    });

    it('should resolve nested paths', () => {
      expect(resolveConfigPath('/project', 'skills', 'my-skill')).toBe(
        '/project/.claude/skills/my-skill',
      );
    });

    it('should resolve nested paths for codex', () => {
      setActiveProvider(Provider.CODEX);
      expect(resolveConfigPath('/project', 'skills', 'my-skill')).toBe(
        '/project/.codex/skills/my-skill',
      );
    });
  });

  describe('resolveInstructionFilePath', () => {
    it('should resolve CLAUDE.md path', () => {
      expect(resolveInstructionFilePath('/project')).toBe('/project/.claude/CLAUDE.md');
    });

    it('should resolve AGENTS.md path for codex', () => {
      setActiveProvider(Provider.CODEX);
      expect(resolveInstructionFilePath('/project')).toBe('/project/.codex/AGENTS.md');
    });
  });

  describe('resolveTempPath', () => {
    it('should resolve claude temp path', () => {
      expect(resolveTempPath('/project')).toBe('/project/.claude-temp');
    });

    it('should resolve codex temp path', () => {
      setActiveProvider(Provider.CODEX);
      expect(resolveTempPath('/project')).toBe('/project/.codex-temp');
    });

    it('should resolve nested temp paths', () => {
      expect(resolveTempPath('/project', 'initialize-project')).toBe(
        '/project/.claude-temp/initialize-project',
      );
    });
  });

  describe('resolveBackupPath', () => {
    it('should resolve claude backup path', () => {
      expect(resolveBackupPath('/project', '2026-01-01')).toBe(
        '/project/.claude-backups/2026-01-01',
      );
    });

    it('should resolve codex backup path', () => {
      setActiveProvider(Provider.CODEX);
      expect(resolveBackupPath('/project', '2026-01-01')).toBe(
        '/project/.codex-backups/2026-01-01',
      );
    });
  });

  describe('resolveFrameworkConfigPath', () => {
    it('should resolve claude framework-config.json path', () => {
      expect(resolveFrameworkConfigPath('/project')).toBe('/project/.claude/framework-config.json');
    });

    it('should resolve codex framework-config.json path', () => {
      setActiveProvider(Provider.CODEX);
      expect(resolveFrameworkConfigPath('/project')).toBe('/project/.codex/framework-config.json');
    });
  });

  describe('getInstructionFileName', () => {
    it('should return CLAUDE.md by default', () => {
      expect(getInstructionFileName()).toBe('CLAUDE.md');
    });

    it('should return AGENTS.md for codex', () => {
      setActiveProvider(Provider.CODEX);
      expect(getInstructionFileName()).toBe('AGENTS.md');
    });

    it('should accept explicit provider parameter', () => {
      expect(getInstructionFileName(Provider.CLAUDE)).toBe('CLAUDE.md');
      expect(getInstructionFileName(Provider.CODEX)).toBe('AGENTS.md');
    });
  });
});
