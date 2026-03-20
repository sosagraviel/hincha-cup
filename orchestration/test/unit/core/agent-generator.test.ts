import { describe, it, expect } from 'vitest';
import { AgentGenerator } from '../../../src/core/agent-generator/index.js';
import { TemplateEngine } from '../../../src/core/agent-generator/template-engine.js';
import { TemplateLoader } from '../../../src/core/agent-generator/template-loader.js';
import { CommandExtractor } from '../../../src/core/agent-generator/command-extractor.js';
import { ContextBuilder } from '../../../src/core/agent-generator/context-builder.js';
import type { StackProfile } from '../../../src/core/stack-detector/types.js';
import type { Skill } from '../../../src/core/skill-resolver/types.js';
import { join } from 'path';

describe('AgentGenerator', () => {
  const frameworkPath = process.env.FRAMEWORK_PATH || '';
  const templatesPath = join(frameworkPath, 'agents', 'templates');

  describe('Agent Generation', () => {
    it('should generate planner agent', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const skills: Skill[] = [{
        name: 'typescript-fundamentals',
        path: '020-languages/typescript',
        reason: 'Detected typescript in project',
        description: 'TypeScript language fundamentals',
        category: 'language'
      }];

      const generator = new AgentGenerator(templatesPath, frameworkPath);
      const result = await generator.generate(stackProfile, skills, process.cwd());

      expect(result.agents_generated.length).toBeGreaterThan(0);
      
      const planner = result.agents_generated.find(a => a.name === 'planner');
      expect(planner).toBeDefined();
      expect(planner?.model).toBe('sonnet-latest');
    });

    it('should generate implementer for each language', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript', 'python'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const skills: Skill[] = [];

      const generator = new AgentGenerator(templatesPath, frameworkPath);
      const result = await generator.generate(stackProfile, skills, process.cwd());

      const implementers = result.agents_generated.filter(a => 
        a.name.startsWith('implementer-')
      );
      
      expect(implementers.length).toBe(2);
      expect(implementers.some(i => i.name === 'implementer-typescript')).toBe(true);
      expect(implementers.some(i => i.name === 'implementer-python')).toBe(true);
    });

    it('should generate visual verifier for frontend projects', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        frameworks: {
          frontend: ['react']
        },
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const skills: Skill[] = [];

      const generator = new AgentGenerator(templatesPath, frameworkPath);
      const result = await generator.generate(stackProfile, skills, process.cwd());

      const verifier = result.agents_generated.find(a => a.name === 'visual-verifier');
      expect(verifier).toBeDefined();
    });

    it('should include agent tracking metadata', async () => {
      const stackProfile: StackProfile = {
        languages: ['typescript'],
        package_manager: 'pnpm',
        workspace_type: 'single'
      };

      const skills: Skill[] = [];

      const generator = new AgentGenerator(templatesPath, frameworkPath);
      const result = await generator.generate(stackProfile, skills, process.cwd());

      expect(result.agents_tracking).toBeDefined();
      
      const plannerTracking = result.agents_tracking['planner'];
      expect(plannerTracking).toBeDefined();
      expect(plannerTracking.template_hash).toBeDefined();
      expect(plannerTracking.file_hash).toBeDefined();
      expect(plannerTracking.managed_by_framework).toBe(true);
    });
  });
});

describe('TemplateEngine', () => {
  describe('Custom Helpers', () => {
    it('should format skills as bullet list', () => {
      const engine = new TemplateEngine();
      const skills: Skill[] = [
        { name: 'skill1', path: 'path1', reason: 'reason1', description: 'desc1', category: 'always' },
        { name: 'skill2', path: 'path2', reason: 'reason2', description: 'desc2', category: 'language' }
      ];

      const template = '{{formatSkills skills}}';
      const result = engine.render(template, { skills });

      expect(result).toContain('skill1');
      expect(result).toContain('skill2');
    });

    it('should generate skills documentation', () => {
      const engine = new TemplateEngine();
      const skills: Skill[] = [
        { name: 'skill1', path: 'path1', reason: 'reason1', description: 'desc1', category: 'always' }
      ];

      const template = '{{skillsDoc skills}}';
      const result = engine.render(template, { skills });

      expect(result).toContain('skill1');
      expect(result).toContain('desc1');
      expect(result).toContain('reason1');
    });
  });
});

describe('CommandExtractor', () => {
  describe('TypeScript/JavaScript Projects', () => {
    it('should extract commands from package.json', async () => {
      const commands = await CommandExtractor.extract(process.cwd(), 'typescript');

      expect(commands.install).toBeDefined();
      expect(commands.test).toBeDefined();
      expect(commands.build).toBeDefined();
    });

    it('should detect package manager', async () => {
      const commands = await CommandExtractor.extract(process.cwd(), 'typescript');

      // Should use pnpm, npm, or yarn based on lockfile
      expect(['pnpm install', 'npm install', 'yarn install']).toContain(commands.install);
    });
  });

  describe('Python Projects', () => {
    it('should provide default Python commands', async () => {
      const commands = await CommandExtractor.extract('/tmp/python-project', 'python');

      expect(commands.install).toBe('pip install -r requirements.txt');
      expect(commands.test).toBe('pytest');
      expect(commands.lint).toBe('flake8 .');
    });
  });
});

describe('ContextBuilder', () => {
  it('should build agent context', async () => {
    const stackProfile: StackProfile = {
      languages: ['typescript'],
      package_manager: 'pnpm',
      workspace_type: 'single'
    };

    const skills: Skill[] = [];

    const context = await ContextBuilder.build(
      stackProfile,
      skills,
      process.cwd(),
      process.env.FRAMEWORK_PATH || '',
      { language: 'typescript' }
    );

    expect(context.stack_profile).toEqual(stackProfile);
    expect(context.skills).toEqual(skills);
    expect(context.model).toBe('sonnet-latest');
    expect(context.language).toBe('typescript');
    expect(context.commands).toBeDefined();
  });

  it('should add language-specific config', async () => {
    const stackProfile: StackProfile = {
      languages: ['typescript'],
      package_manager: 'pnpm',
      workspace_type: 'single'
    };

    const skills: Skill[] = [];

    const context = await ContextBuilder.build(
      stackProfile,
      skills,
      process.cwd(),
      process.env.FRAMEWORK_PATH || '',
      { language: 'typescript' }
    );

    expect(context.language_config).toBeDefined();
    expect(context.language_config?.file_extensions).toContain('.ts');
    expect(context.language_config?.test_patterns).toContain('**/*.test.ts');
  });
});
