import { describe, expect, it } from 'vitest';
import { parseIgnoreFlag } from '../../../src/cli/parse-ignore-flag.js';

describe('parseIgnoreFlag', () => {
  it('returns [] when flag is absent (undefined)', () => {
    expect(parseIgnoreFlag(undefined)).toEqual({ paths: [] });
  });

  it('returns [] when flag is null', () => {
    expect(parseIgnoreFlag(null)).toEqual({ paths: [] });
  });

  it('accepts a single string value', () => {
    expect(parseIgnoreFlag('test/integration')).toEqual({ paths: ['test/integration'] });
  });

  it('accepts a repeatable form (commander variadic)', () => {
    expect(parseIgnoreFlag(['test/integration', 'website/build'])).toEqual({
      paths: ['test/integration', 'website/build'],
    });
  });

  it('accepts a CSV form (single value with commas)', () => {
    expect(parseIgnoreFlag('test/integration,website/build,docs/legacy')).toEqual({
      paths: ['test/integration', 'website/build', 'docs/legacy'],
    });
  });

  it('accepts repeatable + CSV in the same invocation', () => {
    expect(parseIgnoreFlag(['a,b', 'c', 'd,e'])).toEqual({
      paths: ['a', 'b', 'c', 'd', 'e'],
    });
  });

  it('trims whitespace inside CSV tokens', () => {
    expect(parseIgnoreFlag('foo , bar ,  baz')).toEqual({ paths: ['foo', 'bar', 'baz'] });
  });

  it('drops empty CSV tokens', () => {
    expect(parseIgnoreFlag('foo,,bar,')).toEqual({ paths: ['foo', 'bar'] });
  });

  it('strips leading and trailing slashes', () => {
    expect(parseIgnoreFlag('/test/integration/')).toEqual({ paths: ['test/integration'] });
  });

  it('deduplicates identical entries', () => {
    expect(parseIgnoreFlag('foo,foo,bar,foo')).toEqual({ paths: ['foo', 'bar'] });
  });

  it('treats a leading slash as a project-root anchor (gitignore semantics)', () => {
    // Mirrors `.gitignore` where `/foo` means "anchored to repo root", not
    // "system absolute". The leading slash is stripped; the path remains
    // project-relative.
    expect(parseIgnoreFlag('/etc/secrets')).toEqual({ paths: ['etc/secrets'] });
  });

  it('rejects Windows drive-letter absolutes', () => {
    const result = parseIgnoreFlag('C:\\Users\\me\\secrets');
    expect(result.paths).toEqual([]);
    expect(result.error).toMatch(/absolute paths are not allowed/);
  });

  it('rejects parent-directory traversal', () => {
    const result = parseIgnoreFlag('../escape');
    expect(result.paths).toEqual([]);
    expect(result.error).toMatch(/parent-directory traversal/);
  });

  it('rejects parent-directory traversal embedded in a path', () => {
    const result = parseIgnoreFlag('foo/../bar');
    expect(result.paths).toEqual([]);
    expect(result.error).toMatch(/parent-directory traversal/);
  });

  it('rejects glob characters', () => {
    expect(parseIgnoreFlag('foo/*.tmp').error).toMatch(/glob characters/);
    expect(parseIgnoreFlag('foo/?').error).toMatch(/glob characters/);
    expect(parseIgnoreFlag('foo/[abc]').error).toMatch(/glob characters/);
  });

  it('returns the first error from a mixed list (one bad entry fails the whole parse)', () => {
    const result = parseIgnoreFlag(['good/path', 'foo/../bar', 'also/good']);
    expect(result.paths).toEqual([]);
    expect(result.error).toMatch(/parent-directory traversal/);
  });

  it('drops non-string array entries silently', () => {
    expect(parseIgnoreFlag(['foo', 42, 'bar'])).toEqual({ paths: ['foo', 'bar'] });
  });
});
