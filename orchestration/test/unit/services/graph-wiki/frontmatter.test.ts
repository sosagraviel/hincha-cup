import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import {
  buildContextSection,
  buildGraphDisciplineSection,
  upsertFencedSection,
  upsertLlmWikiContextSection,
  withFrontmatter,
} from '../../../../src/services/graph-wiki/frontmatter.js';
import {
  GRAPH_DISCIPLINE_CONTEXT_END,
  GRAPH_DISCIPLINE_CONTEXT_START,
  LLM_WIKI_CONTEXT_END,
  LLM_WIKI_CONTEXT_START,
} from '../../../../src/services/graph-wiki/types.js';

const BASE_FRONTMATTER = {
  document_type: 'architecture' as const,
  summary: 'Overview of the architecture.',
  confidence: 'high' as const,
  generated_at: '2026-04-24T00:00:00.000Z',
  generated_by: 'ai-agentic-framework',
  graph_version: 'a'.repeat(64),
  graph_commit: 'b'.repeat(40),
  graph_queries_used: ['mcp__code_graph__get_architecture_overview'],
  sources: [
    {
      path: 'README.md',
      sha256: 'c'.repeat(64),
      ingested_at: '2026-04-24T00:00:00.000Z',
      commit: 'd'.repeat(40),
    },
  ],
  related: ['wiki/SERVICES.md'],
  last_verified: '2026-04-24T00:00:00.000Z',
};

describe('withFrontmatter', () => {
  it('produces parseable YAML frontmatter', () => {
    const output = withFrontmatter('# Body', BASE_FRONTMATTER);
    expect(() => matter(output)).not.toThrow();
  });

  it('frontmatter keys follow stable order: document_type first, then core fields', () => {
    const output = withFrontmatter('# Body', BASE_FRONTMATTER);
    const parsed = matter(output);

    const keys = Object.keys(parsed.data);
    const documentTypeIdx = keys.indexOf('document_type');
    const summaryIdx = keys.indexOf('summary');
    const confidenceIdx = keys.indexOf('confidence');
    const generatedAtIdx = keys.indexOf('generated_at');
    const generatedByIdx = keys.indexOf('generated_by');
    const graphVersionIdx = keys.indexOf('graph_version');
    const graphCommitIdx = keys.indexOf('graph_commit');
    const graphQueriesIdx = keys.indexOf('graph_queries_used');
    const sourcesIdx = keys.indexOf('sources');
    const relatedIdx = keys.indexOf('related');
    const lastVerifiedIdx = keys.indexOf('last_verified');

    expect(documentTypeIdx).toBeLessThan(summaryIdx);
    expect(summaryIdx).toBeLessThan(confidenceIdx);
    expect(confidenceIdx).toBeLessThan(generatedAtIdx);
    expect(generatedAtIdx).toBeLessThan(generatedByIdx);
    expect(generatedByIdx).toBeLessThan(graphVersionIdx);
    expect(graphVersionIdx).toBeLessThan(graphCommitIdx);
    expect(graphCommitIdx).toBeLessThan(graphQueriesIdx);
    expect(graphQueriesIdx).toBeLessThan(sourcesIdx);
    expect(sourcesIdx).toBeLessThan(relatedIdx);
    expect(relatedIdx).toBeLessThan(lastVerifiedIdx);
  });

  it('all new required frontmatter keys are present', () => {
    const output = withFrontmatter('# Body', BASE_FRONTMATTER);
    const parsed = matter(output);

    expect(parsed.data).toHaveProperty('document_type');
    expect(parsed.data).toHaveProperty('summary');
    expect(parsed.data).toHaveProperty('confidence');
    expect(parsed.data).toHaveProperty('generated_at');
    expect(parsed.data).toHaveProperty('generated_by');
    expect(parsed.data).toHaveProperty('graph_version');
    expect(parsed.data).toHaveProperty('graph_commit');
    expect(parsed.data).toHaveProperty('graph_queries_used');
    expect(parsed.data).toHaveProperty('sources');
    expect(parsed.data).toHaveProperty('related');
    expect(parsed.data).toHaveProperty('last_verified');
  });

  it('service_* extras appear after last_verified when provided', () => {
    const withServiceExtras = {
      ...BASE_FRONTMATTER,
      service_id: 'auth',
      entry_points: ['src/auth/index.ts'],
    };
    const output = withFrontmatter('# Body', withServiceExtras);
    const parsed = matter(output);
    const keys = Object.keys(parsed.data);

    const lastVerifiedIdx = keys.indexOf('last_verified');
    const serviceIdIdx = keys.indexOf('service_id');
    const entryPointsIdx = keys.indexOf('entry_points');

    expect(serviceIdIdx).toBeGreaterThan(lastVerifiedIdx);
    expect(entryPointsIdx).toBeGreaterThan(lastVerifiedIdx);
  });

  it('preserves body content after the frontmatter block', () => {
    const body = '# Architecture\n\nThis is the architecture document.';
    const output = withFrontmatter(body, BASE_FRONTMATTER);
    const parsed = matter(output);

    expect(parsed.content.trim()).toContain('# Architecture');
    expect(parsed.content).toContain('This is the architecture document.');
  });

  it('summary field is present and non-empty', () => {
    const output = withFrontmatter('# Body', BASE_FRONTMATTER);
    const parsed = matter(output);

    expect(typeof parsed.data.summary).toBe('string');
    expect(parsed.data.summary.length).toBeGreaterThan(0);
  });

  it('graph_commit field is present', () => {
    const output = withFrontmatter('# Body', BASE_FRONTMATTER);
    const parsed = matter(output);

    expect(parsed.data.graph_commit).toBe('b'.repeat(40));
  });
});

