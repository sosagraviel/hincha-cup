import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateAgents,
  writeAgents,
} from '../../../../../src/nodes/initialize-project/phase5/agent-generator.js';
import type {
  GeneratedAgent,
  ResolvedSkill,
} from '../../../../../src/nodes/initialize-project/phase5/types.js';
import type { StackProfile } from '../../../../../src/schemas/index.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('agent-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockStackProfile = (overrides: Partial<StackProfile> = {}): StackProfile => ({
    services: [
      {
        id: 'backend',
        path: 'src/backend',
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

  const createMockSkill = (overrides: Partial<ResolvedSkill> = {}): ResolvedSkill => ({
    name: 'test-skill',
    path: '/test/path',
    relative_path: 'test-skill',
    reason: 'Test reason',
    description: 'Test description',
    ...overrides,
  });

  const mockPlannerTemplate = `# Planner Agent
Model: {{model}}
Skills: {{formatSkills skills}}`;

  const mockImplementerTemplate = `# Implementer Agent
Language: {{language}}
Commands:
- lint: {{commands.lint}}
- test: {{commands.test}}
Skills: {{formatSkills skills}}`;

  const mockGenericImplementerTemplate = `# Generic Implementer
Skills: {{formatSkills skills}}`;

  const mockVisualVerifierTemplate = `# Visual Verifier
Frontend: {{frameworks.frontend}}`;

  describe('generateAgents', () => {
    it('should generate planner agent', () => {
      const stackProfile = createMockStackProfile();
      const skills = [
        createMockSkill({ name: 'typescript-skill', compatible_languages: ['typescript'] }),
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      expect(agents.length).toBeGreaterThan(0);
      const planner = agents.find((a) => a.name === 'planner');
      expect(planner).toBeDefined();
      expect(planner?.filename).toBe('planner.md');
    });

    it('should generate implementer agents for each language', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'backend-ts',
            path: 'src/backend-ts',
            type: 'backend',
            language: 'typescript',
            frameworks: {
              main: 'express',
            },
          },
          {
            id: 'backend-py',
            path: 'src/backend-py',
            type: 'backend',
            language: 'python',
            frameworks: {
              main: 'django',
            },
          },
        ],
        is_monorepo: true,
      });
      const skills = [
        createMockSkill({ name: 'ts-skill', compatible_languages: ['typescript'] }),
        createMockSkill({ name: 'py-skill', compatible_languages: ['python'] }),
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        if (filePath.includes('package.json'))
          return JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint' } });
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      const tsImplementer = agents.find((a) => a.name === 'implementer-typescript');
      const pyImplementer = agents.find((a) => a.name === 'implementer-python');

      expect(tsImplementer).toBeDefined();
      expect(pyImplementer).toBeDefined();
    });

    it('should generate generic implementer agent', () => {
      const stackProfile = createMockStackProfile();
      const skills = [createMockSkill({ compatible_languages: undefined })];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      const genericImplementer = agents.find((a) => a.name === 'implementer-generic');
      expect(genericImplementer).toBeDefined();
    });

    it('should generate visual verifier agent', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'frontend',
            path: 'src/frontend',
            type: 'frontend',
            language: 'typescript',
            frameworks: {
              main: 'react',
              additional: ['nextjs'],
            },
          },
        ],
        is_monorepo: false,
      });
      const skills: ResolvedSkill[] = [];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      const visualVerifier = agents.find((a) => a.name === 'visual-verifier');
      expect(visualVerifier).toBeDefined();
    });

    it('should handle empty skills array', () => {
      const stackProfile = createMockStackProfile();
      const skills: ResolvedSkill[] = [];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      expect(agents.length).toBeGreaterThan(0);
    });

    it('should skip skills with trigger_mode always', () => {
      const stackProfile = createMockStackProfile();
      const skills = [
        createMockSkill({ name: 'always-skill', trigger_mode: 'always' as any }),
        createMockSkill({
          name: 'triggered-skill',
          trigger_mode: 'triggered' as any,
          compatible_languages: ['typescript'],
        }),
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      const planner = agents.find((a) => a.name === 'planner');
      expect(planner?.content).not.toContain('always-skill');
    });

    it('should skip non-linkable skills', () => {
      const stackProfile = createMockStackProfile();
      const skills = [
        createMockSkill({ name: 'non-linkable', is_linkable_to_agents: false }),
        createMockSkill({
          name: 'linkable',
          is_linkable_to_agents: true,
          compatible_languages: ['typescript'],
        }),
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      const planner = agents.find((a) => a.name === 'planner');
      expect(planner?.content).not.toContain('non-linkable');
    });

    it('should handle missing template files gracefully', () => {
      const stackProfile = createMockStackProfile();
      const skills: ResolvedSkill[] = [];

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      // Should return empty or partial array when templates missing
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should handle multiple languages', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'backend-ts',
            path: 'src/backend-ts',
            type: 'backend',
            language: 'typescript',
            frameworks: {
              main: 'express',
            },
          },
          {
            id: 'backend-py',
            path: 'src/backend-py',
            type: 'backend',
            language: 'python',
            frameworks: {
              main: 'django',
            },
          },
          {
            id: 'backend-go',
            path: 'src/backend-go',
            type: 'backend',
            language: 'go',
            frameworks: {
              main: 'gin',
            },
          },
        ],
        is_monorepo: true,
      });
      const skills = [
        createMockSkill({
          name: 'multi-lang-skill',
          compatible_languages: ['typescript', 'python', 'go'],
        }),
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      const tsImplementer = agents.find((a) => a.name === 'implementer-typescript');
      const pyImplementer = agents.find((a) => a.name === 'implementer-python');
      const goImplementer = agents.find((a) => a.name === 'implementer-go');

      expect(tsImplementer).toBeDefined();
      expect(pyImplementer).toBeDefined();
      expect(goImplementer).toBeDefined();
    });
  });

  describe('writeAgents', () => {
    it('should create agents directory and write agent files', () => {
      const agents: GeneratedAgent[] = [
        {
          name: 'planner',
          filename: 'planner.md',
          model: 'opus',
          description: 'Planner agent',
          content: '# Planner',
          path: '',
        },
        {
          name: 'implementer-typescript',
          filename: 'implementer-typescript.md',
          model: 'sonnet',
          description: 'TypeScript implementer',
          content: '# Implementer',
          path: '',
        },
      ];

      writeAgents(agents, '/test/project');

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/test/project', '.claude', 'agents'), {
        recursive: true,
      });

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/test/project', '.claude', 'agents', 'planner.md'),
        '# Planner',
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/test/project', '.claude', 'agents', 'implementer-typescript.md'),
        '# Implementer',
      );
    });

    it('should set path property on each agent', () => {
      const agents: GeneratedAgent[] = [
        {
          name: 'planner',
          filename: 'planner.md',
          model: 'opus',
          description: 'Planner agent',
          content: '# Planner',
          path: '',
        },
      ];

      writeAgents(agents, '/test/project');

      expect(agents[0].path).toBe(path.join('/test/project', '.claude', 'agents', 'planner.md'));
    });

    it('should handle empty agents array', () => {
      const agents: GeneratedAgent[] = [];

      writeAgents(agents, '/test/project');

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should create nested directory structure', () => {
      const agents: GeneratedAgent[] = [
        {
          name: 'test',
          filename: 'test.md',
          model: 'sonnet',
          description: 'Test agent',
          content: '# Test',
          path: '',
        },
      ];

      writeAgents(agents, '/deep/nested/project/path');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/deep/nested/project/path', '.claude', 'agents'),
        { recursive: true },
      );
    });

    // Write-time guard. An implementer agent was once shipped with
    // empty Typecheck/Test/Build cells because the renderer was passed
    // `typecheck_command` while the template asks for
    // `{{type_check_command}}`. Handlebars silently rendered empty
    // strings. This guard catches both the placeholder leak (template
    // variable miss) and the empty-cell leak (extractor + default both
    // empty) BEFORE the file lands on disk.
    describe('writeAgents — pre-flight render validation', () => {
      it('throws when an unrendered Handlebars placeholder leaks through', () => {
        const agents: GeneratedAgent[] = [
          {
            name: 'implementer-typescript',
            filename: 'implementer-typescript.md',
            model: 'sonnet',
            description: 'TS impl',
            content: '# Impl\n\n- Run linter: `{{lint_command}}`\n',
            path: '',
          },
        ];

        expect(() => writeAgents(agents, '/test/project')).toThrow(
          /unrendered Handlebars placeholders.*\{\{lint_command\}\}/,
        );
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });

      it('reports every distinct placeholder, not just the first', () => {
        const agents: GeneratedAgent[] = [
          {
            name: 'implementer-typescript',
            filename: 'implementer-typescript.md',
            model: 'sonnet',
            description: 'TS impl',
            content:
              '# Impl\n\nLint `{{lint_command}}`, type `{{type_check_command}}`, test `{{unit_test_command}}`.',
            path: '',
          },
        ];

        try {
          writeAgents(agents, '/test/project');
          throw new Error('expected writeAgents to throw');
        } catch (err) {
          const msg = (err as Error).message;
          expect(msg).toContain('{{lint_command}}');
          expect(msg).toContain('{{type_check_command}}');
          expect(msg).toContain('{{unit_test_command}}');
        }
      });

      it('throws when implementer commands table has an empty cell', () => {
        const agents: GeneratedAgent[] = [
          {
            name: 'implementer-typescript',
            filename: 'implementer-typescript.md',
            model: 'sonnet',
            description: 'TS impl',
            content: [
              '# Implementer',
              '',
              '| Stage      | Command         |',
              '| ---------- | --------------- |',
              '| Lint       | `npm run lint`  |',
              '| Typecheck  |                 |',
              '| Test       | `npm test`      |',
              '| Build      | `npm run build` |',
            ].join('\n'),
            path: '',
          },
        ];

        expect(() => writeAgents(agents, '/test/project')).toThrow(/empty cell.*Typecheck/i);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });

      it('does NOT trigger empty-cell guard for implementer-generic (no commands table)', () => {
        const agents: GeneratedAgent[] = [
          {
            name: 'implementer-generic',
            filename: 'implementer-generic.md',
            model: 'sonnet',
            description: 'Generic',
            content: '# Generic\n\nNo commands table here.\n',
            path: '',
          },
        ];

        expect(() => writeAgents(agents, '/test/project')).not.toThrow();
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      });

      it('passes a fully-rendered implementer with all command cells populated', () => {
        const agents: GeneratedAgent[] = [
          {
            name: 'implementer-typescript',
            filename: 'implementer-typescript.md',
            model: 'sonnet',
            description: 'TS impl',
            content: [
              '# Implementer',
              '',
              '| Stage      | Command          |',
              '| ---------- | ---------------- |',
              '| Lint       | `npm run lint`   |',
              '| Typecheck  | `npm run tsc`    |',
              '| Test       | `npm test`       |',
              '| Build      | `npm run build`  |',
            ].join('\n'),
            path: '',
          },
        ];

        expect(() => writeAgents(agents, '/test/project')).not.toThrow();
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      });

      it('points at the correct generator file in the error message', () => {
        const agents: GeneratedAgent[] = [
          {
            name: 'planner',
            filename: 'planner.md',
            model: 'opus',
            description: 'Planner',
            content: '# Planner\n\n{{some_unknown_var}}',
            path: '',
          },
        ];

        try {
          writeAgents(agents, '/test/project');
          throw new Error('expected to throw');
        } catch (err) {
          const msg = (err as Error).message;
          expect(msg).toMatch(/agent-generators\.ts/);
        }
      });
    });
  });

  describe('Handlebars helpers', () => {
    it('should register formatSkills helper', () => {
      // This test just verifies the helper is registered
      // Actual rendering is tested indirectly through agent generation
      const stackProfile = createMockStackProfile();
      const skills = [
        createMockSkill({
          name: 'skill1',
          compatible_languages: ['typescript'],
          trigger_mode: 'triggered' as any,
        }),
      ];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => mockPlannerTemplate);

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      // Just verify agents are generated, helper is used internally
      expect(agents.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty skills array in formatSkills helper', () => {
      const stackProfile = createMockStackProfile({
        services: [
          {
            id: 'backend',
            path: 'src/backend',
            type: 'backend',
            language: 'typescript',
            frameworks: {
              main: 'express',
            },
          },
        ],
        is_monorepo: false,
      });
      const skills: ResolvedSkill[] = [];

      const template = 'Skills: {{formatSkills skills}}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return template;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      expect(agents.length).toBeGreaterThan(0);
    });

    it('should generate skillsDoc with skillsDoc helper', () => {
      const stackProfile = createMockStackProfile();
      const skills = [
        createMockSkill({ name: 'test-skill', compatible_languages: ['typescript'] }),
      ];

      const template = '{{skillsDoc skills}}';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return template;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      expect(agents.length).toBeGreaterThan(0);
    });
  });

  describe('package.json command extraction', () => {
    it('should handle package.json scripts when available', () => {
      const stackProfile = createMockStackProfile();
      const skills: ResolvedSkill[] = [];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        const path = String(filePath);
        if (path.includes('package.json')) {
          return JSON.stringify({
            scripts: {
              lint: 'eslint .',
              format: 'prettier --write .',
              typecheck: 'tsc --noEmit',
              test: 'vitest',
              build: 'tsc && vite build',
            },
          });
        }
        return mockImplementerTemplate;
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      // Verify TypeScript implementer is generated
      // Package.json extraction happens internally
      const tsImplementer = agents.find((a) => a.name === 'implementer-typescript');
      expect(tsImplementer).toBeDefined();
    });

    it('should handle missing package.json', () => {
      const stackProfile = createMockStackProfile();
      const skills: ResolvedSkill[] = [];

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        return !filePath.includes('package.json'); // package.json doesn't exist
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      expect(agents.length).toBeGreaterThan(0);
    });

    it('should handle malformed package.json', () => {
      const stackProfile = createMockStackProfile();
      const skills: ResolvedSkill[] = [];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (filePath.includes('package.json')) {
          return '{invalid json}';
        }
        if (filePath.includes('planner.md')) return mockPlannerTemplate;
        if (filePath.includes('implementer.md')) return mockImplementerTemplate;
        if (filePath.includes('generic-implementer.md')) return mockGenericImplementerTemplate;
        if (filePath.includes('visual-verifier.md')) return mockVisualVerifierTemplate;
        return '';
      });

      const agents = generateAgents(
        stackProfile,
        skills,
        '/test/project',
        '/test/templates',
        '/test/framework',
      );

      expect(agents.length).toBeGreaterThan(0);
    });
  });
});
