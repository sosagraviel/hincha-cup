import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import matter from 'gray-matter';
import {
  ExternalCacheEntrySchema,
  externalCachePath,
  readExternalCache,
  writeExternalCache,
} from '../../../../src/services/graph-wiki/external-cache.js';

function buildProjectPath(): string {
  return mkdtempSync(join(tmpdir(), 'external-cache-test-'));
}

describe('externalCachePath', () => {
  it('places file under docs/llm-wiki/raw/external/<type>/<id>.md', () => {
    const projectPath = '/tmp/myproject';
    const result = externalCachePath(projectPath, 'jira', 'PROJ-123');
    expect(result).toContain('docs/llm-wiki/raw/external/jira/PROJ-123.md');
  });

  it('sanitizes sourceId chars outside [a-zA-Z0-9._-]', () => {
    const projectPath = '/tmp/myproject';
    const result = externalCachePath(projectPath, 'notion', 'page uuid/with spaces');
    expect(result).toContain('page_uuid_with_spaces.md');
    expect(result).not.toContain(' ');
    const filename = result.split('/').pop();
    expect(filename).toBe('page_uuid_with_spaces.md');
  });
});

describe('writeExternalCache', () => {
  it('writes the file at the expected path with frontmatter', () => {
    const projectPath = buildProjectPath();
    const result = writeExternalCache({
      projectPath,
      sourceType: 'jira',
      sourceId: 'PROJ-123',
      sourceUrl: 'https://example.atlassian.net/browse/PROJ-123',
      ticketId: 'PROJ-123',
      title: 'Add user search',
      body: 'This is the ticket body.',
    });

    expect(result.cacheHit).toBe(false);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

    const content = readFileSync(result.absPath, 'utf-8');
    const parsed = matter(content);
    expect(parsed.data['source_type']).toBe('jira');
    expect(parsed.data['source_id']).toBe('PROJ-123');
    expect(parsed.data['source_url']).toBe('https://example.atlassian.net/browse/PROJ-123');
    expect(parsed.data['ticket_id']).toBe('PROJ-123');
    expect(parsed.data['title']).toBe('Add user search');
    expect(parsed.data['sha256']).toBe(result.sha256);
    expect(typeof parsed.data['fetched_at']).toBe('string');
  });

  it('includes the body content after the frontmatter', () => {
    const projectPath = buildProjectPath();
    const result = writeExternalCache({
      projectPath,
      sourceType: 'notion',
      sourceId: 'notion-page-123',
      sourceUrl: 'https://notion.so/notion-page-123',
      body: 'Notion page content here.',
    });

    const content = readFileSync(result.absPath, 'utf-8');
    expect(content).toContain('Notion page content here.');
  });

  it('returns cacheHit: true when body sha256 is unchanged', () => {
    const projectPath = buildProjectPath();
    const input = {
      projectPath,
      sourceType: 'confluence' as const,
      sourceId: 'CONF-456',
      sourceUrl: 'https://example.atlassian.net/wiki/pages/456',
      body: 'Confluence page body.',
    };

    const first = writeExternalCache(input);
    const second = writeExternalCache(input);

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.sha256).toBe(first.sha256);
  });

  it('overwrites the file when body sha256 changes', () => {
    const projectPath = buildProjectPath();
    const base = {
      projectPath,
      sourceType: 'github' as const,
      sourceId: 'owner-repo-issue-1',
      sourceUrl: 'https://github.com/owner/repo/issues/1',
    };

    const first = writeExternalCache({ ...base, body: 'Original content.' });
    const second = writeExternalCache({ ...base, body: 'Updated content.' });

    expect(second.cacheHit).toBe(false);
    expect(second.sha256).not.toBe(first.sha256);

    const content = readFileSync(second.absPath, 'utf-8');
    expect(content).toContain('Updated content.');
  });

  it('sanitizes weird sourceId characters in the file path', () => {
    const projectPath = buildProjectPath();
    const result = writeExternalCache({
      projectPath,
      sourceType: 'other',
      sourceId: 'page/with spaces&special!chars',
      sourceUrl: 'https://example.com/page',
      body: 'Content.',
    });

    expect(result.absPath).not.toContain(' ');
    expect(result.absPath).not.toContain('&');
    expect(result.absPath).not.toContain('!');
  });

  it('relPath is relative to project root', () => {
    const projectPath = buildProjectPath();
    const result = writeExternalCache({
      projectPath,
      sourceType: 'jira',
      sourceId: 'PROJ-999',
      sourceUrl: 'https://example.atlassian.net/browse/PROJ-999',
      body: 'Body text.',
    });

    expect(result.relPath).toMatch(/^docs[\\/]llm-wiki[\\/]raw[\\/]external[\\/]jira[\\/]/);
    expect(result.absPath).toContain(projectPath);
    expect(result.absPath).toContain(result.relPath.replace(/\\/g, '/').split('/').join('/'));
  });

  it('writes without optional ticket_id and title', () => {
    const projectPath = buildProjectPath();
    const result = writeExternalCache({
      projectPath,
      sourceType: 'notion',
      sourceId: 'anon-page',
      sourceUrl: 'https://notion.so/anon-page',
      body: 'Minimal content.',
    });

    const content = readFileSync(result.absPath, 'utf-8');
    const parsed = matter(content);
    expect(parsed.data['ticket_id']).toBeUndefined();
    expect(parsed.data['title']).toBeUndefined();
  });
});

