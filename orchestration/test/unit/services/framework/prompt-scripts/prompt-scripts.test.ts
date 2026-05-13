import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  PROMPT_SCRIPT_REGISTRY,
  getPromptScript,
  renderPromptScripts,
} from '../../../../../src/services/framework/prompt-scripts/index.js';

describe('prompt-scripts subsystem — Plan v7 Phase 4', () => {
  describe('registry', () => {
    it('exposes at least inspection-summary + language-config-summary', () => {
      const names = PROMPT_SCRIPT_REGISTRY.map((s) => s.name);
      expect(names).toContain('inspection-summary');
      expect(names).toContain('language-config-summary');
    });

    it('getPromptScript is name-keyed', () => {
      expect(getPromptScript('inspection-summary')?.name).toBe('inspection-summary');
      expect(getPromptScript('imaginary')).toBeUndefined();
    });
  });

  describe('renderer', () => {
    it('replaces a script token with its handler output', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'lang-config-summary-'));
      const rendered = renderPromptScripts('Hello <<script:language-config-summary>> world.', {
        projectPath: tmp,
        frameworkPath: tmp,
        tempDir: tmp,
      });
      expect(rendered).toContain('Supported language families');
      expect(rendered).toContain('TypeScript');
      expect(rendered).toContain('Python');
      expect(rendered).not.toContain('<<script:');
    });

    it('emits an inline comment for unknown script names', () => {
      const rendered = renderPromptScripts('<<script:nonexistent>>', {
        projectPath: '/tmp',
        frameworkPath: '/tmp',
        tempDir: '/tmp',
      });
      expect(rendered).toMatch(/unknown name 'nonexistent'/);
    });

    it('returns the body verbatim when there are no script tokens', () => {
      const body = 'plain markdown with no tokens';
      const out = renderPromptScripts(body, {
        projectPath: '/tmp',
        frameworkPath: '/tmp',
        tempDir: '/tmp',
      });
      expect(out).toBe(body);
    });

    it('handles missing inspection file gracefully', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'inspection-summary-missing-'));
      const rendered = renderPromptScripts('<<script:inspection-summary>>', {
        projectPath: tmp,
        frameworkPath: tmp,
        tempDir: tmp,
      });
      expect(rendered).toContain('project-inspection.json missing');
    });

    it('renders inspection-summary from a real file', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'inspection-summary-real-'));
      writeFileSync(
        join(tmp, 'project-inspection.json'),
        JSON.stringify({
          repository_type: 'monorepo',
          runtime_versions: { node: '22', 'tool-versions-raw': 'irrelevant' },
          manifests: [{ kind: 'package.json' }, { kind: 'pyproject.toml' }],
          lock_files: [{ manager: 'pnpm' }, { manager: 'poetry' }],
          infrastructure: ['docker', 'docker-compose'],
          ci_cd: { provider: 'GitHub Actions' },
        }),
      );
      const rendered = renderPromptScripts('<<script:inspection-summary>>', {
        projectPath: tmp,
        frameworkPath: tmp,
        tempDir: tmp,
      });
      expect(rendered).toContain('Repository type: `monorepo`');
      expect(rendered).toContain('node=22');
      expect(rendered).not.toContain('tool-versions-raw');
      expect(rendered).toContain('package.json');
      expect(rendered).toContain('pyproject.toml');
      expect(rendered).toContain('pnpm');
      expect(rendered).toContain('GitHub Actions');
    });
  });
});
