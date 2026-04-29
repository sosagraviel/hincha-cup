import { describe, expect, it } from 'vitest';
import {
  buildServiceMatchTokens,
  sanitizeWikiUpstream,
  scopeMarkdownToTokens,
  scopeUpstreamForService,
  stripFrameworkInternalJargon,
} from '../../../../src/services/graph-wiki/wiki-input-sanitizer.js';

describe('stripFrameworkInternalJargon', () => {
  it('strips the gira-run leakage phrase about community-tool overflow', () => {
    const before =
      'The code-graph analysis identified the following functional communities. ' +
      'Exact community membership is (not determined by analysis) — the community tool overflowed during the automated run.';
    const after = stripFrameworkInternalJargon(before);
    expect(after).not.toContain('the community tool overflowed');
    expect(after).not.toContain('automated run');
  });

  it('strips "exceeded token limit" and "tool result overflow"', () => {
    expect(stripFrameworkInternalJargon('analysis exceeded token limit on this call')).not.toMatch(
      /exceeded token limit/i,
    );
    expect(stripFrameworkInternalJargon('we hit a tool result overflow here')).not.toMatch(
      /tool result overflow/i,
    );
  });

  it('strips ANY upstream tool-overflow phrase regardless of tool name (stack-agnostic)', () => {
    // The pattern matches "the <tool_name> tool overflowed" for any
    // identifier-shaped tool name — works whether the upstream is gira's
    // get_community_tool or some other tool we haven't seen yet.
    expect(
      stripFrameworkInternalJargon('… the get_flow_tool tool overflowed during the automated run'),
    ).not.toMatch(/get_flow_tool tool overflowed/i);
  });

  it('leaves user-facing prose unchanged', () => {
    // No framework internals — must be byte-identical (modulo whitespace).
    const text =
      '# Service: api\n\nThe `api` service exposes the public REST surface. It is consumed by the web frontend.';
    expect(stripFrameworkInternalJargon(text)).toBe(text);
  });

  it('returns undefined / empty unchanged', () => {
    expect(stripFrameworkInternalJargon(undefined)).toBeUndefined();
    expect(stripFrameworkInternalJargon('')).toBe('');
  });

  it('collapses whitespace artefacts left by surgical strips', () => {
    const before =
      'The community  has tens of files; the foo tool overflowed during the automated run. The cohesion is high.';
    const after = stripFrameworkInternalJargon(before);
    // No double spaces left.
    expect(after).not.toMatch(/ {2}/);
  });
});

describe('sanitizeWikiUpstream', () => {
  it('passes undefined through', () => {
    expect(sanitizeWikiUpstream(undefined)).toBeUndefined();
  });

  it('strips jargon from each text-bearing field independently', () => {
    const input = {
      synthesis: 'A: the foo tool overflowed during the automated run.',
      claudeMd: 'B: nothing internal here.',
      projectContext: 'C: tool result overflow.',
    };
    const out = sanitizeWikiUpstream(input);
    expect(out?.synthesis).not.toMatch(/foo tool overflowed/i);
    expect(out?.claudeMd).toBe('B: nothing internal here.');
    expect(out?.projectContext).not.toMatch(/tool result overflow/i);
  });
});

describe('buildServiceMatchTokens — stack-agnostic', () => {
  it('includes id, name, and path leaf in lowercase', () => {
    const tokens = buildServiceMatchTokens({
      id: 'api',
      name: 'API Gateway',
      path: 'services/api',
    });
    expect(tokens.has('api')).toBe(true);
    expect(tokens.has('api gateway')).toBe(true);
  });

  it('uses path leaf (not full path) so common prefixes do not match everything', () => {
    const tokens = buildServiceMatchTokens({ id: 'web', path: 'apps/web' });
    expect(tokens.has('web')).toBe(true);
    // "apps" should NOT be a token by itself — it would match every service.
    expect(tokens.has('apps')).toBe(false);
  });

  it('skips empty / single-char tokens (defensive against legacy stacks)', () => {
    // single-char id, empty name, no path → zero tokens.
    const tokens = buildServiceMatchTokens({ id: 'a', name: '', path: '' });
    expect(tokens.has('a')).toBe(false); // single char skipped
    expect(tokens.size).toBe(0);
  });

  it('uses path leaf only — even when leaf is short enough to keep', () => {
    // path "src/" → leaf "src" is length 3, KEPT. id "a" still skipped.
    const tokens = buildServiceMatchTokens({ id: 'a', path: 'src/' });
    expect(tokens.has('a')).toBe(false);
    expect(tokens.has('src')).toBe(true);
    expect(tokens.size).toBe(1);
  });

  it('handles minimal input (id only — most legacy projects)', () => {
    const tokens = buildServiceMatchTokens({ id: 'legacy-monolith' });
    expect(tokens.has('legacy-monolith')).toBe(true);
    expect(tokens.size).toBe(1);
  });
});

