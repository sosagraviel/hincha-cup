import { readFileSync, readdirSync, statSync } from 'fs';
import { extname, join, relative } from 'path';
import { describe, expect, it } from 'vitest';
import {
  NON_PORTABLE_ABSOLUTE_PATTERN,
  stripExampleFences,
} from '../../../src/nodes/initialize-project/phase6/helpers/portability-validator.js';

const SKILLS_ROOT = join(__dirname, '../../../..', 'skills');
// Same text-extension allowlist as the runtime validator. Skills are mostly
// .md but we walk all text files for symmetry.
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const SKIP_DIRS = new Set(['node_modules', '.git']);

interface Violation {
  file: string;
  line: number;
  content: string;
}

function walkSkills(dir: string, into: Violation[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walkSkills(full, into);
      continue;
    }
    if (!s.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(extname(entry).toLowerCase())) continue;

    let content: string;
    try {
      content = readFileSync(full, 'utf-8');
    } catch {
      continue;
    }
    const stripped = stripExampleFences(content);
    const lines = stripped.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (NON_PORTABLE_ABSOLUTE_PATTERN.test(lines[i])) {
        into.push({
          file: relative(SKILLS_ROOT, full),
          line: i + 1,
          content: lines[i].trim().slice(0, 160),
        });
      }
    }
  }
}

describe('skill source portability (CI guard)', () => {
  it('no skill markdown contains non-portable absolute paths outside <!-- portable-example --> fences', () => {
    const violations: Violation[] = [];
    walkSkills(SKILLS_ROOT, violations);

    if (violations.length > 0) {
      const lines = violations.map((v) => `  - ${v.file}:${v.line} | ${v.content}`).join('\n');
      throw new Error(
        `Skill sources contain non-portable absolute paths.\n` +
          `Either rewrite them to ~/-relative form or wrap the example in\n` +
          `<!-- portable-example-start --> / <!-- portable-example-end --> fences.\n\n${lines}`,
      );
    }

    expect(violations).toEqual([]);
  });
});
