import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  detectAutomationDiscoveryViolations,
  formatAutomationDiscoveryViolations,
} from '../../../../../../src/nodes/initialize-project/phase1/structure-analyzer/hooks/validate-automation-discovery.js';

/**
 * Hard Stop-hook validator: when canonical wrapper files exist at the
 * project root, the structure analyzer MUST represent them in
 * `findings.automation`. The validator checks the filesystem and
 * rejects mismatches.
 *
 * Stack-agnostic — pure file-presence + heading-shape checks.
 */

describe('detectAutomationDiscoveryViolations', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'automation-discovery-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns no violations when cwd is undefined (single-analyzer replay)', () => {
    const violations = detectAutomationDiscoveryViolations(
      { findings: { automation: {} } },
      undefined,
    );
    expect(violations).toEqual([]);
  });

  it('returns no violations when the project root has no automation files', () => {
    const violations = detectAutomationDiscoveryViolations(
      { findings: { automation: {} } },
      tmpDir,
    );
    expect(violations).toEqual([]);
  });

  it('fires when Makefile exists but findings.automation.makefiles is empty', () => {
    writeFileSync(join(tmpDir, 'Makefile'), 'setup:\n\techo hello\n');
    const violations = detectAutomationDiscoveryViolations(
      { findings: { automation: { makefiles: [] } } },
      tmpDir,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].bucket).toBe('makefiles');
    expect(violations[0].files).toContain('Makefile');
  });

  it('fires when Makefile exists but the automation field is missing entirely', () => {
    writeFileSync(join(tmpDir, 'Makefile'), 'setup:\n\techo hello\n');
    const violations = detectAutomationDiscoveryViolations(
      { findings: {} }, // no automation at all
      tmpDir,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].bucket).toBe('makefiles');
  });

  it('passes when Makefile exists and findings.automation.makefiles has content', () => {
    writeFileSync(join(tmpDir, 'Makefile'), 'setup:\n\techo hello\n');
    const violations = detectAutomationDiscoveryViolations(
      {
        findings: {
          automation: { makefiles: [{ path: 'Makefile', targets: [{ name: 'setup' }] }] },
        },
      },
      tmpDir,
    );
    expect(violations).toEqual([]);
  });

  it('fires for Justfile, Taskfile, and shell scripts independently', () => {
    writeFileSync(join(tmpDir, 'Justfile'), 'test:\n  echo test\n');
    writeFileSync(join(tmpDir, 'Taskfile.yml'), 'tasks: {}\n');
    mkdirSync(join(tmpDir, 'scripts'));
    writeFileSync(join(tmpDir, 'scripts/setup'), '#!/bin/sh\n');

    const violations = detectAutomationDiscoveryViolations(
      { findings: { automation: {} } },
      tmpDir,
    );
    const buckets = violations.map((v) => v.bucket).sort();
    expect(buckets).toEqual(['justfiles', 'shell_scripts', 'taskfiles']);
  });

  it('fires for devcontainer.json when postCreateCommand is missing', () => {
    mkdirSync(join(tmpDir, '.devcontainer'));
    writeFileSync(
      join(tmpDir, '.devcontainer/devcontainer.json'),
      JSON.stringify({ postCreateCommand: 'pnpm install' }),
    );
    const violations = detectAutomationDiscoveryViolations(
      { findings: { automation: { devcontainer: {} } } },
      tmpDir,
    );
    expect(violations.some((v) => v.bucket === 'devcontainer')).toBe(true);
  });

  it('passes for devcontainer when postCreateCommand is populated', () => {
    mkdirSync(join(tmpDir, '.devcontainer'));
    writeFileSync(
      join(tmpDir, '.devcontainer/devcontainer.json'),
      JSON.stringify({ postCreateCommand: 'pnpm install' }),
    );
    const violations = detectAutomationDiscoveryViolations(
      {
        findings: {
          automation: { devcontainer: { postCreateCommand: 'pnpm install' } },
        },
      },
      tmpDir,
    );
    expect(violations).toEqual([]);
  });

  it('fires when README has a "Getting Started" heading but readme_run_sections is empty', () => {
    writeFileSync(
      join(tmpDir, 'README.md'),
      '# Project\n\n## Getting Started\n\nRun `make setup`.\n',
    );
    const violations = detectAutomationDiscoveryViolations(
      { findings: { readme_run_sections: [] } },
      tmpDir,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].bucket).toBe('readme_run_sections');
  });

  it('passes when README run-sections are extracted', () => {
    writeFileSync(
      join(tmpDir, 'README.md'),
      '# Project\n\n## Getting Started\n\nRun `make setup`.\n',
    );
    const violations = detectAutomationDiscoveryViolations(
      {
        findings: {
          readme_run_sections: [
            {
              path: 'README.md',
              heading: 'Getting Started',
              body: 'Run `make setup`.',
              fenced_blocks: [],
            },
          ],
        },
      },
      tmpDir,
    );
    expect(violations).toEqual([]);
  });

  it('does NOT fire when README has no canonical run-section headings', () => {
    writeFileSync(join(tmpDir, 'README.md'), '# Project\n\n## License\n\nMIT.\n');
    const violations = detectAutomationDiscoveryViolations({ findings: {} }, tmpDir);
    expect(violations).toEqual([]);
  });

  it('returns multiple violations when multiple wrappers are missing', () => {
    writeFileSync(join(tmpDir, 'Makefile'), 'setup:\n\techo hello\n');
    writeFileSync(join(tmpDir, 'Justfile'), 'test:\n  echo test\n');
    writeFileSync(join(tmpDir, 'README.md'), '## Getting Started\n\nRun `make setup`.\n');

    const violations = detectAutomationDiscoveryViolations(
      { findings: { automation: {}, readme_run_sections: [] } },
      tmpDir,
    );
    expect(violations.length).toBeGreaterThanOrEqual(3);
    const buckets = violations.map((v) => v.bucket);
    expect(buckets).toContain('makefiles');
    expect(buckets).toContain('justfiles');
    expect(buckets).toContain('readme_run_sections');
  });
});

describe('formatAutomationDiscoveryViolations', () => {
  it('returns an empty array on no violations', () => {
    expect(formatAutomationDiscoveryViolations([])).toEqual([]);
  });

  it('emits compressed VALIDATION_E010_* feedback naming the bucket and file', () => {
    const lines = formatAutomationDiscoveryViolations([
      {
        bucket: 'makefiles',
        files: ['Makefile'],
        message:
          'Makefile(s) exist at the project root (Makefile) but `findings.automation.makefiles` is empty.',
      },
    ]);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toMatch(/^VALIDATION_E010_automation_discovery_gap: /);
    expect(line).toContain('makefiles');
    expect(line).toContain('Makefile');
    expect(line.length).toBeLessThanOrEqual(180);
  });
});
