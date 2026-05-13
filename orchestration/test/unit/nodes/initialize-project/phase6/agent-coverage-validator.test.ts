import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { validateAgentCoverage } from '../../../../../src/nodes/initialize-project/phase6/helpers/agent-coverage-validator.js';

function writeConfig(path: string, services: Array<{ id: string; language: string }>): void {
  writeFileSync(
    path,
    JSON.stringify({
      stack_profile: {
        services: services.map((s) => ({
          id: s.id,
          path: s.id,
          type: 'backend',
          language: s.language,
        })),
      },
    }),
  );
}

describe('validateAgentCoverage', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-coverage-'));
    configPath = join(dir, 'framework-config.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT warn when a service language is a utility (shell, sql, html, css) — those fall through to implementer-generic', () => {
    writeConfig(configPath, [
      { id: 'api', language: 'typescript' },
      { id: 'nginx', language: 'shell' },
      { id: 'styles', language: 'css' },
      { id: 'migrations', language: 'sql' },
    ]);
    const agentFiles = ['planner.md', 'implementer-typescript.md', 'implementer-generic.md'];

    const result = validateAgentCoverage(agentFiles, configPath);

    expect(result.warnings).toEqual([]);
    expect(result.missingImplementers).toEqual([]);
  });

  it('warns when a service language has hasImplementerAgent: true but no agent file exists', () => {
    writeConfig(configPath, [
      { id: 'api', language: 'typescript' },
      { id: 'worker', language: 'python' },
    ]);
    const agentFiles = ['planner.md', 'implementer-typescript.md'];

    const result = validateAgentCoverage(agentFiles, configPath);

    expect(result.missingImplementers).toContain('python');
    expect(result.warnings.join('\n')).toContain('python');
  });

  it('does NOT warn for an unregistered service language (registry-driven)', () => {
    writeConfig(configPath, [
      { id: 'api', language: 'typescript' },
      { id: 'experimental', language: 'cobol' },
    ]);
    const agentFiles = ['planner.md', 'implementer-typescript.md', 'implementer-generic.md'];

    const result = validateAgentCoverage(agentFiles, configPath);

    expect(result.missingImplementers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
