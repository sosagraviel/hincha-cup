import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import matter from 'gray-matter';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('gray-matter', () => ({
  default: vi.fn(),
}));

import {
  loadLlmWikiSummaries,
  loadLlmWikiContextTiered,
} from '../../../../src/services/implement-ticket/graph-context.service.js';

const BASE_PATH = '/test/project';
const WIKI_DIR = `${BASE_PATH}/docs/llm-wiki/wiki`;

describe('loadLlmWikiSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns expected shape for 5 core docs plus 2 service docs', () => {
    const coreFiles = [
      'index.md',
      'ARCHITECTURE.md',
      'SERVICES.md',
      'DATA-FLOWS.md',
      'PATTERNS.md',
    ];
    const serviceFiles = [
      { name: 'auth.md', isFile: () => true, isDirectory: () => false },
      { name: 'users.md', isFile: () => true, isDirectory: () => false },
    ];

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path === `${WIKI_DIR}/services`) return true;
      return coreFiles.some((f) => path.endsWith(f));
    });

    vi.mocked(fs.readdirSync).mockReturnValue(
      serviceFiles as unknown as ReturnType<typeof fs.readdirSync>,
    );

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const fileName = String(p).split('/').pop() ?? '';
      return `---\nsummary: Summary for ${fileName}\nconfidence: high\n---\nBody for ${fileName}`;
    });

    vi.mocked(matter).mockImplementation((raw) => {
      const rawStr = String(raw);
      const fileName = rawStr.match(/Summary for ([^\n]+)/)?.[1] ?? 'unknown';
      return {
        data: { summary: `Summary for ${fileName}`, confidence: 'high' },
        content: `Body for ${fileName}`,
        orig: rawStr,
        language: 'yaml',
        matter: '',
        stringify: () => rawStr,
      } as unknown as ReturnType<typeof matter>;
    });

    const summaries = loadLlmWikiSummaries(BASE_PATH);

    expect(summaries).toHaveLength(7);
    expect(summaries[0].relPath).toBe('index.md');
    expect(summaries[0].confidence).toBe('high');
    expect(summaries[0].absPath).toContain('index.md');
    expect(summaries[5].relPath).toBe('services/auth.md');
    expect(summaries[6].relPath).toBe('services/users.md');
  });

  it('returns empty array when wiki directory files are missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const summaries = loadLlmWikiSummaries(BASE_PATH);

    expect(summaries).toHaveLength(0);
  });

  it('falls back to first body line when frontmatter summary is absent', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('ARCHITECTURE.md'));
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    const rawContent = '---\nconfidence: high\n---\nFirst paragraph line here.';
    vi.mocked(fs.readFileSync).mockReturnValue(rawContent);
    vi.mocked(matter).mockReturnValue({
      data: { confidence: 'high' },
      content: '\nFirst paragraph line here.',
      orig: rawContent,
      language: 'yaml',
      matter: '',
      stringify: () => rawContent,
    } as unknown as ReturnType<typeof matter>);

    const summaries = loadLlmWikiSummaries(BASE_PATH);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].summary).toBe('First paragraph line here.');
  });

  it('defaults confidence to medium when frontmatter confidence is absent', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('ARCHITECTURE.md'));
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    const rawContent = '---\nsummary: A summary.\n---\nBody.';
    vi.mocked(fs.readFileSync).mockReturnValue(rawContent);
    vi.mocked(matter).mockReturnValue({
      data: { summary: 'A summary.' },
      content: '\nBody.',
      orig: rawContent,
      language: 'yaml',
      matter: '',
      stringify: () => rawContent,
    } as unknown as ReturnType<typeof matter>);

    const summaries = loadLlmWikiSummaries(BASE_PATH);

    expect(summaries[0].confidence).toBe('medium');
  });
});

