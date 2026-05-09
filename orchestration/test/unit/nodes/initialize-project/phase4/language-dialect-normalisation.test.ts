/**
 * Plan v4 Phase A.2 — analyzer-emitted dialect tokens
 * (`tsx` / `jsx` / `mts` / `cts` / `bash` / `zsh` / `kt` / `cs` /
 * `cpp` / `py` / `rs`) must collapse to canonical names BEFORE
 * landing in the rendered Tech Stack section, the Phase 4
 * `finalLanguages` set, and the architecture-narrative composer
 * view's `primary_languages`.
 *
 * Without this the user sees `Languages: typescript, tsx, …` in
 * the rendered CLAUDE.md (regression observed on
 * archive/v3-iteration-100, run 2026-05-08T18-26-08).
 *
 * The fix passes every entry through `normalizeLanguage` at four
 * spots that previously emitted raw analyzer values:
 *
 *   1. `phase4/helpers/language-extractor.ts::extractLanguagesFromPhase1`
 *   2. `phase4/helpers/language-validator.ts::crossValidateWithFileCount`
 *   3. `phase4/helpers/language-validator.ts::mergeWorkspaceLanguages`
 *   4. `phase4/helpers/stack-profile-validator.ts::validateStackProfile`
 */

import { describe, expect, it } from 'vitest';
import { extractLanguagesFromPhase1 } from '../../../../../src/nodes/initialize-project/phase4/helpers/language-extractor.js';
import {
  crossValidateWithFileCount,
  mergeWorkspaceLanguages,
} from '../../../../../src/nodes/initialize-project/phase4/helpers/language-validator.js';
import { validateStackProfile } from '../../../../../src/nodes/initialize-project/phase4/helpers/stack-profile-validator.js';
import type {
  FileCountResult,
  WorkspaceDetectionResult,
} from '../../../../../src/nodes/initialize-project/phase4/types.js';

interface SinkLogger {
  info: (m: string) => void;
  warn: (m: string) => void;
  error: (m: string) => void;
  infos: string[];
  warns: string[];
  errors: string[];
}

function makeLogger(): SinkLogger {
  const sink: SinkLogger = {
    info: (m: string) => sink.infos.push(m),
    warn: (m: string) => sink.warns.push(m),
    error: (m: string) => sink.errors.push(m),
    infos: [],
    warns: [],
    errors: [],
  };
  return sink;
}

describe('extractLanguagesFromPhase1 — Plan v4 Phase A.2 dialect normalisation', () => {
  it('collapses tsx → typescript, bash → shell, kt → kotlin, mts → typescript', () => {
    const out = extractLanguagesFromPhase1(
      {
        languages: ['typescript', 'tsx', 'mts', 'cts', 'bash', 'zsh', 'kt', 'cs', 'cpp'],
      },
      {},
    );
    expect(out).toContain('typescript');
    expect(out).toContain('shell');
    expect(out).toContain('kotlin');
    expect(out).toContain('csharp');
    expect(out).toContain('cpp');
    // Dialect tokens MUST NOT appear.
    expect(out).not.toContain('tsx');
    expect(out).not.toContain('mts');
    expect(out).not.toContain('cts');
    expect(out).not.toContain('bash');
    expect(out).not.toContain('zsh');
    expect(out).not.toContain('kt');
    expect(out).not.toContain('cs');
    // Deduped.
    expect(out.filter((x) => x === 'typescript')).toHaveLength(1);
    expect(out.filter((x) => x === 'shell')).toHaveLength(1);
  });

  it('handles version-string object form ({ "api": "TypeScript 5.8" })', () => {
    const out = extractLanguagesFromPhase1(
      {
        languages: { api: 'TypeScript 5.8.x', web: 'JavaScript', cli: 'TSX 5.x' },
      },
      {},
    );
    expect(out).toContain('typescript');
    expect(out).toContain('javascript');
    // "TSX 5.x" → first word "TSX" → normalize → "typescript"
    expect(out.filter((x) => x === 'typescript')).toHaveLength(1);
    expect(out).not.toContain('tsx');
  });

  it('reads per-service language from structureFindings.services[]', () => {
    const out = extractLanguagesFromPhase1(
      {
        services: [
          { id: 'api', language: 'go' },
          { id: 'web', language: 'tsx' },
          { id: 'worker', language: 'erlang' },
        ],
      },
      {},
    );
    expect(out.sort()).toEqual(['erlang', 'go', 'typescript']);
  });

  it('passes unknown dialects through unchanged (stack-agnostic guarantee)', () => {
    const out = extractLanguagesFromPhase1(
      {
        languages: ['nim', 'crystal', 'zig', 'gleam', 'roc'],
      },
      {},
    );
    expect(out).toContain('nim');
    expect(out).toContain('crystal');
    expect(out).toContain('zig');
    expect(out).toContain('gleam');
    expect(out).toContain('roc');
  });
});