describe('buildContextSection', () => {
  const graph = {
    available: true,
    path: '/some/project/.code-review-graph/graph.db',
  };

  it('names the wiki router (CLAUDE.md) for the Claude provider', () => {
    const section = buildContextSection(graph, 'CLAUDE.md');
    expect(section).toContain('docs/llm-wiki/CLAUDE.md');
    expect(section).toContain('Router (entry point)');
    expect(section).toContain('Read this first');
  });

  it('names the wiki router (AGENTS.md) for the Codex provider', () => {
    const section = buildContextSection(graph, 'AGENTS.md');
    expect(section).toContain('docs/llm-wiki/AGENTS.md');
    expect(section).not.toContain('docs/llm-wiki/CLAUDE.md');
  });

  it('still references the index summary catalog as Tier 1', () => {
    const section = buildContextSection(graph, 'CLAUDE.md');
    expect(section).toContain('docs/llm-wiki/wiki/index.md');
    expect(section).toContain('Index (summary catalog)');
  });

  it('opens with LLM_WIKI_CONTEXT_START and closes with LLM_WIKI_CONTEXT_END', () => {
    const section = buildContextSection(graph, 'CLAUDE.md');
    expect(section.startsWith(LLM_WIKI_CONTEXT_START)).toBe(true);
    expect(section.endsWith(LLM_WIKI_CONTEXT_END)).toBe(true);
  });

  it('describes the load-router-then-index-then-pages workflow', () => {
    const section = buildContextSection(graph, 'CLAUDE.md');
    expect(section).toMatch(/load the router.*match the index.*read only the matched pages/i);
  });
});

describe('upsertLlmWikiContextSection', () => {
  const section = [
    LLM_WIKI_CONTEXT_START,
    '## LLM Wiki',
    '- Wiki: `docs/llm-wiki/wiki/index.md`',
    LLM_WIKI_CONTEXT_END,
  ].join('\n');

  it('appends the section when no prior section exists', () => {
    const result = upsertLlmWikiContextSection('# Existing Content', section);

    expect(result).toContain('# Existing Content');
    expect(result).toContain(LLM_WIKI_CONTEXT_START);
    expect(result).toContain('## LLM Wiki');
    expect(result).toContain(LLM_WIKI_CONTEXT_END);
  });

  it('replaces prior section instead of duplicating', () => {
    const existing = [
      '# Doc',
      LLM_WIKI_CONTEXT_START,
      '## LLM Wiki',
      '- Old content',
      LLM_WIKI_CONTEXT_END,
    ].join('\n');

    const newSection = [
      LLM_WIKI_CONTEXT_START,
      '## LLM Wiki',
      '- Updated content',
      LLM_WIKI_CONTEXT_END,
    ].join('\n');

    const result = upsertLlmWikiContextSection(existing, newSection);

    const occurrences = (result.match(new RegExp(LLM_WIKI_CONTEXT_START, 'g')) ?? []).length;
    expect(occurrences).toBe(1);
    expect(result).toContain('Updated content');
    expect(result).not.toContain('Old content');
  });

  it('result ends with a newline', () => {
    const result = upsertLlmWikiContextSection('# Doc', section);
    expect(result.endsWith('\n')).toBe(true);
  });
});

