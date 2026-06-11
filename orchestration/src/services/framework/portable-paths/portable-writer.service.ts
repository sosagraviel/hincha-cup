/**
 * The single supported way to write into `<project>/.claude/` or `.codex/`.
 *
 * Three entry points, all wrapping `fs` writes with portability assertions:
 *   - writeJson(target, data, schema?): deep-walk + Zod-refine + assert + write
 *   - writeMarkdown(target, content): scan content + assert + write
 *   - copyPortable(source, target): read source + assert + write
 *
 * The asserter delegates to PortablePathResolver.isNonPortable, so allowlists
 * for `/tmp/`, URLs, and explicit `<!-- portable-example-* -->` fences are honored.
 *
 * Direct fs.writeFileSync calls into `.claude/` or `.codex/` paths are forbidden
 * by an ESLint rule shipped alongside this module (see eslint-plugin-local).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, sep } from 'path';

import type { AbsolutePath } from './types.js';
import { PortabilityError } from './types.js';
import { PortablePathResolver } from './path-resolver.service.js';

export class PortableWriter {
  constructor(private readonly resolver: PortablePathResolver) {}

  /**
   * Write JSON to an absolute target path. The data is deep-walked: any string
   * value that looks like an in-project absolute path is rewritten to a
   * project-relative form before serialization. Out-of-project absolutes throw.
   *
   * Schema validation is intentionally NOT done here — that's the writer's job
   * upstream (config-generator already calls FrameworkConfigSchema.parse before
   * handing the value here). PortableWriter's responsibility is portability,
   * not schema correctness.
   */
  writeJson<T>(target: AbsolutePath, data: T): void {
    const rewritten = this.deepRelativize(data);
    const json = JSON.stringify(rewritten, null, 2);
    this.assertPortable(json, target);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, json + '\n');
  }

  /**
   * Write markdown (or any text) to an absolute target. Asserts the content
   * contains no non-allowlisted absolute paths before writing.
   */
  writeMarkdown(target: AbsolutePath, content: string): void {
    this.assertPortable(content, target);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  /**
   * Copy a source file (e.g. a framework-shipped skill) to a target inside the
   * project's .claude/ or .codex/ tree. Asserts the source content is portable
   * before the copy lands.
   */
  copyPortable(source: AbsolutePath, target: AbsolutePath): void {
    const content = readFileSync(source, 'utf-8');
    this.assertPortable(content, target);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  /**
   * Walks any JSON-like structure; rewrites in-project absolute strings to
   * project-relative; throws on out-of-project absolutes.
   */
  private deepRelativize(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.relativizeString(value);
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.deepRelativize(v));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.deepRelativize(v);
      }
      return out;
    }
    return value;
  }

  /**
   * Rewrites in-project absolute paths inside a string to project-relative form.
   *
   * Every occurrence of the project-root prefix is stripped, whether the string
   * *is* a bare in-project path or *embeds* one in prose — so a string holding
   * several paths, or a path mid-sentence with trailing punctuation, is handled
   * by one literal rewrite with no over-capture. The root itself collapses to
   * ".". Out-of-project absolutes never match the prefix, so they survive intact
   * for `assertPortable` to reject — the portability guarantee is preserved.
   */
  private relativizeString(value: string): string {
    const root = this.resolver.getProjectRoot();
    if (value === root) return '.';
    const prefix = root.endsWith(sep) ? root : root + sep;
    if (!value.includes(prefix)) return value;
    const stripped = value.split(prefix).join('');
    return stripped === '' ? '.' : stripped;
  }

  private assertPortable(content: string, target: string): void {
    if (this.resolver.isNonPortable(content)) {
      const lines = content.split('\n');
      let offendingLine: { line: number; text: string } | undefined;
      for (let i = 0; i < lines.length; i++) {
        if (this.resolver.isNonPortable(lines[i])) {
          offendingLine = { line: i + 1, text: lines[i].trim().slice(0, 200) };
          break;
        }
      }
      const where = offendingLine ? ` at line ${offendingLine.line}: "${offendingLine.text}"` : '';
      throw new PortabilityError(
        `Refusing to write ${target}: content contains a non-portable absolute path${where}. ` +
          'Committed framework artifacts must contain only project-relative paths, /tmp/, or URLs.',
        target,
        { file: target, line: offendingLine?.line },
      );
    }
  }
}
