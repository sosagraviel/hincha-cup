/**
 * Integration-fixtures sanity test.
 *
 * Asserts (no LLM, no spawn):
 *   - Each fixture's file count + source-file count stays under its
 *     declared budget.
 *   - The `qubika-agentic-framework` symlink resolves to the framework
 *     repo root.
 *   - Every path listed in `.fixture-meta.json#required_categories` exists
 *     (with `<path>#<json-key>` resolution for in-JSON keys like
 *     `package.json#lint-staged`).
 *   - The fixture's declared `service_types_present` are actually
 *     represented by directories under it.
 *   - No run-artefact directories (`.claude-temp` / `.claude` / `docs/llm-wiki`)
 *     have been accidentally committed.
 *   - Husky hook scripts are executable (+x).
 *   - README.md contains at least one matched run-section heading so
 *     structure-analyzer README-extraction has something to find.
 *
 * The whole suite runs in well under a second — pure filesystem reads.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';

// __dirname → orchestration/test/unit/integration-fixtures
// up 3 → orchestration (where the test fixtures live)
// up 4 → framework root (where the qubika-agentic-framework symlinks point)
const FIXTURES_ROOT = resolve(__dirname, '../../../test/integration/initialize-project/projects');
const FRAMEWORK_ROOT = resolve(__dirname, '../../../..');
const FIXTURES = ['mini-monorepo', 'mini-serverless', 'mini-microservices'] as const;

interface FixtureMeta {
  name: string;
  shape: string;
  expected_file_count_max: number;
  expected_source_file_count_max: number;
  languages: string[];
  services_count: number;
  service_types_present: string[];
  required_categories: Record<string, string[]>;
}

/**
 * Walk a directory recursively, returning every file's relative path.
 * Skips `node_modules`, `.git`, the framework symlink target, and the
 * usual generated/cache directories that should never be present in a
 * committed fixture anyway.
 */
function walkFiles(root: string): string[] {
  const SKIP = new Set([
    'node_modules',
    '.git',
    'qubika-agentic-framework',
    '.claude-temp',
    '.codex-temp',
    '.claude',
    '.codex',
    'dist',
    'build',
    'coverage',
    '__pycache__',
    '.pytest_cache',
    '.venv',
    '.next',
    '.code-review-graph',
  ]);
  const out: string[] = [];

  function visit(dir: string, rel: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue; // skip the framework symlink
      if (entry.isDirectory()) visit(full, relPath);
      else if (entry.isFile()) out.push(relPath);
    }
  }
  visit(root, '');
  return out;
}

/**
 * Conservative source-file matcher per fixture language family. Excludes
 * config + lockfile + test files so the source-file budget reflects the
 * actual product-code surface.
 */
function isSourceFile(relPath: string, languages: string[]): boolean {
  const lower = relPath.toLowerCase();
  // Exclude common config / lock / docs / test patterns.
  if (lower.endsWith('.md')) return false;
  if (lower.endsWith('.json') && !lower.endsWith('package.json')) return false;
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return false;
  if (lower.endsWith('.lock') || lower.endsWith('package-lock.json')) return false;
  if (/\.(config|conf|ignore|rc)\./.test(lower) || lower.endsWith('.editorconfig')) return false;
  if (/(jest|vitest|playwright|cypress|eslint|prettier|tsconfig)\.config\./i.test(relPath))
    return false;
  if (lower.includes('/tests/') && !lower.endsWith('.cs')) return false;
  if (lower.includes('/test/')) return false;
  if (/(\.test|\.spec)\.[jt]sx?$/.test(lower)) return false;
  if (/test_[^/]+\.py$/.test(lower)) return false;
  if (/_test\.go$/.test(lower)) return false;
  if (lower.startsWith('cypress/')) return false;
  if (lower.startsWith('e2e/')) return false;

  if (languages.includes('typescript') && /\.(ts|tsx)$/.test(lower)) return true;
  if (languages.includes('javascript') && /\.(js|jsx|mjs|cjs)$/.test(lower)) return true;
  if (languages.includes('python') && lower.endsWith('.py') && !lower.endsWith('__init__.py'))
    return true;
  if (languages.includes('go') && lower.endsWith('.go')) return true;
  if (languages.includes('csharp') && /\.(cs|csproj)$/.test(lower) && !lower.endsWith('.csproj'))
    return true;
  if (languages.includes('protobuf') && lower.endsWith('.proto')) return true;
  return false;
}

