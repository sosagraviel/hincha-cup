import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PATCH_BASELINE_SUFFIX,
  applyMergePatch,
  buildPatchModeFeedback,
  getPatchPaths,
  isPatchEnvelope,
  readPatchBaseline,
  writePatchBaseline,
} from '../../../../../../src/nodes/initialize-project/phase1/shared/patch-mode.js';

describe('isPatchEnvelope', () => {
  it('accepts a well-formed envelope with all three required fields', () => {
    expect(
      isPatchEnvelope({
        _patch_format: 'RFC7396',
        _patch_target_agent: 'structure-architecture-analyzer',
        _patch: { findings: { architecture_pattern: 'Microservices' } },
      }),
    ).toBe(true);
  });

  it('rejects when _patch_format is wrong / missing / wrong-version', () => {
    expect(
      isPatchEnvelope({
        _patch_format: 'RFC7396v2',
        _patch_target_agent: 'x',
        _patch: {},
      }),
    ).toBe(false);
    expect(isPatchEnvelope({ _patch_target_agent: 'x', _patch: {} })).toBe(false);
  });

  it('rejects when _patch_target_agent is missing or empty', () => {
    expect(isPatchEnvelope({ _patch_format: 'RFC7396', _patch: {} })).toBe(false);
    expect(isPatchEnvelope({ _patch_format: 'RFC7396', _patch_target_agent: '', _patch: {} })).toBe(
      false,
    );
  });

  it('rejects when _patch is not an object or is an array', () => {
    expect(
      isPatchEnvelope({
        _patch_format: 'RFC7396',
        _patch_target_agent: 'x',
        _patch: 'not-an-object',
      }),
    ).toBe(false);
    expect(
      isPatchEnvelope({
        _patch_format: 'RFC7396',
        _patch_target_agent: 'x',
        _patch: [1, 2, 3],
      }),
    ).toBe(false);
  });

  it('rejects null, scalars, arrays at top level', () => {
    expect(isPatchEnvelope(null)).toBe(false);
    expect(isPatchEnvelope(undefined)).toBe(false);
    expect(isPatchEnvelope('string')).toBe(false);
    expect(isPatchEnvelope(42)).toBe(false);
    expect(isPatchEnvelope([])).toBe(false);
  });

  it('rejects a regular analyzer output that lacks the envelope keys', () => {
    expect(
      isPatchEnvelope({
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-05-14T00:00:00Z',
        findings: {},
      }),
    ).toBe(false);
  });
});

