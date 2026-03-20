import { describe, it, expect } from 'vitest';
import { ConfigGenerator } from '../../../src/core/config-generator/index.js';
import { HashCalculator } from '../../../src/core/config-generator/hash-calculator.js';
import type { StackProfile } from '../../../src/core/stack-detector/types.js';
import type { Skill } from '../../../src/core/skill-resolver/types.js';
import type { AgentTracking } from '../../../src/core/agent-generator/types.js';

describe('ConfigGenerator', () => {
  describe('Configuration Generation', () => {
    it('should generate valid framework config', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const skills: Skill[] = [{
        name: 'typescript-fundamentals',
        path: '020-languages/typescript',
        reason: 'Detected typescript',
        description: 'TypeScript fundamentals',
        category: 'language'
      }];

      const agentsTracking: Record<string, AgentTracking> = {
        planner: {
          template_path: '/path/to/template',
          generated_timestamp: new Date().toISOString(),
          template_hash: 'hash123',
          file_hash: 'hash456',
          managed_by_framework: true,
          user_modified: false,
          language: null,
          category: 'planning',
          last_sync: new Date().toISOString()
        }
      };

      const generator = new ConfigGenerator(
        process.cwd(),
        process.env.FRAMEWORK_PATH || ''
      );

      const config = await generator.generate(stackProfile, skills, agentsTracking);

      expect(config.version).toBe('1.0.0');
      expect(config.project_metadata.project_hash).toBeDefined();
      expect(config.analysis_results.stack_profile).toEqual(stackProfile);
      expect(config.resource_state.agents).toEqual(agentsTracking);
    });

    it('should include all required metadata', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const generator = new ConfigGenerator(
        process.cwd(),
        process.env.FRAMEWORK_PATH || ''
      );

      const config = await generator.generate(stackProfile, [], {});

      expect(config.project_metadata.project_name).toBeDefined();
      expect(config.project_metadata.initialized_at).toBeDefined();
      expect(config.project_metadata.last_updated).toBeDefined();
      expect(config.settings.auto_sync_agents).toBe(true);
    });
  });
});

describe('HashCalculator', () => {
  describe('File Hashing', () => {
    it('should calculate consistent hash for same content', () => {
      const content = 'test content';
      const hash1 = HashCalculator.calculateFileHash(content);
      const hash2 = HashCalculator.calculateFileHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64-char hex
    });

    it('should calculate different hashes for different content', () => {
      const hash1 = HashCalculator.calculateFileHash('content1');
      const hash2 = HashCalculator.calculateFileHash('content2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Project Hashing', () => {
    it('should calculate project hash', async () => {
      const hash = await HashCalculator.calculateProjectHash(process.cwd());

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });
});
