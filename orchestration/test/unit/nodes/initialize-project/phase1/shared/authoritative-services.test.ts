import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAuthoritativeServices } from '../../../../../../src/nodes/initialize-project/phase1/shared/authoritative-services.js';

describe('loadAuthoritativeServices', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'authoritative-services-'));
    mkdirSync(join(tempDir, 'phase1-outputs'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeStructureOutput(payload: unknown): void {
    writeFileSync(
      join(tempDir, 'phase1-outputs', '01-structure-architecture.json'),
      JSON.stringify(payload, null, 2),
    );
  }

  it('returns the authoritative services from a well-formed structure-analyzer output', () => {
    writeStructureOutput({
      agent_name: 'structure-architecture-analyzer',
      timestamp: '2026-04-29T13:00:00.000Z',
      findings: {
        services: [
          { id: 'api', path: 'services/api', type: 'backend', language: 'typescript' },
          { id: 'web', path: 'apps/web', type: 'frontend', language: 'javascript' },
          { id: 'lib', path: 'packages/lib', type: 'library', language: 'typescript' },
        ],
      },
    });

    const result = loadAuthoritativeServices(tempDir);
    expect(result.error).toBeUndefined();
    expect(result.services).toHaveLength(3);
    expect(result.services.map((s) => s.id)).toEqual(['api', 'web', 'lib']);
    expect(result.services[0]).toMatchObject({
      id: 'api',
      path: 'services/api',
      type: 'backend',
      language: 'typescript',
    });
  });

  it('skips entries missing an id (defensive)', () => {
    writeStructureOutput({
      findings: {
        services: [
          { id: 'good', path: 'a' },
          { path: 'no-id-here' }, // missing id
          { id: '', path: 'empty-id' }, // empty id
          { id: 'good2', path: 'b' },
        ],
      },
    });

    const result = loadAuthoritativeServices(tempDir);
    expect(result.error).toBeUndefined();
    expect(result.services.map((s) => s.id)).toEqual(['good', 'good2']);
  });

  it('reports an error when the file does not exist', () => {
    // No file written.
    const result = loadAuthoritativeServices(tempDir);
    expect(result.services).toEqual([]);
    expect(result.error).toMatch(/structure-analyzer output not found/);
  });

  it('reports an error when the file is malformed JSON', () => {
    writeFileSync(
      join(tempDir, 'phase1-outputs', '01-structure-architecture.json'),
      'not valid json {{{',
    );
    const result = loadAuthoritativeServices(tempDir);
    expect(result.services).toEqual([]);
    expect(result.error).toMatch(/failed to parse/);
  });

  it('reports an error when findings.services is missing', () => {
    writeStructureOutput({
      agent_name: 'structure-architecture-analyzer',
      findings: {
        /* no services */
      },
    });
    const result = loadAuthoritativeServices(tempDir);
    expect(result.services).toEqual([]);
    expect(result.error).toMatch(/missing findings.services array/);
  });

  it('reports an error when findings.services has zero usable entries', () => {
    writeStructureOutput({
      findings: {
        services: [{ path: 'no-id' }, { id: '   ', path: 'whitespace-only-id' }],
      },
    });
    const result = loadAuthoritativeServices(tempDir);
    expect(result.services).toEqual([]);
    expect(result.error).toMatch(/no usable services/);
  });

  describe('stack-agnostic — works for any service shape', () => {
    // Smoke test: services from radically different stacks all flow through
    // unchanged. The loader has no hardcoded knowledge of any specific
    // language or framework.
    it('loads PHP / Ruby / .NET / Java / Python / Go / Rust together', () => {
      writeStructureOutput({
        findings: {
          services: [
            { id: 'legacy-php', path: 'admin', type: 'backend', language: 'php' },
            { id: 'rails-api', path: 'api', type: 'backend', language: 'ruby' },
            { id: 'dotnet-svc', path: 'services/Worker', type: 'worker', language: 'csharp' },
            { id: 'spring-app', path: 'apps/customer', type: 'backend', language: 'java' },
            { id: 'django-svc', path: 'analytics', type: 'backend', language: 'python' },
            { id: 'go-svc', path: 'cmd/scheduler', type: 'backend', language: 'go' },
            { id: 'rust-cli', path: 'tools/migrator', type: 'cli', language: 'rust' },
            { id: 'cobol-bridge', path: 'legacy/cobol-bridge', type: 'library', language: 'cobol' },
          ],
        },
      });

      const result = loadAuthoritativeServices(tempDir);
      expect(result.error).toBeUndefined();
      expect(result.services).toHaveLength(8);
      // Spot check legacy stack passed through unchanged.
      expect(result.services.find((s) => s.id === 'cobol-bridge')?.language).toBe('cobol');
    });
  });
});