describe('loadLlmWikiContextTiered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces only summary index with no body sections when summariesOnly is true', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('ARCHITECTURE.md'));
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    const rawContent = '---\nsummary: Arch summary.\nconfidence: high\n---\nArch body content.';
    vi.mocked(fs.readFileSync).mockReturnValue(rawContent);
    vi.mocked(matter).mockReturnValue({
      data: { summary: 'Arch summary.', confidence: 'high' },
      content: '\nArch body content.',
      orig: rawContent,
      language: 'yaml',
      matter: '',
      stringify: () => rawContent,
    } as unknown as ReturnType<typeof matter>);

    const result = loadLlmWikiContextTiered(BASE_PATH, { summariesOnly: true });

    expect(result).toContain('# LLM Wiki Context');
    expect(result).toContain('## Summary index');
    expect(result).toContain('ARCHITECTURE.md (confidence: high) — Arch summary.');
    expect(result).not.toContain('## ARCHITECTURE\n\nArch body content.');
    expect(result).not.toContain('## ARCHITECTURE\n\nSee summary above.');
  });

  it('includes full body only for expandPaths entries, summary-only for others', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.endsWith('ARCHITECTURE.md') || path.endsWith('SERVICES.md');
    });
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('ARCHITECTURE.md')) {
        return '---\nsummary: Arch summary.\nconfidence: high\n---\nArch body content.';
      }
      return '---\nsummary: Services summary.\nconfidence: medium\n---\nServices body content.';
    });

    vi.mocked(matter).mockImplementation((raw) => {
      const rawStr = String(raw);
      if (rawStr.includes('Arch')) {
        return {
          data: { summary: 'Arch summary.', confidence: 'high' },
          content: '\nArch body content.',
          orig: rawStr,
          language: 'yaml',
          matter: '',
          stringify: () => rawStr,
        } as unknown as ReturnType<typeof matter>;
      }
      return {
        data: { summary: 'Services summary.', confidence: 'medium' },
        content: '\nServices body content.',
        orig: rawStr,
        language: 'yaml',
        matter: '',
        stringify: () => rawStr,
      } as unknown as ReturnType<typeof matter>;
    });

    const result = loadLlmWikiContextTiered(BASE_PATH, { expandPaths: ['ARCHITECTURE.md'] });

    expect(result).toContain('Arch body content.');
    expect(result).toContain('## SERVICES\n\nSee summary above.');
    expect(result).not.toContain('Services body content.');
  });

  it('recognizes service-relative paths in expandPaths', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith('/services')) return true;
      return false;
    });

    const serviceEntry = { name: 'auth.md', isFile: () => true, isDirectory: () => false };
    vi.mocked(fs.readdirSync).mockReturnValue([serviceEntry] as unknown as ReturnType<
      typeof fs.readdirSync
    >);

    const rawContent = '---\nsummary: Auth service.\nconfidence: high\n---\nAuth body.';
    vi.mocked(fs.readFileSync).mockReturnValue(rawContent);
    vi.mocked(matter).mockReturnValue({
      data: { summary: 'Auth service.', confidence: 'high' },
      content: '\nAuth body.',
      orig: rawContent,
      language: 'yaml',
      matter: '',
      stringify: () => rawContent,
    } as unknown as ReturnType<typeof matter>);

    const result = loadLlmWikiContextTiered(BASE_PATH, { expandPaths: ['services/auth.md'] });

    expect(result).toContain('services/auth.md');
    expect(result).toContain('Auth body.');
  });

  it('truncates body to maxCharsPerDocument', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('ARCHITECTURE.md'));
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    const longBody = 'A'.repeat(300);
    const rawContent = `---\nsummary: Arch.\nconfidence: high\n---\n${longBody}`;
    vi.mocked(fs.readFileSync).mockReturnValue(rawContent);
    vi.mocked(matter).mockReturnValue({
      data: { summary: 'Arch.', confidence: 'high' },
      content: `\n${longBody}`,
      orig: rawContent,
      language: 'yaml',
      matter: '',
      stringify: () => rawContent,
    } as unknown as ReturnType<typeof matter>);

    const result = loadLlmWikiContextTiered(BASE_PATH, {
      expandPaths: ['ARCHITECTURE.md'],
      maxCharsPerDocument: 100,
    });

    expect(result).toContain('[Truncated to 100 characters for prompt budget]');
    expect(result).not.toContain('A'.repeat(200));
  });

  it('returns empty string when no wiki files exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = loadLlmWikiContextTiered(BASE_PATH, { summariesOnly: true });

    expect(result).toBe('');
  });
});
