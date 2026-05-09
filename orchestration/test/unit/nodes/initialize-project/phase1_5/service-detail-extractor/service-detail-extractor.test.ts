/**
 * Plan v4 Phase D — orchestrator helper tests.
 *
 * Asserts the pure orchestration helpers (no LLM spawn). Coverage:
 *   - `buildServiceBlock` renders a stack-agnostic block with id/path/type.
 *   - `writeIndex` validates against `ServiceDetailIndexSchema` before
 *     writing — malformed inputs throw rather than persisting bad JSON.
 *   - `allSlicesAlreadyOnDisk` requires (a) the index to cover exactly the
 *     authoritative service set, (b) every slice file to exist on disk.
 *     Missing index, mismatched count, missing slice, or invalid index
 *     all return false.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allSlicesAlreadyOnDisk,
  buildServiceBlock,
  writeIndex,
} from '../../../../../../src/nodes/initialize-project/phase1_5/service-detail-extractor/service-detail-extractor.node.js';

let workDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'phase1_5-test-'));
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('buildServiceBlock', () => {
  it('renders id + path + type + language for a fully-attributed service', () => {
    const block = buildServiceBlock({
      id: 'api',
      path: 'services/api',
      type: 'backend',
      language: 'typescript',
      name: 'API',
    });
    expect(block).toContain('<id>api</id>');
    expect(block).toContain('<path>services/api</path>');
    expect(block).toContain('<type>backend</type>');
    expect(block).toContain('<language>typescript</language>');
    expect(block).toContain('<name>API</name>');
    expect(block).toContain('PreToolUse hook hard-rejects');
  });

  it('omits optional fields when missing — never emits an empty tag', () => {
    const block = buildServiceBlock({
      id: 'web',
      path: 'services/web',
    });
    expect(block).toContain('<id>web</id>');
    expect(block).toContain('<path>services/web</path>');
    expect(block).not.toContain('<type>');
    expect(block).not.toContain('<language>');
    expect(block).not.toContain('<name>');
  });

  it('does not enumerate languages — stack-agnostic', () => {
    const block = buildServiceBlock({
      id: 'svc',
      path: 'svc',
      language: 'cobol', // intentionally exotic
    });
    // Renderer must accept any language identifier without enumerating it.
    expect(block).toContain('<language>cobol</language>');
  });
});

describe('writeIndex', () => {
  it('writes a valid index to disk', () => {
    const indexPath = join(workDir, '_index.json');
    writeIndex(indexPath, {
      timestamp: '2026-05-09T00:00:00.000Z',
      services_total: 1,
      services_completed: 1,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: { api: 'service-details/api.json' },
    });
    const written = JSON.parse(require('fs').readFileSync(indexPath, 'utf-8'));
    expect(written.services_completed).toBe(1);
    expect(written.slices.api).toBe('service-details/api.json');
  });

  it('throws (does not persist) on a malformed index', () => {
    const indexPath = join(workDir, '_index.json');
    expect(() =>
      writeIndex(indexPath, {
        timestamp: '2026-05-09T00:00:00.000Z',
        services_total: -1, // invalid
        services_completed: 0,
        services_failed: 0,
        services_timed_out: 0,
        soft_warning: [],
        slices: {},
      } as unknown as Parameters<typeof writeIndex>[1]),
    ).toThrow();
  });
});

describe('allSlicesAlreadyOnDisk', () => {
  const services = [
    { id: 'api', path: 'services/api' },
    { id: 'web', path: 'services/web' },
  ];

  it('returns false when the index is missing', () => {
    expect(allSlicesAlreadyOnDisk(join(workDir, 'missing.json'), workDir, services)).toBe(false);
  });

  it('returns false when the index covers a different service count', () => {
    const indexPath = join(workDir, '_index.json');
    const sliceDir = workDir;
    writeIndex(indexPath, {
      timestamp: '2026-05-09T00:00:00.000Z',
      services_total: 1,
      services_completed: 1,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: { api: 'service-details/api.json' },
    });
    expect(allSlicesAlreadyOnDisk(indexPath, sliceDir, services)).toBe(false);
  });

  it('returns false when a slice file is referenced but missing on disk', () => {
    const indexPath = join(workDir, '_index.json');
    writeIndex(indexPath, {
      timestamp: '2026-05-09T00:00:00.000Z',
      services_total: 2,
      services_completed: 2,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: {
        api: 'service-details/api.json',
        web: 'service-details/web.json',
      },
    });
    // Only api.json exists on disk; web.json is referenced but missing.
    writeFileSync(join(workDir, 'api.json'), '{}');
    expect(allSlicesAlreadyOnDisk(indexPath, workDir, services)).toBe(false);
  });

  it('returns true when index + every slice file are present', () => {
    const indexPath = join(workDir, '_index.json');
    writeIndex(indexPath, {
      timestamp: '2026-05-09T00:00:00.000Z',
      services_total: 2,
      services_completed: 2,
      services_failed: 0,
      services_timed_out: 0,
      soft_warning: [],
      slices: {
        api: 'service-details/api.json',
        web: 'service-details/web.json',
      },
    });
    writeFileSync(join(workDir, 'api.json'), '{}');
    writeFileSync(join(workDir, 'web.json'), '{}');
    expect(allSlicesAlreadyOnDisk(indexPath, workDir, services)).toBe(true);
  });

  it('returns false when the index file is unparseable', () => {
    const indexPath = join(workDir, '_index.json');
    writeFileSync(indexPath, 'not-json');
    expect(allSlicesAlreadyOnDisk(indexPath, workDir, services)).toBe(false);
  });
});
