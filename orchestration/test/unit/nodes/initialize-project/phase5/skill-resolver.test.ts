import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveSkills,
  copyResolvedSkills,
} from '../../../../../src/nodes/initialize-project/phase5/skill-resolver.js';
import type {
  ResolvedSkill,
  SkillConfig,
} from '../../../../../src/nodes/initialize-project/phase5/types.js';
import type { StackProfile } from '../../../../../src/schemas/index.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('skill-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockStackProfile = (overrides: Partial<StackProfile> = {}): StackProfile => ({
    services: [
      {
        id: 'main',
        path: '.',
        type: 'backend',
        language: 'typescript',
        frameworks: {
          main: 'express',
        },
      },
    ],
    is_monorepo: false,
    ...overrides,
  });

  const createSkillsConfig = (skills: Partial<SkillConfig>[]): { skills: SkillConfig[] } => ({
    skills: skills.map((s) => ({
      name: s.name || 'test-skill',
      path: s.path || '010-foundation/test-skill',
      description: s.description || 'Test skill',
      triggers: s.triggers,
      trigger_mode: s.trigger_mode || 'triggered',
      compatible_languages: s.compatible_languages,
      is_linkable_to_agents: s.is_linkable_to_agents,
    })),
  });

  describe('resolveSkills', () => {
    it('should load and resolve skills from config', () => {
      const stackProfile = createMockStackProfile();
      const skillsConfig = createSkillsConfig([
        {
          name: 'typescript-skill',
          path: '020-languages/typescript',
          triggers: ['typescript'],
          compatible_languages: ['typescript'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.length).toBeGreaterThan(0);
      const tsSkill = resolved.find((s) => s.name === 'typescript-skill');
      expect(tsSkill).toBeDefined();
      expect(tsSkill?.reason).toContain('typescript');
    });

    it('should include always-mode skills', () => {
      const stackProfile = createMockStackProfile();
      const skillsConfig = createSkillsConfig([
        {
          name: 'always-skill',
          path: '010-foundation/always-skill',
          trigger_mode: 'always',
          triggers: [],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      const alwaysSkill = resolved.find((s) => s.name === 'always-skill');
      expect(alwaysSkill).toBeDefined();
      expect(alwaysSkill?.reason).toBe('Always included');
      expect(alwaysSkill?.trigger_mode).toBe('always');
    });

    it('should skip generated-mode skills', () => {
      const stackProfile = createMockStackProfile();
      const skillsConfig = createSkillsConfig([
        {
          name: 'generated-skill',
          path: '010-foundation/project-context',
          trigger_mode: 'generated',
          triggers: [],
        },
        {
          name: 'normal-skill',
          path: '010-foundation/normal',
          trigger_mode: 'triggered',
          triggers: ['typescript'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'generated-skill')).toBeUndefined();
      expect(resolved.find((s) => s.name === 'normal-skill')).toBeDefined();
    });

    it('should match skills by framework triggers', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'frontend',
            path: 'apps/web',
            type: 'frontend',
            language: 'typescript',
            frameworks: {
              main: 'react',
              additional: ['nextjs'],
            },
          },
          {
            id: 'backend',
            path: 'apps/api',
            type: 'backend',
            language: 'typescript',
            frameworks: {
              main: 'express',
            },
          },
        ],
        is_monorepo: true,
      });
      const skillsConfig = createSkillsConfig([
        {
          name: 'react-skill',
          path: '030-frameworks/react',
          triggers: ['react'],
        },
        {
          name: 'vue-skill',
          path: '030-frameworks/vue',
          triggers: ['vue'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'react-skill')).toBeDefined();
      expect(resolved.find((s) => s.name === 'vue-skill')).toBeUndefined();
    });

    it('should match skills by testing framework triggers', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'main',
            path: '.',
            type: 'backend',
            language: 'typescript',
            frameworks: {
              main: 'express',
            },
            testing: {
              unit: {
                framework: 'vitest',
              },
              e2e: {
                framework: 'playwright',
              },
            },
          },
        ],
        is_monorepo: false,
      });
      const skillsConfig = createSkillsConfig([
        {
          name: 'vitest-skill',
          path: '040-testing/vitest',
          triggers: ['vitest'],
        },
        {
          name: 'jest-skill',
          path: '040-testing/jest',
          triggers: ['jest'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'vitest-skill')).toBeDefined();
      expect(resolved.find((s) => s.name === 'jest-skill')).toBeUndefined();
    });

    it('should match skills by infrastructure triggers', () => {
      const stackProfile = createMockStackProfile({
        infrastructure: ['docker', 'kubernetes'],
      });
      const skillsConfig = createSkillsConfig([
        {
          name: 'docker-skill',
          path: '050-infrastructure/docker',
          triggers: ['docker'],
        },
        {
          name: 'terraform-skill',
          path: '050-infrastructure/terraform',
          triggers: ['terraform'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'docker-skill')).toBeDefined();
      expect(resolved.find((s) => s.name === 'terraform-skill')).toBeUndefined();
    });

    it('should match skills from detected workspaces', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'web',
            path: 'packages/web',
            type: 'frontend',
            language: 'typescript',
            frameworks: {
              main: 'svelte',
              additional: ['vite'],
            },
          },
        ],
        is_monorepo: true,
      });
      const skillsConfig = createSkillsConfig([
        {
          name: 'svelte-skill',
          path: '030-frameworks/svelte',
          triggers: ['svelte'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'svelte-skill')).toBeDefined();
    });

    it('should handle multiple languages', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'backend-ts',
            path: 'apps/api-ts',
            type: 'backend',
            language: 'typescript',
            frameworks: {
              main: 'express',
            },
          },
          {
            id: 'backend-py',
            path: 'apps/api-py',
            type: 'backend',
            language: 'python',
            frameworks: {
              main: 'django',
            },
          },
          {
            id: 'backend-go',
            path: 'apps/api-go',
            type: 'backend',
            language: 'go',
            frameworks: {
              main: 'gin',
            },
          },
        ],
        is_monorepo: true,
      });
      const skillsConfig = createSkillsConfig([
        {
          name: 'ts-skill',
          path: '020-languages/typescript',
          triggers: ['typescript'],
          compatible_languages: ['typescript'],
        },
        {
          name: 'py-skill',
          path: '020-languages/python',
          triggers: ['python'],
          compatible_languages: ['python'],
        },
        {
          name: 'go-skill',
          path: '020-languages/go',
          triggers: ['go'],
          compatible_languages: ['go'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'ts-skill')).toBeDefined();
      expect(resolved.find((s) => s.name === 'py-skill')).toBeDefined();
      expect(resolved.find((s) => s.name === 'go-skill')).toBeDefined();
    });

    it('should throw error when skills config not found', () => {
      const stackProfile = createMockStackProfile();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => {
        resolveSkills(stackProfile, '/test/framework');
      }).toThrow('Skills config not found');
    });

    it('should handle skills without triggers', () => {
      const stackProfile = createMockStackProfile();
      const skillsConfig = createSkillsConfig([
        {
          name: 'no-triggers-skill',
          path: '010-foundation/no-triggers',
          triggers: undefined,
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'no-triggers-skill')).toBeUndefined();
    });

    it('should handle empty triggers array', () => {
      const stackProfile = createMockStackProfile();
      const skillsConfig = createSkillsConfig([
        {
          name: 'empty-triggers-skill',
          path: '010-foundation/empty-triggers',
          triggers: [],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'empty-triggers-skill')).toBeUndefined();
    });

    it('should normalize framework names for matching', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'frontend',
            path: 'apps/web',
            type: 'frontend',
            language: 'typescript',
            frameworks: {
              main: 'Next.js',
              ui: '@angular/core',
            },
          },
        ],
        is_monorepo: false,
      });
      const skillsConfig = createSkillsConfig([
        {
          name: 'nextjs-skill',
          path: '030-frameworks/nextjs',
          triggers: ['nextjs'],
        },
        {
          name: 'angular-skill',
          path: '030-frameworks/angular',
          triggers: ['angular'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'nextjs-skill')).toBeDefined();
      expect(resolved.find((s) => s.name === 'angular-skill')).toBeDefined();
    });

    it('should include is_linkable_to_agents property', () => {
      const stackProfile = createMockStackProfile();
      const skillsConfig = createSkillsConfig([
        {
          name: 'linkable-skill',
          path: '010-foundation/linkable',
          trigger_mode: 'always',
          is_linkable_to_agents: true,
        },
        {
          name: 'non-linkable-skill',
          path: '010-foundation/non-linkable',
          trigger_mode: 'always',
          is_linkable_to_agents: false,
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'linkable-skill')?.is_linkable_to_agents).toBe(true);
      expect(resolved.find((s) => s.name === 'non-linkable-skill')?.is_linkable_to_agents).toBe(
        false,
      );
    });

    it('should include compatible_languages property', () => {
      const stackProfile = createMockStackProfile();
      const skillsConfig = createSkillsConfig([
        {
          name: 'multi-lang-skill',
          path: '010-foundation/multi-lang',
          trigger_mode: 'always',
          compatible_languages: ['typescript', 'javascript', 'python'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      const skill = resolved.find((s) => s.name === 'multi-lang-skill');
      expect(skill?.compatible_languages).toEqual(['typescript', 'javascript', 'python']);
    });

    it('should handle mobile frameworks', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'mobile',
            path: 'apps/mobile',
            type: 'mobile',
            language: 'typescript',
            frameworks: {
              main: 'react-native',
              additional: ['flutter'],
            },
          },
        ],
        is_monorepo: false,
      });
      const skillsConfig = createSkillsConfig([
        {
          name: 'react-native-skill',
          path: '030-frameworks/react-native',
          triggers: ['reactnative'],
        },
        {
          name: 'flutter-skill',
          path: '030-frameworks/flutter',
          triggers: ['flutter'],
        },
      ]);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(skillsConfig));

      const resolved = resolveSkills(stackProfile, '/test/framework');

      expect(resolved.find((s) => s.name === 'react-native-skill')).toBeDefined();
      expect(resolved.find((s) => s.name === 'flutter-skill')).toBeDefined();
    });
  });

  describe('copyResolvedSkills', () => {
    it('should copy skills to project directory', () => {
      const skills: ResolvedSkill[] = [
        {
          name: 'test-skill',
          path: '/framework/skills/010-foundation/test-skill',
          relative_path: '010-foundation/test-skill',
          reason: 'Test',
          description: 'Test skill',
        },
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['SKILL.md' as any]);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);

      const fileCount = copyResolvedSkills(skills, '/test/project');

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/test/project', '.claude', 'skills'), {
        recursive: true,
      });
      expect(fileCount).toBeGreaterThan(0);
    });

    it('should flatten directory structure when copying', () => {
      const skills: ResolvedSkill[] = [
        {
          name: 'nested-skill',
          path: '/framework/skills/020-languages/typescript',
          relative_path: '020-languages/typescript',
          reason: 'Test',
          description: 'Nested skill',
        },
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['SKILL.md' as any]);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);

      copyResolvedSkills(skills, '/test/project');

      // Skills are copied to .claude/skills/{skill-name}, flattened structure
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringMatching(/\/\.claude\/skills\/nested-skill$/),
        { recursive: true },
      );
    });

    it('should copy directory recursively', () => {
      const skills: ResolvedSkill[] = [
        {
          name: 'skill-with-subdirs',
          path: '/framework/skills/010-foundation/complex-skill',
          relative_path: '010-foundation/complex-skill',
          reason: 'Test',
          description: 'Complex skill',
        },
      ];

      let callCount = 0;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return ['subdir' as any, 'SKILL.md' as any];
        }
        return ['nested.md' as any];
      });
      vi.mocked(fs.statSync).mockImplementation((p: any) => {
        const pathStr = String(p);
        if (pathStr.includes('subdir') && !pathStr.includes('nested.md')) {
          return { isDirectory: () => true } as any;
        }
        return { isDirectory: () => false } as any;
      });

      const fileCount = copyResolvedSkills(skills, '/test/project');

      expect(fileCount).toBe(2); // SKILL.md + nested.md
    });

    it('should handle empty skills array', () => {
      const skills: ResolvedSkill[] = [];

      const fileCount = copyResolvedSkills(skills, '/test/project');

      expect(fileCount).toBe(0);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/test/project', '.claude', 'skills'), {
        recursive: true,
      });
    });

    it('should handle non-existent source directory', () => {
      const skills: ResolvedSkill[] = [
        {
          name: 'missing-skill',
          path: '/framework/skills/missing',
          relative_path: 'missing',
          reason: 'Test',
          description: 'Missing skill',
        },
      ];

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const fileCount = copyResolvedSkills(skills, '/test/project');

      expect(fileCount).toBe(0);
    });

    it('should copy multiple skills', () => {
      const skills: ResolvedSkill[] = [
        {
          name: 'skill1',
          path: '/framework/skills/skill1',
          relative_path: 'skill1',
          reason: 'Test',
          description: 'Skill 1',
        },
        {
          name: 'skill2',
          path: '/framework/skills/skill2',
          relative_path: 'skill2',
          reason: 'Test',
          description: 'Skill 2',
        },
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['SKILL.md' as any]);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);

      const fileCount = copyResolvedSkills(skills, '/test/project');

      expect(fileCount).toBe(2);
    });

    it('should use copyFileSync for individual files', () => {
      const skills: ResolvedSkill[] = [
        {
          name: 'test-skill',
          path: '/framework/skills/test-skill',
          relative_path: 'test-skill',
          reason: 'Test',
          description: 'Test',
        },
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['SKILL.md' as any]);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);

      copyResolvedSkills(skills, '/test/project');

      expect(fs.copyFileSync).toHaveBeenCalled();
    });
  });
});