describe('applyMergePatch (RFC 7396)', () => {
  it('adds new top-level keys', () => {
    expect(applyMergePatch({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('overwrites existing scalar values', () => {
    expect(applyMergePatch({ a: 1 }, { a: 'new' })).toEqual({ a: 'new' });
  });

  it('recursively merges nested objects', () => {
    expect(
      applyMergePatch(
        { nested: { kept: 'old', changed: 'before' } },
        { nested: { changed: 'after', added: 1 } },
      ),
    ).toEqual({ nested: { kept: 'old', changed: 'after', added: 1 } });
  });

  it('replaces arrays wholesale (no positional merge)', () => {
    expect(applyMergePatch({ list: [1, 2, 3] }, { list: [9] })).toEqual({ list: [9] });
  });

  it('deletes keys when patch value is null', () => {
    expect(applyMergePatch({ a: 1, b: 2 }, { a: null })).toEqual({ b: 2 });
  });

  it('returns null when patch is null at top level', () => {
    expect(applyMergePatch({ a: 1 }, null)).toBe(null);
  });

  it('does not mutate the inputs', () => {
    const target = { a: { b: 1 } };
    const patch = { a: { c: 2 } };
    const targetSnapshot = JSON.stringify(target);
    const patchSnapshot = JSON.stringify(patch);
    applyMergePatch(target, patch);
    expect(JSON.stringify(target)).toBe(targetSnapshot);
    expect(JSON.stringify(patch)).toBe(patchSnapshot);
  });

  it('treats a non-object target as empty when patch is an object', () => {
    expect(applyMergePatch(null, { a: 1 })).toEqual({ a: 1 });
    expect(applyMergePatch('string', { a: 1 })).toEqual({ a: 1 });
  });

  it('handles deep nested deletes', () => {
    expect(
      applyMergePatch(
        { findings: { services: [{ id: 'a' }], extra: 'kept' } },
        { findings: { extra: null } },
      ),
    ).toEqual({ findings: { services: [{ id: 'a' }] } });
  });

  it('preserves keys not mentioned in the patch (the core RFC 7396 property)', () => {
    const baseline = {
      agent_name: 'structure-architecture-analyzer',
      timestamp: '2026-05-14T00:00:00Z',
      findings: {
        services: [{ id: 'web', path: 'web' }],
        repository_type: 'monorepo',
        architecture_pattern: 'Modular Monolith',
      },
      needs_verification: [],
    };
    const patch = { findings: { architecture_pattern: 'Microservices' } };
    const merged = applyMergePatch(baseline, patch);
    expect(merged).toEqual({
      agent_name: 'structure-architecture-analyzer',
      timestamp: '2026-05-14T00:00:00Z',
      findings: {
        services: [{ id: 'web', path: 'web' }],
        repository_type: 'monorepo',
        architecture_pattern: 'Microservices',
      },
      needs_verification: [],
    });
  });
});

describe('getPatchPaths', () => {
  it('emits a stable path under phase1-outputs for each known analyzer', () => {
    const cases: Array<[string, string]> = [
      ['structure-architecture-analyzer', '01-structure-architecture.json'],
      ['tech-stack-dependencies-analyzer', '02-tech-stack-dependencies.json'],
      ['code-patterns-testing-analyzer', '03-code-patterns-testing.json'],
      ['data-flows-integrations-analyzer', '04-data-flows-integrations.json'],
    ];
    for (const [agent, file] of cases) {
      expect(getPatchPaths('/tmp/tempdir', agent).baselinePath).toBe(
        `/tmp/tempdir/phase1-outputs/${file}${PATCH_BASELINE_SUFFIX}`,
      );
    }
  });

  it('falls back to a sane filename for unknown agents', () => {
    expect(getPatchPaths('/t', 'unknown-agent').baselinePath).toBe(
      `/t/phase1-outputs/unknown-agent.json${PATCH_BASELINE_SUFFIX}`,
    );
  });
});

describe('writePatchBaseline / readPatchBaseline round-trip', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'patch-baseline-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists arbitrary JSON and reads it back identically (default stage = fully-clean)', () => {
    const baselinePath = join(
      dir,
      'phase1-outputs',
      '01-structure-architecture.json' + PATCH_BASELINE_SUFFIX,
    );
    const data = { foo: 'bar', nested: { list: [1, 2, 3] } };
    writePatchBaseline(baselinePath, data);
    const loaded = readPatchBaseline(baselinePath);
    expect(loaded?.data).toEqual(data);
    expect(loaded?.stage).toBe('fully-clean');
  });

  it('tags the baseline with the supplied stage (partial / schema-clean / fully-clean)', () => {
    const baselinePath = join(dir, 'tag-test.json');
    writePatchBaseline(baselinePath, { a: 1 }, 'partial');
    expect(readPatchBaseline(baselinePath)?.stage).toBe('partial');
    writePatchBaseline(baselinePath, { a: 2 }, 'schema-clean');
    expect(readPatchBaseline(baselinePath)?.stage).toBe('schema-clean');
    writePatchBaseline(baselinePath, { a: 3 }, 'fully-clean');
    expect(readPatchBaseline(baselinePath)?.stage).toBe('fully-clean');
  });

  it('loads a pre-stage-wrapper baseline file as fully-clean (back-compat)', () => {
    const baselinePath = join(dir, 'legacy.json');
    // Write the old raw-data shape (no `_stage` wrapper) to verify the reader
    // still accepts it. Older runs left files in this shape on disk.
    mkdirSync(dir, { recursive: true });
    writeFileSync(baselinePath, JSON.stringify({ legacy: true }), 'utf-8');
    const loaded = readPatchBaseline(baselinePath);
    expect(loaded?.data).toEqual({ legacy: true });
    expect(loaded?.stage).toBe('fully-clean');
  });

  it('returns undefined when the baseline file is missing', () => {
    const baselinePath = join(dir, 'never-written.json');
    expect(readPatchBaseline(baselinePath)).toBeUndefined();
  });

  it('returns undefined on malformed JSON (defensive)', () => {
    const baselinePath = join(dir, 'broken.json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(baselinePath, '{"not"valid json', 'utf-8');
    expect(readPatchBaseline(baselinePath)).toBeUndefined();
  });

  it('write is best-effort and never throws on a non-writable path', () => {
    expect(() =>
      writePatchBaseline('/this/path/should/not/exist/cant-write.json', { x: 1 }),
    ).not.toThrow();
  });

  it('round-trips pretty-formatted JSON (operator legibility)', () => {
    const baselinePath = join(dir, 'pretty.json');
    writePatchBaseline(baselinePath, { a: 1, b: { c: 2 } });
    const raw = readFileSync(baselinePath, 'utf-8');
    expect(raw).toContain('\n');
    expect(raw).toContain('  ');
  });
});

describe('buildPatchModeFeedback', () => {
  it('returns an empty string when no baseline path is given', () => {
    expect(buildPatchModeFeedback('', 'x')).toBe('');
  });

  it('mentions the exact baseline path and agent name (model needs both)', () => {
    const out = buildPatchModeFeedback('/abs/baseline.json', 'structure-architecture-analyzer');
    expect(out).toContain('/abs/baseline.json');
    expect(out).toContain('structure-architecture-analyzer');
    expect(out).toContain('PATCH MODE');
    expect(out).toContain('"_patch_format": "RFC7396"');
  });

  it('explains the merge semantics so the model emits a valid patch', () => {
    const out = buildPatchModeFeedback('/abs/x.json', 'data-flows-integrations-analyzer');
    expect(out).toContain('null');
    expect(out).toContain('Arrays are replaced wholesale');
    expect(out).toContain('RFC 7396');
  });
});