describe('scopeMarkdownToTokens — stack-agnostic per-service narrative slicer', () => {
  const sample = `# Project Overview

This is the project overview.

## API Service

The api service runs on port 3000 and exposes REST endpoints.

## Web Frontend

The web frontend is a React SPA.

## Worker

The worker consumes BullMQ jobs.
`;

  it('keeps only sections mentioning the target service token', () => {
    const tokens = new Set(['api']);
    const out = scopeMarkdownToTokens(sample, tokens);
    expect(out).toContain('## API Service');
    expect(out).toContain('runs on port 3000');
    expect(out).not.toContain('Web Frontend');
    expect(out).not.toContain('BullMQ jobs');
  });

  it('preserves the preamble when at least one section matches', () => {
    const tokens = new Set(['api']);
    const out = scopeMarkdownToTokens(sample, tokens);
    expect(out).toContain('This is the project overview.');
  });

  it('returns an empty string when no section matches', () => {
    const tokens = new Set(['cobol']);
    const out = scopeMarkdownToTokens(sample, tokens);
    expect(out).toBe('');
  });

  it('respects word boundaries — does not match inside another word', () => {
    const text = '## Captain log\n\nNothing about the api here.';
    const tokens = new Set(['cap']); // would match "Captain" without word boundary
    expect(scopeMarkdownToTokens(text, tokens)).toBe('');
  });

  it('matches case-insensitively', () => {
    const tokens = new Set(['api']);
    const text = '# Header\n\n## API Service\n\nDetails about the API.';
    const out = scopeMarkdownToTokens(text, tokens);
    expect(out).toContain('## API Service');
  });

  it('handles markdown with H1/H2/H3 headings (legacy doc shapes)', () => {
    const text = `# H1

## H2 about the api

Section body.

### H3 about web

Other body.`;
    const tokens = new Set(['api']);
    const out = scopeMarkdownToTokens(text, tokens);
    expect(out).toContain('## H2 about the api');
    expect(out).not.toContain('### H3 about web');
  });
});

describe('scopeUpstreamForService — end-to-end per-service slicing', () => {
  it('narrows synthesis + claudeMd + projectContext to per-service relevance', () => {
    const upstream = {
      synthesis: '# Project\n\n## api\n\napi notes\n\n## web\n\nweb notes',
      claudeMd: '## api commands\n\nrun npm test\n\n## web commands\n\nrun npm dev',
      projectContext: '## api conventions\n\nuse REST\n\n## web conventions\n\nuse React Router',
    };
    const out = scopeUpstreamForService(upstream, {
      id: 'api',
      path: 'services/api',
    });
    expect(out?.synthesis).toContain('api notes');
    expect(out?.synthesis).not.toContain('web notes');
    expect(out?.claudeMd).toContain('run npm test');
    expect(out?.claudeMd).not.toContain('run npm dev');
    expect(out?.projectContext).toContain('use REST');
    expect(out?.projectContext).not.toContain('React Router');
  });

  it('returns the same shape with empty strings when no section mentions the service', () => {
    const upstream = {
      synthesis: '## web\n\nweb notes only',
      claudeMd: '## web commands\n\nnpm dev',
      projectContext: '## generic\n\nno service mention',
    };
    const out = scopeUpstreamForService(upstream, { id: 'unrelated-service' });
    expect(out?.synthesis).toBe('');
    expect(out?.claudeMd).toBe('');
    expect(out?.projectContext).toBe('');
  });

  it('passes undefined through', () => {
    expect(scopeUpstreamForService(undefined, { id: 'x' })).toBeUndefined();
  });

  it('works for legacy project shapes (id only, no path)', () => {
    // Many legacy projects' analyzer outputs only have an `id` — no `path`,
    // no `name`. The slicer must still work.
    const upstream = {
      synthesis: '## legacy-monolith\n\nthis is the legacy monolith\n\n## other\n\nirrelevant',
    };
    const out = scopeUpstreamForService(upstream, { id: 'legacy-monolith' });
    expect(out?.synthesis).toContain('legacy monolith');
    expect(out?.synthesis).not.toContain('irrelevant');
  });
});
