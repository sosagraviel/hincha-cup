import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractInfrastructure } from '../../../../../src/nodes/initialize-project/phase4/helpers/infrastructure-extractor.js';

/**
 * Infrastructure extractor must drop category abstractions
 * (`containerization`, `orchestration`, `infrastructure-as-code`)
 * and substitute concrete technology names from project filesystem
 * evidence.
 *
 * Stack-agnostic — pure file-presence checks, no language
 * assumptions.
 */

describe('extractInfrastructure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plan16-infra-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty array when nothing is detected', () => {
    expect(extractInfrastructure({})).toEqual([]);
    expect(extractInfrastructure(null)).toEqual([]);
    expect(extractInfrastructure({ infrastructure: 'not-array' })).toEqual([]);
  });

  it('drops category abstractions emitted by the analyzer', () => {
    const out = extractInfrastructure({
      infrastructure: ['containerization', 'orchestration', 'infrastructure-as-code'],
    });
    expect(out).toEqual([]);
  });

  it('keeps concrete technology names emitted by the analyzer', () => {
    const out = extractInfrastructure({
      infrastructure: ['docker', 'docker-compose', 'kubernetes'],
    });
    expect(out).toEqual(['docker', 'docker-compose', 'kubernetes']);
  });

  it('mixes concrete + categorical: drops categories, keeps tech', () => {
    const out = extractInfrastructure({
      infrastructure: ['containerization', 'docker', 'docker-compose', 'orchestration'],
    });
    expect(out).toEqual(['docker', 'docker-compose']);
  });

  it('augments analyzer output with filesystem evidence', () => {
    writeFileSync(join(tmpDir, 'docker-compose.yml'), 'services: {}\n');
    writeFileSync(join(tmpDir, 'Dockerfile'), 'FROM node:22\n');

    const out = extractInfrastructure({ infrastructure: ['containerization'] }, tmpDir);
    expect(out).toContain('docker');
    expect(out).toContain('docker-compose');
    expect(out).not.toContain('containerization');
  });

  it('detects kubernetes from k8s/ directory', () => {
    mkdirSync(join(tmpDir, 'k8s'));
    writeFileSync(join(tmpDir, 'k8s/deployment.yaml'), 'kind: Deployment\n');
    const out = extractInfrastructure({}, tmpDir);
    expect(out).toContain('kubernetes');
  });

  it('detects terraform from terraform/ folder or .tf files', () => {
    writeFileSync(join(tmpDir, 'main.tf'), 'resource "aws_instance" "x" {}\n');
    const out = extractInfrastructure({}, tmpDir);
    expect(out).toContain('terraform');
  });

  it('detects serverless from serverless.yml', () => {
    writeFileSync(join(tmpDir, 'serverless.yml'), 'service: my-service\n');
    const out = extractInfrastructure({}, tmpDir);
    expect(out).toContain('serverless');
  });

  it('detects multiple technologies on a polyglot project', () => {
    writeFileSync(join(tmpDir, 'Dockerfile'), 'FROM alpine\n');
    writeFileSync(join(tmpDir, 'main.tf'), 'resource "x" "y" {}\n');
    mkdirSync(join(tmpDir, 'helm'));
    const out = extractInfrastructure({}, tmpDir);
    expect(out).toContain('docker');
    expect(out).toContain('terraform');
    expect(out).toContain('kubernetes');
  });

  it('returns sorted, deduped output', () => {
    writeFileSync(join(tmpDir, 'docker-compose.yml'), 'services: {}\n');
    const out = extractInfrastructure({ infrastructure: ['docker-compose', 'docker'] }, tmpDir);
    // Analyzer kept `docker` and `docker-compose`; filesystem evidence
    // re-confirms `docker-compose` (deduped). No Dockerfile present, so
    // `docker` is NOT auto-added by filesystem — but the analyzer's
    // entry survives. Final list is alphabetically sorted, deduped.
    expect(out).toEqual(['docker', 'docker-compose']);
  });

  it('skips filesystem probes when projectPath is undefined', () => {
    const out = extractInfrastructure({ infrastructure: ['docker'] });
    expect(out).toEqual(['docker']);
  });
});