describe('Phase 4 validators — Plan v4 Phase A.2 dialect normalisation', () => {
  it('crossValidateWithFileCount normalises before adding to the set', () => {
    const detected = new Set<string>();
    crossValidateWithFileCount(
      detected,
      {
        total_files: 100,
        scanned_directories: 1,
        errors: [],
        by_language: [
          { language: 'tsx', count: 25, extensions: ['.tsx'], directories: ['src'] },
          { language: 'bash', count: 12, extensions: ['.sh'], directories: ['scripts'] },
          { language: 'kt', count: 8, extensions: ['.kt'], directories: ['app'] },
        ],
      },
      makeLogger(),
    );
    expect(Array.from(detected).sort()).toEqual(['kotlin', 'shell', 'typescript']);
  });

  it('mergeWorkspaceLanguages normalises workspace-detection output', () => {
    const detected = new Set<string>();
    mergeWorkspaceLanguages(
      detected,
      {
        is_monorepo: true,
        total_workspaces: 3,
        workspaces: [
          { path: 'apps/api', language: 'TSX', type: 'backend' },
          { path: 'apps/web', language: 'tsx', type: 'frontend' },
          { path: 'apps/cli', language: 'rs', type: 'cli' },
        ],
      } as WorkspaceDetectionResult,
      makeLogger(),
    );
    expect(Array.from(detected).sort()).toEqual(['rust', 'typescript']);
  });
});

describe('validateStackProfile — Plan v4 Phase A.2 warning hygiene', () => {
  const baseFileCount = (overrides: Partial<FileCountResult> = {}): FileCountResult => ({
    total_files: 0,
    by_language: [],
    scanned_directories: 1,
    errors: [],
    tooling_config_counts: {},
    ...overrides,
  });

  it('does NOT warn when the profile has `shell` and the file counter has 1 .sh file', () => {
    const sink = makeLogger();
    validateStackProfile(
      ['typescript', 'shell'],
      baseFileCount({
        total_files: 11,
        by_language: [
          { language: 'typescript', count: 10, extensions: ['.ts'], directories: ['src'] },
          { language: 'shell', count: 1, extensions: ['.sh'], directories: ['scripts'] },
        ],
      }),
      sink,
    );
    expect(sink.warns).toEqual([]);
  });

  it('matches `shell` (profile) against `bash` (file counter) via normalisation', () => {
    const sink = makeLogger();
    validateStackProfile(
      ['shell'],
      baseFileCount({
        total_files: 1,
        by_language: [
          { language: 'bash', count: 1, extensions: ['.sh'], directories: ['scripts'] },
        ],
      }),
      sink,
    );
    expect(sink.warns).toEqual([]);
  });

  it('emits info (not warn) when a profile language has only tooling-config files', () => {
    const sink = makeLogger();
    validateStackProfile(
      ['typescript', 'javascript'],
      baseFileCount({
        total_files: 100,
        by_language: [
          { language: 'typescript', count: 100, extensions: ['.ts'], directories: ['src'] },
        ],
        tooling_config_counts: { javascript: 4 },
      }),
      sink,
    );
    expect(sink.warns).toEqual([]);
    expect(sink.infos.some((m) => /Language javascript .* configuration-only/.test(m))).toBe(true);
    expect(sink.infos.some((m) => /4 tooling-config files/.test(m))).toBe(true);
  });

  it('still warns when a profile language has zero files AND zero tooling configs', () => {
    const sink = makeLogger();
    validateStackProfile(
      ['typescript', 'erlang'],
      baseFileCount({
        total_files: 100,
        by_language: [
          { language: 'typescript', count: 100, extensions: ['.ts'], directories: ['src'] },
        ],
        tooling_config_counts: {},
      }),
      sink,
    );
    expect(sink.warns.some((m) => /Language erlang in profile but no files found/.test(m))).toBe(
      true,
    );
  });

  it('still throws on the 20+ files / not-in-profile case', () => {
    const sink = makeLogger();
    expect(() =>
      validateStackProfile(
        ['typescript'],
        baseFileCount({
          total_files: 30,
          by_language: [
            { language: 'python', count: 30, extensions: ['.py'], directories: ['src'] },
          ],
        }),
        sink,
      ),
    ).toThrow(/Stack profile missing python/);
  });
});
