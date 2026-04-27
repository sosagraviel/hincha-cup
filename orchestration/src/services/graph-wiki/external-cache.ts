import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import matter from 'gray-matter';
import { z } from 'zod';

export const ExternalSourceTypeSchema = z.enum(['jira', 'notion', 'confluence', 'github', 'other']);
export type ExternalSourceType = z.infer<typeof ExternalSourceTypeSchema>;

export const ExternalCacheEntrySchema = z.object({
  source_url: z.string().url().or(z.string().min(1)),
  source_type: ExternalSourceTypeSchema,
  source_id: z.string().min(1),
  ticket_id: z.string().optional(),
  title: z.string().optional(),
  fetched_at: z.string().datetime().or(z.string()),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ExternalCacheEntry = z.infer<typeof ExternalCacheEntrySchema>;

export interface WriteExternalCacheInput {
  projectPath: string;
  sourceType: ExternalSourceType;
  sourceId: string;
  sourceUrl: string;
  ticketId?: string;
  title?: string;
  /** The markdown/text content fetched from the source. */
  body: string;
}

export interface WriteExternalCacheResult {
  /** Absolute path of the written cache file. */
  absPath: string;
  /** Path relative to project root, useful for sources[] frontmatter. */
  relPath: string;
  /** SHA-256 of the body. */
  sha256: string;
  /** Whether the file was newly written or already existed with the same hash. */
  cacheHit: boolean;
}

export interface ReadExternalCacheInput {
  projectPath: string;
  sourceType: ExternalSourceType;
  sourceId: string;
  /** Maximum age in milliseconds before the cache is considered stale. Default: 7 days. */
  maxAgeMs?: number;
}

export interface ReadExternalCacheResult {
  body: string;
  entry: ExternalCacheEntry;
  absPath: string;
  relPath: string;
}

const DEFAULT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const SAFE_SOURCEID_RE = /[^a-zA-Z0-9._-]/g;
const EXTERNAL_RAW_SUBDIR = join('docs', 'llm-wiki', 'raw', 'external');

/** Sanitize a sourceId so it is safe to use as a filesystem filename component. */
function sanitizeSourceId(sourceId: string): string {
  return sourceId.replace(SAFE_SOURCEID_RE, '_');
}

/**
 * Compute the absolute cache file path for a given source.
 * Useful for tests and manifest integration.
 */
export function externalCachePath(
  projectPath: string,
  sourceType: ExternalSourceType,
  sourceId: string,
): string {
  return join(projectPath, EXTERNAL_RAW_SUBDIR, sourceType, `${sanitizeSourceId(sourceId)}.md`);
}

/**
 * Write an external doc to docs/llm-wiki/raw/external/<sourceType>/<sourceId>.md
 * with frontmatter carrying source_url, ticket_id, sha256, and fetched_at.
 *
 * Idempotent: if the file already exists with the same body sha256, returns
 * cacheHit: true without rewriting. If the sha256 differs, the file is overwritten.
 */
export function writeExternalCache(input: WriteExternalCacheInput): WriteExternalCacheResult {
  const { projectPath, sourceType, sourceId, sourceUrl, ticketId, title, body } = input;
  const sha256 = createHash('sha256').update(body).digest('hex');
  const absPath = externalCachePath(projectPath, sourceType, sourceId);
  const relPath = join(EXTERNAL_RAW_SUBDIR, sourceType, `${sanitizeSourceId(sourceId)}.md`);

  if (existsSync(absPath)) {
    const existing = readFileSync(absPath, 'utf-8');
    const parsed = matter(existing);
    const existingEntry = ExternalCacheEntrySchema.safeParse(parsed.data);
    if (existingEntry.success && existingEntry.data.sha256 === sha256) {
      return { absPath, relPath, sha256, cacheHit: true };
    }
  }

  const frontmatter: Record<string, unknown> = {
    source_url: sourceUrl,
    source_type: sourceType,
    source_id: sourceId,
    fetched_at: new Date().toISOString(),
    sha256,
  };
  if (ticketId !== undefined) {
    frontmatter['ticket_id'] = ticketId;
  }
  if (title !== undefined) {
    frontmatter['title'] = title;
  }

  const heading = title ?? sourceId;
  const bodyWithHeading = `# ${heading}\n\n${body}`;
  const content = matter.stringify(bodyWithHeading, frontmatter);

  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf-8');

  return { absPath, relPath, sha256, cacheHit: false };
}

/**
 * Read an external doc cache entry. Returns null when the file is missing or
 * stale (older than maxAgeMs).
 */
export function readExternalCache(input: ReadExternalCacheInput): ReadExternalCacheResult | null {
  const { projectPath, sourceType, sourceId, maxAgeMs = DEFAULT_MAX_AGE_MS } = input;
  const absPath = externalCachePath(projectPath, sourceType, sourceId);
  const relPath = join(EXTERNAL_RAW_SUBDIR, sourceType, `${sanitizeSourceId(sourceId)}.md`);

  if (!existsSync(absPath)) {
    return null;
  }

  const raw = readFileSync(absPath, 'utf-8');
  const parsed = matter(raw);
  const entryResult = ExternalCacheEntrySchema.safeParse(parsed.data);
  if (!entryResult.success) {
    return null;
  }

  const entry = entryResult.data;
  const fetchedAt = Date.parse(entry.fetched_at);
  if (isNaN(fetchedAt) || Date.now() - fetchedAt > maxAgeMs) {
    return null;
  }

  return { body: parsed.content.trim(), entry, absPath, relPath };
}