describe('readExternalCache', () => {
  it('returns null when the file does not exist', () => {
    const projectPath = buildProjectPath();
    const result = readExternalCache({ projectPath, sourceType: 'jira', sourceId: 'MISSING-000' });
    expect(result).toBeNull();
  });

  it('returns the body when the entry is fresh', () => {
    const projectPath = buildProjectPath();
    writeExternalCache({
      projectPath,
      sourceType: 'jira',
      sourceId: 'PROJ-100',
      sourceUrl: 'https://example.atlassian.net/browse/PROJ-100',
      body: 'Fresh content.',
    });

    const result = readExternalCache({ projectPath, sourceType: 'jira', sourceId: 'PROJ-100' });
    expect(result).not.toBeNull();
    expect(result!.body).toContain('Fresh content.');
  });

  it('returns null when the entry is stale (fetched_at older than maxAgeMs)', () => {
    const projectPath = buildProjectPath();
    const absPath = externalCachePath(projectPath, 'jira', 'STALE-001');
    const staleFetchedAt = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    const sha256 = 'a'.repeat(64);

    mkdirSync(require('path').dirname(absPath), { recursive: true });
    const content = matter.stringify('# STALE-001\n\nStale body.', {
      source_url: 'https://example.atlassian.net/browse/STALE-001',
      source_type: 'jira',
      source_id: 'STALE-001',
      fetched_at: staleFetchedAt,
      sha256,
    });
    writeFileSync(absPath, content, 'utf-8');

    const result = readExternalCache({
      projectPath,
      sourceType: 'jira',
      sourceId: 'STALE-001',
      maxAgeMs: 7 * 24 * 3600 * 1000,
    });
    expect(result).toBeNull();
  });

  it('respects a custom maxAgeMs and returns the entry when within threshold', () => {
    const projectPath = buildProjectPath();
    writeExternalCache({
      projectPath,
      sourceType: 'confluence',
      sourceId: 'CONF-FRESH',
      sourceUrl: 'https://example.atlassian.net/wiki/CONF-FRESH',
      body: 'Recent content.',
    });

    const shortMaxAge = 1 * 24 * 3600 * 1000;
    const result = readExternalCache({
      projectPath,
      sourceType: 'confluence',
      sourceId: 'CONF-FRESH',
      maxAgeMs: shortMaxAge,
    });
    expect(result).not.toBeNull();
  });

  it('returns the parsed ExternalCacheEntry in the result', () => {
    const projectPath = buildProjectPath();
    writeExternalCache({
      projectPath,
      sourceType: 'notion',
      sourceId: 'NOTION-123',
      sourceUrl: 'https://notion.so/NOTION-123',
      ticketId: 'PROJ-55',
      title: 'Design Doc',
      body: 'Design content.',
    });

    const result = readExternalCache({
      projectPath,
      sourceType: 'notion',
      sourceId: 'NOTION-123',
    });

    expect(result).not.toBeNull();
    expect(result!.entry.source_type).toBe('notion');
    expect(result!.entry.source_id).toBe('NOTION-123');
    expect(result!.entry.ticket_id).toBe('PROJ-55');
    expect(result!.entry.title).toBe('Design Doc');
    expect(result!.entry.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('ExternalCacheEntrySchema', () => {
  it('rejects entries with a malformed sha256 (wrong length)', () => {
    const result = ExternalCacheEntrySchema.safeParse({
      source_url: 'https://example.com',
      source_type: 'jira',
      source_id: 'PROJ-1',
      fetched_at: new Date().toISOString(),
      sha256: 'tooshort',
    });
    expect(result.success).toBe(false);
  });

  it('rejects entries with an unknown source_type', () => {
    const result = ExternalCacheEntrySchema.safeParse({
      source_url: 'https://example.com',
      source_type: 'slack',
      source_id: 'msg-123',
      fetched_at: new Date().toISOString(),
      sha256: 'a'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal valid entry without optional fields', () => {
    const result = ExternalCacheEntrySchema.safeParse({
      source_url: 'https://example.com',
      source_type: 'other',
      source_id: 'some-id',
      fetched_at: new Date().toISOString(),
      sha256: 'b'.repeat(64),
    });
    expect(result.success).toBe(true);
  });

  it('accepts all five source types', () => {
    const types = ['jira', 'notion', 'confluence', 'github', 'other'] as const;
    for (const source_type of types) {
      const result = ExternalCacheEntrySchema.safeParse({
        source_url: 'https://example.com',
        source_type,
        source_id: 'id-1',
        fetched_at: new Date().toISOString(),
        sha256: 'c'.repeat(64),
      });
      expect(result.success).toBe(true);
    }
  });
});
