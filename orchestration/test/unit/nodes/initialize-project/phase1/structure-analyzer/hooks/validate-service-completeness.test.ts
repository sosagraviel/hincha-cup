/**
 * Service-completeness validator unit tests.
 *
 * Pure-function tests against `detectServiceCompletenessViolations()`.
 * Each test builds a temporary directory shape on the filesystem and
 * asserts the validator returns the expected set of un-covered manifest
 * directories.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  detectServiceCompletenessViolations,
  formatServiceCompletenessViolations,
} from '../../../../../../../src/nodes/initialize-project/phase1/structure-analyzer/hooks/validate-service-completeness.js';

const fixtures: string[] = [];

function mkFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-completeness-'));
  fixtures.push(dir);
  return dir;
}

function write(root: string, rel: string, contents = ''): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

function mkdirp(root: string, rel: string): void {
  fs.mkdirSync(path.join(root, rel), { recursive: true });
}

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('detectServiceCompletenessViolations', () => {
  it('returns [] when every manifest dir is listed in services', () => {
    const root = mkFixture();
    write(root, 'services/api/package.json', '{}');
    write(root, 'services/web/package.json', '{}');
    write(root, 'workers/etl/pyproject.toml', '');
    write(root, 'libs/shared/go.mod', '');

    const data = {
      findings: {
        services: [
          { id: 'api', path: 'services/api', type: 'backend', language: 'typescript' },
          { id: 'web', path: 'services/web', type: 'frontend', language: 'typescript' },
          { id: 'etl', path: 'workers/etl', type: 'worker', language: 'python' },
          { id: 'shared', path: 'libs/shared', type: 'library', language: 'go' },
        ],
      },
    };
    expect(detectServiceCompletenessViolations(data, root, [])).toEqual([]);
  });

  it('flags manifest dirs the analyzer omitted', () => {
    const root = mkFixture();
    write(root, 'services/api/package.json', '{}');
    write(root, 'services/web/package.json', '{}');
    write(root, 'workers/etl/pyproject.toml', '');

    const data = {
      findings: {
        services: [{ id: 'api', path: 'services/api', type: 'backend', language: 'typescript' }],
      },
    };
    const violations = detectServiceCompletenessViolations(data, root, []);
    expect(violations.map((v) => v.path).sort()).toEqual(['services/web', 'workers/etl']);
  });

  it('treats needs_verification mentions as covering the candidate', () => {
    const root = mkFixture();
    write(root, 'services/api/package.json', '{}');
    write(root, 'libs/legacy/pyproject.toml', '');

    const data = {
      findings: {
        services: [{ id: 'api', path: 'services/api', type: 'backend', language: 'typescript' }],
      },
      needs_verification: [
        {
          id: 'q1',
          question: 'Is libs/legacy still a separate service?',
          reason: 'cannot tell whether libs/legacy is shipped or vendored',
          attempted_resolution: [
            'Read libs/legacy/pyproject.toml — no entry point',
            'Grep for "libs/legacy" in services/* — referenced by api as a vendored copy',
          ],
          impact: 'changes whether libs/legacy gets its own services entry and wiki page',
        },
      ],
    };
    expect(detectServiceCompletenessViolations(data, root, [])).toEqual([]);
  });

  it('skips excluded directories like node_modules / vendor', () => {
    const root = mkFixture();
    write(root, 'services/api/package.json', '{}');
    // Common transitive manifests under excluded trees that must NOT
    // be flagged as missing services.
    write(root, 'node_modules/foo/package.json', '{}');
    write(root, 'vendor/legacy/package.json', '{}');

    const data = {
      findings: {
        services: [{ id: 'api', path: 'services/api', type: 'backend', language: 'typescript' }],
      },
    };
    const violations = detectServiceCompletenessViolations(data, root, ['node_modules', 'vendor']);
    expect(violations).toEqual([]);
  });

  it('dedupes Android module dirs that have both build.gradle.kts AND AndroidManifest.xml', () => {
    const root = mkFixture();
    write(root, 'services/apps/mobile/android/build.gradle.kts', '');
    write(root, 'services/apps/mobile/android/AndroidManifest.xml', '');

    const data = { findings: { services: [] } };
    const violations = detectServiceCompletenessViolations(data, root, []);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('services/apps/mobile/android');
  });

  it('treats *.xcodeproj directory as a single iOS candidate', () => {
    const root = mkFixture();
    write(root, 'services/apps/mobile/ios/Package.swift', '');
    mkdirp(root, 'services/apps/mobile/ios/App.xcodeproj');
    write(root, 'services/apps/mobile/ios/Info.plist', '');

    const data = { findings: { services: [] } };
    const violations = detectServiceCompletenessViolations(data, root, []);
    // All three manifests live in the same dir → ONE candidate.
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('services/apps/mobile/ios');
  });

  it('returns one violation when the only manifest dir is unlisted', () => {
    const root = mkFixture();
    write(root, 'services/api/package.json', '{}');
    const data = { findings: { services: [] } };
    const violations = detectServiceCompletenessViolations(data, root, []);
    expect(violations).toHaveLength(1);
    expect(violations[0].path).toBe('services/api');
  });

  it('handles paths emitted with leading ./ from the analyzer', () => {
    const root = mkFixture();
    write(root, 'services/api/package.json', '{}');
    const data = {
      findings: {
        services: [{ id: 'api', path: './services/api', type: 'backend', language: 'typescript' }],
      },
    };
    expect(detectServiceCompletenessViolations(data, root, [])).toEqual([]);
  });

  it('returns [] when the project root is missing (defensive)', () => {
    expect(detectServiceCompletenessViolations({}, '/this/does/not/exist', [])).toEqual([]);
  });
});

describe('formatServiceCompletenessViolations', () => {
  it('emits a single VALIDATION_E016 line listing each path + manifest', () => {
    const lines = formatServiceCompletenessViolations([
      { path: 'services/apps/mobile/android', manifest: 'AndroidManifest.xml' },
      { path: 'services/apps/mobile/ios', manifest: 'Package.swift' },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('VALIDATION_E016_missing_service_paths');
    expect(lines[0]).toContain('2');
    expect(lines[0]).toMatch(/services\/apps\/mobile\/android|AndroidManifest/);
  });

  it('emits no lines when violations are empty', () => {
    expect(formatServiceCompletenessViolations([])).toEqual([]);
  });
});