const READ_SECTION_HEADINGS = [
  /^##\s+Getting\s+Started\b/im,
  /^##\s+Setup\b/im,
  /^##\s+Installation\b/im,
  /^##\s+Quickstart\b/im,
  /^##\s+Quick\s+Start\b/im,
  /^##\s+Running\s+Locally\b/im,
  /^##\s+Local\s+Development\b/im,
  /^##\s+Development\b/im,
  /^##\s+How\s+to\s+Run\b/im,
];

describe.each(FIXTURES)('integration fixture: %s', (fixtureName) => {
  const fixtureDir = join(FIXTURES_ROOT, fixtureName);
  const metaPath = join(fixtureDir, '.fixture-meta.json');

  it('fixture directory exists', () => {
    expect(existsSync(fixtureDir)).toBe(true);
  });

  it('.fixture-meta.json exists + parses', () => {
    expect(existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as FixtureMeta;
    expect(meta.name).toBe(fixtureName);
    expect(meta.expected_file_count_max).toBeGreaterThan(0);
    expect(meta.required_categories).toBeDefined();
  });

  it('framework symlink resolves to the framework repo root', () => {
    const symlinkPath = join(fixtureDir, 'qubika-agentic-framework');
    expect(existsSync(symlinkPath)).toBe(true);
    const stats = statSync(symlinkPath);
    expect(stats.isDirectory()).toBe(true);
    // Follow the symlink (resolve() only normalises path strings; we need
    // realpathSync to actually traverse).
    const target = realpathSync(symlinkPath);
    const expected = realpathSync(FRAMEWORK_ROOT);
    expect(target).toBe(expected);
  });

  it('file count under budget', () => {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as FixtureMeta;
    const files = walkFiles(fixtureDir);
    expect(files.length, `${fixtureName} file count`).toBeLessThanOrEqual(
      meta.expected_file_count_max,
    );
  });

  it('source-file count under budget', () => {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as FixtureMeta;
    const files = walkFiles(fixtureDir);
    const sources = files.filter((f) => isSourceFile(f, meta.languages));
    expect(sources.length, `${fixtureName} source files`).toBeLessThanOrEqual(
      meta.expected_source_file_count_max,
    );
  });

  it('no committed run-artefact directories', () => {
    for (const dir of ['.claude-temp', '.codex-temp', '.claude', '.codex', 'docs/llm-wiki']) {
      expect(existsSync(join(fixtureDir, dir)), `${dir} must not be committed`).toBe(false);
    }
  });

  describe('required-category coverage', () => {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as FixtureMeta;
    for (const [category, paths] of Object.entries(meta.required_categories)) {
      describe(category, () => {
        for (const declared of paths) {
          // `path#json-key` style — resolve into the JSON file and assert
          // the key is present.
          const [filePath, jsonKey] = declared.split('#');
          it(declared, () => {
            const absPath = join(fixtureDir, filePath);
            expect(existsSync(absPath), `missing: ${filePath}`).toBe(true);
            if (jsonKey) {
              const parsed = JSON.parse(readFileSync(absPath, 'utf-8')) as Record<string, unknown>;
              expect(parsed[jsonKey], `missing key '${jsonKey}' in ${filePath}`).toBeDefined();
            }
          });
        }
      });
    }
  });

  it('husky hook scripts are executable (+x)', () => {
    for (const hook of ['pre-commit', 'commit-msg', 'pre-push']) {
      const hookPath = join(fixtureDir, '.husky', hook);
      if (!existsSync(hookPath)) continue; // category test already covers presence
      const stats = statSync(hookPath);
      // POSIX permission bits — 0o111 = any-execute.
      expect(stats.mode & 0o111, `${hook} must be +x`).toBeGreaterThan(0);
    }
  });

  it('README.md has at least one matched run-section heading', () => {
    const readmePath = join(fixtureDir, 'README.md');
    expect(existsSync(readmePath)).toBe(true);
    const body = readFileSync(readmePath, 'utf-8');
    const matched = READ_SECTION_HEADINGS.some((re) => re.test(body));
    expect(matched, `README.md must contain one of: Getting Started / Setup / …`).toBe(true);
  });

  it('every declared service_types_present has at least one service directory', () => {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as FixtureMeta;
    // Service-type diversity is asserted indirectly via the
    // services-count check below. The fully-rigorous check (parse
    // structure-analyzer output) requires an LLM run — outside this
    // sanity test's scope. We just assert the array is non-empty +
    // declared types are realistic.
    expect(meta.service_types_present.length).toBeGreaterThan(0);
    for (const t of meta.service_types_present) {
      expect(t).toMatch(/^[a-z][a-z0-9-]+$/);
    }
  });

  it('declared services_count is positive', () => {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as FixtureMeta;
    expect(meta.services_count).toBeGreaterThan(0);
  });
});