describe('buildGraphDisciplineSection', () => {
  const section = buildGraphDisciplineSection();

  it('opens with GRAPH_DISCIPLINE_CONTEXT_START and closes with the matching end', () => {
    expect(section.startsWith(GRAPH_DISCIPLINE_CONTEXT_START)).toBe(true);
    expect(section.endsWith(GRAPH_DISCIPLINE_CONTEXT_END)).toBe(true);
  });

  it('renders the heading + a short pointer to the wiki router', () => {
    // Plan §E.1: as of 2026-05-05 this is a pointer, not the full body.
    // The full discipline lives in the wiki router; bringing it into
    // CLAUDE.md too duplicated content and bloated the schema doc past
    // the soft 150-line cap.
    expect(section).toContain('## Graph navigation discipline');
    expect(section).toMatch(/wiki router/i);
    expect(section).toContain('docs/llm-wiki/CLAUDE.md');
  });

  it('is short — 12 lines or fewer (anti-regression on size bloat)', () => {
    // The prior behaviour shipped a ~44-line body. The trimmed pointer
    // should be ≤ 12 lines. A future edit that drops back to the full
    // body fails this test; the body belongs in the wiki router only.
    const lineCount = section.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(12);
  });

  it('does NOT inline the lean-defaults table here (lives in the wiki router)', () => {
    // Anti-regression: these tokens are CANONICAL content in the router
    // and the analyzer prompts. Inlining them here would re-duplicate.
    expect(section).not.toContain('detail_level: "minimal"');
    expect(section).not.toContain('include_members: false');
    expect(section).not.toContain('exceeds maximum allowed tokens');
  });
});

describe('upsertFencedSection', () => {
  it('appends a new fenced block when no prior block exists', () => {
    const out = upsertFencedSection(
      '# Doc body',
      `${GRAPH_DISCIPLINE_CONTEXT_START}\n## Graph nav\n- new\n${GRAPH_DISCIPLINE_CONTEXT_END}`,
      GRAPH_DISCIPLINE_CONTEXT_START,
      GRAPH_DISCIPLINE_CONTEXT_END,
    );
    expect(out).toContain('## Graph nav');
    expect(out).toContain(GRAPH_DISCIPLINE_CONTEXT_START);
    expect(out).toContain(GRAPH_DISCIPLINE_CONTEXT_END);
  });

  it('replaces an existing fenced block in place — no duplication on rerun', () => {
    const initial = upsertFencedSection(
      '# Doc body',
      `${GRAPH_DISCIPLINE_CONTEXT_START}\nold\n${GRAPH_DISCIPLINE_CONTEXT_END}`,
      GRAPH_DISCIPLINE_CONTEXT_START,
      GRAPH_DISCIPLINE_CONTEXT_END,
    );
    const updated = upsertFencedSection(
      initial,
      `${GRAPH_DISCIPLINE_CONTEXT_START}\nnew\n${GRAPH_DISCIPLINE_CONTEXT_END}`,
      GRAPH_DISCIPLINE_CONTEXT_START,
      GRAPH_DISCIPLINE_CONTEXT_END,
    );
    expect(updated).toContain('new');
    expect(updated).not.toContain('old');
    const occurrences = (updated.match(new RegExp(GRAPH_DISCIPLINE_CONTEXT_START, 'g')) ?? [])
      .length;
    expect(occurrences).toBe(1);
  });

  it('handles both LLM Wiki and Graph Discipline sections in the same file', () => {
    const wikiSection = `${LLM_WIKI_CONTEXT_START}\nwiki body\n${LLM_WIKI_CONTEXT_END}`;
    const disciplineSection = `${GRAPH_DISCIPLINE_CONTEXT_START}\ndiscipline body\n${GRAPH_DISCIPLINE_CONTEXT_END}`;
    let out = upsertFencedSection(
      '# Doc',
      wikiSection,
      LLM_WIKI_CONTEXT_START,
      LLM_WIKI_CONTEXT_END,
    );
    out = upsertFencedSection(
      out,
      disciplineSection,
      GRAPH_DISCIPLINE_CONTEXT_START,
      GRAPH_DISCIPLINE_CONTEXT_END,
    );
    expect(out).toContain('wiki body');
    expect(out).toContain('discipline body');
  });
});
