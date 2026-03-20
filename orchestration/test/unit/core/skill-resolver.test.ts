import { describe, it, expect } from 'vitest';
import { SkillResolver } from '../../../src/core/skill-resolver/index.js';
import { TriggerMatcher } from '../../../src/core/skill-resolver/trigger-matcher.js';
import type { StackProfile } from '../../../src/core/stack-detector/types.js';

describe('SkillResolver', () => {
  const frameworkPath = process.env.FRAMEWORK_PATH || '';

  describe('Skill Resolution', () => {
    it('should resolve always category skills', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const resolver = new SkillResolver(frameworkPath);
      const skills = await resolver.resolve(stackProfile);
      
      // Foundation skills with category 'always' should be included
      const alwaysSkills = skills.filter(s => s.category === 'always');
      expect(alwaysSkills.length).toBeGreaterThan(0);
    });

    it('should resolve language-specific skills', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'npm',
        workspace_type: 'single'
      };

      const resolver = new SkillResolver(frameworkPath);
      const skills = await resolver.resolve(stackProfile);
      
      // Should include TypeScript-specific skills
      const tsSkills = skills.filter(s => 
        s.compatible_languages?.includes('typescript')
      );
      expect(tsSkills.length).toBeGreaterThan(0);
    });

    it('should resolve framework-specific skills', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        frameworks: {
          frontend: ['react']
        },
        package_manager: 'npm',
        workspace_type: 'single'
      };

      const resolver = new SkillResolver(frameworkPath);
      const skills = await resolver.resolve(stackProfile);
      
      // Should include React-specific skills
      expect(skills.length).toBeGreaterThan(0);
    });

    it('should generate reasons for skill inclusion', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const resolver = new SkillResolver(frameworkPath);
      const skills = await resolver.resolve(stackProfile);
      
      // All skills should have a reason
      skills.forEach(skill => {
        expect(skill.reason).toBeDefined();
        expect(skill.reason.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('TriggerMatcher', () => {
  describe('Language Matching', () => {
    it('should match single language', () => {
      const triggers = { languages: ['typescript'] };
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'npm',
        workspace_type: 'single'
      };

      const matches = TriggerMatcher.matches(triggers, stackProfile);
      expect(matches).toBe(true);
    });

    it('should match language objects', () => {
      const triggers = { languages: ['typescript'] };
      const stackProfile: StackProfile = {
        languages: [{ name: 'typescript', version: '5.0.0' }],
        package_manager: 'npm',
        workspace_type: 'single'
      };

      const matches = TriggerMatcher.matches(triggers, stackProfile);
      expect(matches).toBe(true);
    });

    it('should not match missing language', () => {
      const triggers = { languages: ['rust'] };
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'npm',
        workspace_type: 'single'
      };

      const matches = TriggerMatcher.matches(triggers, stackProfile);
      expect(matches).toBe(false);
    });
  });

  describe('Framework Matching', () => {
    it('should match frontend framework', () => {
      const triggers = { frameworks: ['react'] };
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        frameworks: {
          frontend: ['react']
        },
        package_manager: 'npm',
        workspace_type: 'single'
      };

      const matches = TriggerMatcher.matches(triggers, stackProfile);
      expect(matches).toBe(true);
    });

    it('should match backend framework', () => {
      const triggers = { frameworks: ['express'] };
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        frameworks: {
          backend: ['express']
        },
        package_manager: 'npm',
        workspace_type: 'single'
      };

      const matches = TriggerMatcher.matches(triggers, stackProfile);
      expect(matches).toBe(true);
    });
  });

  describe('Package Manager Matching', () => {
    it('should match package manager', () => {
      const triggers = { package_manager: 'pnpm' };
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const matches = TriggerMatcher.matches(triggers, stackProfile);
      expect(matches).toBe(true);
    });
  });

  describe('Workspace Type Matching', () => {
    it('should match monorepo workspace', () => {
      const triggers = { workspace_type: 'monorepo' as const };
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'monorepo'
      };

      const matches = TriggerMatcher.matches(triggers, stackProfile);
      expect(matches).toBe(true);
    });
  });
});
