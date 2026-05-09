import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import {
  countFilesByLanguage,
  getSupportedLanguages,
  getLanguageExtensions,
  detectLanguageFromExtension,
} from '../../../../../src/nodes/initialize-project/phase4/file-counter.js';

describe('file-counter', () => {
  const testDir = join(__dirname, 'fixtures', 'file-counter-test');

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('countFilesByLanguage', () => {
    it('should count TypeScript files correctly', async () => {
      await writeFile(join(testDir, 'test1.ts'), '// TypeScript file');
      await writeFile(join(testDir, 'test2.tsx'), '// TSX file');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(2);
      const tsCount = result.by_language.find((l) => l.language === 'typescript');
      expect(tsCount).toBeDefined();
      expect(tsCount?.count).toBe(2);
      expect(tsCount?.extensions).toContain('.ts');
      expect(tsCount?.extensions).toContain('.tsx');
    });

    it('should count Python files correctly', async () => {
      await writeFile(join(testDir, 'test.py'), '# Python file');
      await writeFile(join(testDir, 'script.pyw'), '# Python Windows file');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(2);
      const pyCount = result.by_language.find((l) => l.language === 'python');
      expect(pyCount).toBeDefined();
      expect(pyCount?.count).toBe(2);
    });

    it('should count JavaScript files with all extensions', async () => {
      await writeFile(join(testDir, 'test.js'), '// JS file');
      await writeFile(join(testDir, 'module.mjs'), '// ESM file');
      await writeFile(join(testDir, 'config.cjs'), '// CommonJS file');
      await writeFile(join(testDir, 'component.jsx'), '// JSX file');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(4);
      const jsCount = result.by_language.find((l) => l.language === 'javascript');
      expect(jsCount?.count).toBe(4);
    });

    it('should ignore node_modules directory', async () => {
      const nodeModules = join(testDir, 'node_modules');
      await mkdir(nodeModules, { recursive: true });
      await writeFile(join(nodeModules, 'test.js'), '// Should ignore');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(0);
    });

    it('should ignore .git directory', async () => {
      const gitDir = join(testDir, '.git');
      await mkdir(gitDir, { recursive: true });
      await writeFile(join(gitDir, 'config'), '// Git config');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(0);
    });

    it('should ignore build/dist directories', async () => {
      const buildDir = join(testDir, 'build');
      const distDir = join(testDir, 'dist');
      await mkdir(buildDir, { recursive: true });
      await mkdir(distDir, { recursive: true });
      await writeFile(join(buildDir, 'output.js'), '// Build output');
      await writeFile(join(distDir, 'bundle.js'), '// Dist bundle');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(0);
    });

    it('should ignore Python virtual environments', async () => {
      const venvDir = join(testDir, 'venv');
      await mkdir(venvDir, { recursive: true });
      await writeFile(join(venvDir, 'script.py'), '// Should ignore');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(0);
    });

    it('should ignore framework directories with -agentic-framework suffix', async () => {
      // Create framework directory with specific name
      const frameworkDir = join(testDir, 'ai-agentic-framework');
      await mkdir(frameworkDir, { recursive: true });
      await writeFile(join(frameworkDir, 'test.ts'), '// Framework file');
      await writeFile(join(frameworkDir, 'test.py'), '# Framework file');
      await writeFile(join(frameworkDir, 'test.go'), '// Framework file');

      // Pass frameworkPath so it derives "ai-agentic-framework" as the directory name
      const result = await countFilesByLanguage(testDir, 10, frameworkDir);

      expect(result.total_files).toBe(0);
    });

    it('should ignore .claude directories', async () => {
      const claudeDir = join(testDir, '.claude');
      const claudeTempDir = join(testDir, '.claude-temp');
      const claudeBackupsDir = join(testDir, '.claude-backups');

      await mkdir(claudeDir, { recursive: true });
      await mkdir(claudeTempDir, { recursive: true });
      await mkdir(claudeBackupsDir, { recursive: true });

      await writeFile(join(claudeDir, 'skill.py'), '# Skill file');
      await writeFile(join(claudeTempDir, 'temp.ts'), '// Temp file');
      await writeFile(join(claudeBackupsDir, 'backup.js'), '// Backup file');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(0);
    });

    it('should handle multiple languages in monorepo', async () => {
      await writeFile(join(testDir, 'app.ts'), '// TypeScript');
      await writeFile(join(testDir, 'server.py'), '# Python');
      await writeFile(join(testDir, 'main.go'), '// Go');
      await writeFile(join(testDir, 'lib.rs'), '// Rust');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(4);
      expect(result.by_language).toHaveLength(4);

      const languages = result.by_language.map((l) => l.language);
      expect(languages).toContain('typescript');
      expect(languages).toContain('python');
      expect(languages).toContain('go');
      expect(languages).toContain('rust');
    });

    it('should respect maxDepth parameter', async () => {
      const deep = join(testDir, 'a', 'b', 'c', 'd', 'e');
      await mkdir(deep, { recursive: true });
      await writeFile(join(deep, 'test.ts'), '// Deep file');

      const result = await countFilesByLanguage(testDir, 3);

      expect(result.total_files).toBe(0); // Too deep
    });

    it('should count files within maxDepth', async () => {
      const shallow = join(testDir, 'a', 'b');
      await mkdir(shallow, { recursive: true });
      await writeFile(join(shallow, 'test.ts'), '// Shallow file');

      const result = await countFilesByLanguage(testDir, 3);

      expect(result.total_files).toBe(1);
    });

    it('should exclude tooling-config files from language counts', async () => {
      // Application source
      await writeFile(join(testDir, 'app.ts'), '// real source');
      // Tooling configs — should be filtered out, not counted as JS/TS source
      await writeFile(join(testDir, 'eslint.config.mjs'), 'export default {}');
      await writeFile(join(testDir, 'prettier.config.mjs'), 'export default {}');
      await writeFile(join(testDir, 'jest.config.js'), 'module.exports = {}');
      await writeFile(join(testDir, 'commitlint.config.js'), 'module.exports = {}');
      await writeFile(join(testDir, '.eslintrc.js'), 'module.exports = {}');
      await writeFile(join(testDir, '.babelrc.cjs'), 'module.exports = {}');

      const result = await countFilesByLanguage(testDir);

      const js = result.by_language.find((l) => l.language === 'javascript');
      const ts = result.by_language.find((l) => l.language === 'typescript');

      expect(js).toBeUndefined();
      expect(ts?.count).toBe(1);
      expect(result.total_files).toBe(1);
      expect(result.tooling_config_counts?.javascript).toBe(6);
    });

    it('should honour .gitignore directory entries', async () => {
      // Custom dir name not in STANDARD_IGNORE_DIRS — only excluded via .gitignore
      const customIgnored = join(testDir, 'generated-artifacts');
      await mkdir(customIgnored, { recursive: true });
      await writeFile(join(customIgnored, 'gen.ts'), '// should be ignored');

      await writeFile(
        join(testDir, '.gitignore'),
        ['generated-artifacts/', 'build', '# a comment'].join('\n'),
      );

      await writeFile(join(testDir, 'app.ts'), '// real source');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(1);
      expect(result.by_language[0]?.count).toBe(1);
    });

    it('should track directories where files are found', async () => {
      const srcDir = join(testDir, 'src');
      const libDir = join(testDir, 'lib');
      await mkdir(srcDir, { recursive: true });
      await mkdir(libDir, { recursive: true });
      await writeFile(join(srcDir, 'app.ts'), '// App');
      await writeFile(join(libDir, 'util.ts'), '// Util');

      const result = await countFilesByLanguage(testDir);

      const tsCount = result.by_language.find((l) => l.language === 'typescript');
      expect(tsCount?.directories).toContain('src');
      expect(tsCount?.directories).toContain('lib');
    });

    it('should sort languages by count descending', async () => {
      // Create 5 TypeScript files
      for (let i = 0; i < 5; i++) {
        await writeFile(join(testDir, `file${i}.ts`), '// TS');
      }

      // Create 2 Python files
      for (let i = 0; i < 2; i++) {
        await writeFile(join(testDir, `script${i}.py`), '# Python');
      }

      // Create 1 Go file
      await writeFile(join(testDir, 'main.go'), '// Go');

      const result = await countFilesByLanguage(testDir);

      expect(result.by_language[0].language).toBe('typescript');
      expect(result.by_language[0].count).toBe(5);
      expect(result.by_language[1].language).toBe('python');
      expect(result.by_language[1].count).toBe(2);
      expect(result.by_language[2].language).toBe('go');
      expect(result.by_language[2].count).toBe(1);
    });

    it('should handle empty directory', async () => {
      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(0);
      expect(result.by_language).toHaveLength(0);
      expect(result.scanned_directories).toBeGreaterThan(0);
    });

    it('should handle non-source files (ignore them)', async () => {
      await writeFile(join(testDir, 'README.md'), '# Readme');
      await writeFile(join(testDir, 'data.json'), '{"key": "value"}');
      await writeFile(join(testDir, 'image.png'), 'binary data');

      const result = await countFilesByLanguage(testDir);

      expect(result.total_files).toBe(0); // No source files
    });

    it('should count Java files', async () => {
      const srcDir = join(testDir, 'src', 'main', 'java');
      await mkdir(srcDir, { recursive: true });
      await writeFile(join(srcDir, 'Main.java'), '// Java file');

      const result = await countFilesByLanguage(testDir);

      const javaCount = result.by_language.find((l) => l.language === 'java');
      expect(javaCount?.count).toBe(1);
    });

    it('should count C/C++ files', async () => {
      await writeFile(join(testDir, 'main.c'), '// C file');
      await writeFile(join(testDir, 'app.cpp'), '// C++ file');
      await writeFile(join(testDir, 'header.h'), '// Header');

      const result = await countFilesByLanguage(testDir);

      // .c and .h go to "c", .cpp goes to "cpp"
      const cCount = result.by_language.find((l) => l.language === 'c');
      const cppCount = result.by_language.find((l) => l.language === 'cpp');

      expect(cCount?.count).toBeGreaterThan(0);
      expect(cppCount?.count).toBeGreaterThan(0);
    });

    it('should count Ruby files', async () => {
      await writeFile(join(testDir, 'app.rb'), '# Ruby file');
      await writeFile(join(testDir, 'Rakefile.rake'), '# Rake file');

      const result = await countFilesByLanguage(testDir);

      const rubyCount = result.by_language.find((l) => l.language === 'ruby');
      expect(rubyCount?.count).toBe(2);
    });

    it('should handle permission errors gracefully', async () => {
      // Create a file that might cause permission issues
      await writeFile(join(testDir, 'test.ts'), '// File');

      const result = await countFilesByLanguage(testDir);

      // Should not crash, should still count files
      expect(result.total_files).toBeGreaterThan(0);
    });

    it('should count scanned directories', async () => {
      const dir1 = join(testDir, 'dir1');
      const dir2 = join(testDir, 'dir2');
      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });
      await writeFile(join(dir1, 'file.ts'), '// File');

      const result = await countFilesByLanguage(testDir);

      expect(result.scanned_directories).toBeGreaterThan(0);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return list of supported languages', () => {
      const languages = getSupportedLanguages();

      expect(languages).toContain('typescript');
      expect(languages).toContain('javascript');
      expect(languages).toContain('python');
      expect(languages).toContain('java');
      expect(languages).toContain('go');
      expect(languages).toContain('rust');
      expect(languages.length).toBeGreaterThan(10);
    });
  });

  describe('getLanguageExtensions', () => {
    it('should return extensions for TypeScript', () => {
      const extensions = getLanguageExtensions('typescript');

      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
    });

    it('should return extensions for Python', () => {
      const extensions = getLanguageExtensions('python');

      expect(extensions).toContain('.py');
      expect(extensions).toContain('.pyw');
    });

    it('should be case-insensitive', () => {
      const extensions = getLanguageExtensions('TypeScript');

      expect(extensions).toBeDefined();
      expect(extensions).toContain('.ts');
    });

    it('should return undefined for unknown language', () => {
      const extensions = getLanguageExtensions('unknown');

      expect(extensions).toBeUndefined();
    });
  });

  describe('detectLanguageFromExtension', () => {
    it('should detect TypeScript from .ts extension', () => {
      const lang = detectLanguageFromExtension('app.ts');

      expect(lang).toBe('typescript');
    });

    it('should detect Python from .py extension', () => {
      const lang = detectLanguageFromExtension('script.py');

      expect(lang).toBe('python');
    });

    it('should detect JavaScript from .js extension', () => {
      const lang = detectLanguageFromExtension('index.js');

      expect(lang).toBe('javascript');
    });

    it('should handle files without extension', () => {
      const lang = detectLanguageFromExtension('README');

      expect(lang).toBeUndefined();
    });

    it('should handle unknown extensions', () => {
      const lang = detectLanguageFromExtension('file.xyz');

      expect(lang).toBeUndefined();
    });

    it('should be case-insensitive for extensions', () => {
      const lang = detectLanguageFromExtension('App.TS');

      expect(lang).toBe('typescript');
    });
  });

  // ==========================================================================
  // Plan v4 Phase A.2 — newly-covered canonical languages
  // ==========================================================================

  describe('Plan v4 Phase A.2 — newly-covered canonical languages', () => {
    it('counts a single .sh file as `shell`', async () => {
      await writeFile(join(testDir, 'deploy.sh'), '#!/bin/bash\necho ok\n');
      const result = await countFilesByLanguage(testDir);
      const shell = result.by_language.find((b) => b.language === 'shell');
      expect(shell?.count).toBe(1);
    });

    it('counts a single .sql file as `sql`', async () => {
      await writeFile(join(testDir, 'init.sql'), 'CREATE TABLE x (id INT);\n');
      const result = await countFilesByLanguage(testDir);
      const sql = result.by_language.find((b) => b.language === 'sql');
      expect(sql?.count).toBe(1);
    });

    it('counts other newly-covered canonical extensions (dart / lua / r / html / css / erlang)', async () => {
      await writeFile(join(testDir, 'app.dart'), 'void main() {}\n');
      await writeFile(join(testDir, 'init.lua'), 'print("x")\n');
      await writeFile(join(testDir, 'analysis.r'), 'x <- 1\n');
      await writeFile(join(testDir, 'index.html'), '<!doctype html>\n');
      await writeFile(join(testDir, 'main.css'), 'body{}\n');
      await writeFile(join(testDir, 'gen.erl'), '-module(gen).\n');
      const result = await countFilesByLanguage(testDir);
      const lookup = (lang: string) => result.by_language.find((b) => b.language === lang)?.count;
      expect(lookup('dart')).toBe(1);
      expect(lookup('lua')).toBe(1);
      expect(lookup('r')).toBe(1);
      expect(lookup('html')).toBe(1);
      expect(lookup('css')).toBe(1);
      expect(lookup('erlang')).toBe(1);
    });

    it('counts powershell + perl + julia + objectivec + fsharp + vbnet too', async () => {
      await writeFile(join(testDir, 'deploy.ps1'), 'Write-Host x\n');
      await writeFile(join(testDir, 'munge.pl'), 'print "hi";\n');
      await writeFile(join(testDir, 'sim.jl'), 'println("x")\n');
      await writeFile(join(testDir, 'view.m'), '#import <Foundation/Foundation.h>\n');
      await writeFile(join(testDir, 'app.fs'), 'let x = 1\n');
      await writeFile(join(testDir, 'app.vb'), 'Module App\nEnd Module\n');
      const result = await countFilesByLanguage(testDir);
      const lookup = (lang: string) => result.by_language.find((b) => b.language === lang)?.count;
      expect(lookup('powershell')).toBe(1);
      expect(lookup('perl')).toBe(1);
      expect(lookup('julia')).toBe(1);
      expect(lookup('objectivec')).toBe(1);
      expect(lookup('fsharp')).toBe(1);
      expect(lookup('vbnet')).toBe(1);
    });
  });
});
