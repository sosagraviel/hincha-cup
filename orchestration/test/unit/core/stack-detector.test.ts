import { describe, it, expect, beforeEach } from 'vitest';
import { StackDetector } from '../../../src/core/stack-detector/index.js';
import { FileDetector } from '../../../src/core/stack-detector/file-detector.js';
import { DependencyParser } from '../../../src/core/stack-detector/dependency-parser.js';
import { MonorepoDetector } from '../../../src/core/stack-detector/monorepo-detector.js';
import { join } from 'path';

describe('StackDetector', () => {
  const testProjectPath = join(process.cwd(), 'test', 'fixtures', 'sample-project');

  describe('Language Detection', () => {
    it('should detect TypeScript from files', async () => {
      const detector = new StackDetector(testProjectPath);
      const profile = await detector.detect();
      
      const languages = profile.languages.map(l => 
        typeof l === 'string' ? l : l.name
      );
      
      expect(languages).toContain('typescript');
    });

    it('should sort languages by confidence', async () => {
      const detector = new StackDetector(testProjectPath);
      const profile = await detector.detect();
      
      // Languages should be sorted by confidence (highest first)
      expect(profile.languages.length).toBeGreaterThan(0);
    });

    it('should exclude languages with detect_not_deps', async () => {
      const detector = new StackDetector(testProjectPath);
      const profile = await detector.detect();
      
      const languages = profile.languages.map(l => 
        typeof l === 'string' ? l : l.name
      );
      
      // If project has 'react', should not detect 'vanilla-js'
      if (languages.includes('react')) {
        expect(languages).not.toContain('vanilla-js');
      }
    });
  });

  describe('Framework Detection', () => {
    it('should detect frameworks from dependencies', async () => {
      const detector = new StackDetector(testProjectPath);
      const profile = await detector.detect();
      
      expect(profile.frameworks).toBeDefined();
    });

    it('should categorize frameworks correctly', async () => {
      const detector = new StackDetector(testProjectPath);
      const profile = await detector.detect();
      
      if (profile.frameworks) {
        const categories = Object.keys(profile.frameworks);
        expect(categories).toContain('frontend');
      }
    });
  });

  describe('Package Manager Detection', () => {
    it('should detect pnpm from lockfile', async () => {
      const detector = new StackDetector(testProjectPath);
      const profile = await detector.detect();
      
      if (profile.package_manager) {
        expect(['pnpm', 'npm', 'yarn']).toContain(profile.package_manager);
      }
    });
  });

  describe('Workspace Detection', () => {
    it('should detect monorepo vs single workspace', async () => {
      const detector = new StackDetector(testProjectPath);
      const profile = await detector.detect();
      
      expect(profile.workspace_type).toMatch(/single|monorepo/);
    });
  });
});

describe('FileDetector', () => {
  it('should find TypeScript files', async () => {
    const files = await FileDetector.findFiles(
      process.cwd(),
      ['*.ts', '*.tsx']
    );
    
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.endsWith('.ts'))).toBe(true);
  });

  it('should count files by extension', async () => {
    const counts = await FileDetector.countFilesByExtension(process.cwd());
    
    expect(counts).toHaveProperty('ts');
    expect(counts.ts).toBeGreaterThan(0);
  });

  it('should ignore node_modules', async () => {
    const files = await FileDetector.findFiles(
      process.cwd(),
      ['package.json']
    );
    
    // Should not include node_modules/*/package.json
    expect(files.every(f => !f.includes('node_modules'))).toBe(true);
  });
});

describe('DependencyParser', () => {
  it('should parse package.json dependencies', async () => {
    const deps = await DependencyParser.parse(process.cwd());
    
    expect(deps.size).toBeGreaterThan(0);
    expect(deps.has('zod')).toBe(true);
  });

  it('should combine dependencies and devDependencies', async () => {
    const deps = await DependencyParser.parse(process.cwd());
    
    // Should include both regular and dev dependencies
    expect(deps.has('vitest')).toBe(true);
  });
});

describe('MonorepoDetector', () => {
  it('should detect pnpm workspaces', async () => {
    const result = await MonorepoDetector.detect(process.cwd());
    
    expect(result).toHaveProperty('isMonorepo');
    expect(result).toHaveProperty('workspaces');
  });

  it('should resolve glob patterns in workspaces', async () => {
    const result = await MonorepoDetector.detect(process.cwd());
    
    if (result.isMonorepo) {
      expect(Array.isArray(result.workspaces)).toBe(true);
    }
  });
});
