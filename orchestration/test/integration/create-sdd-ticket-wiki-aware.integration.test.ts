/**
 * File-level integration test for create-sdd-ticket wiki-aware behavior.
 *
 * No skill-runner harness exists in this codebase (grep for invokeSkill /
 * skill-runner under orchestration/src returns no matches). This test instead:
 *
 * 1. Builds the wiki-aware-sdd fixture programmatically in beforeAll so the
 *    test is self-contained (test/fixtures/ is gitignored; fixtures that need
 *    to survive CI must be created at runtime).
 * 2. Exercises loadLlmWikiContext() against the built fixture to assert the
 *    paths the skill would consult are parseable and return the expected
 *    context sections.
 * 3. Parses SKILL.md to confirm Phase 0.5 references the correct wiki paths
 *    and Quality Checks list the new wiki/graph items.
 * 4. Verifies the fallback log string is present so it can be grepped by CI.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadLlmWikiContext } from '../../src/services/implement-ticket/graph-context.service.js';

const FIXTURE_ROOT = join(__dirname, '../fixtures/wiki-aware-sdd');
const WIKI_ROOT = join(FIXTURE_ROOT, 'docs/llm-wiki/wiki');

const SKILL_PATH = join(
  __dirname,
  '../../../skills/020-development-workflow/create-sdd-ticket/SKILL.md',
);

const SHARED_FRONTMATTER = {
  graph_version: 'a'.repeat(64),
  graph_commit: 'b'.repeat(40),
  generated_at: '2026-04-24T00:00:00.000Z',
  generated_by: 'ai-agentic-framework@test',
  source_sha256: 'c'.repeat(64),
  source_commit: 'd'.repeat(40),
};

function frontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) {
        if (typeof item === 'object' && item !== null) {
          const entries = Object.entries(item as Record<string, string>);
          const first = entries[0];
          lines.push(`  - ${first[0]}: ${first[1]}`);
          for (const [ik, iv] of entries.slice(1)) {
            lines.push(`    ${ik}: ${iv}`);
          }
        } else {
          lines.push(`  - ${item}`);
        }
      }
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function buildWikiFixture(): void {
  const dirs = [WIKI_ROOT, join(WIKI_ROOT, 'services')];
  for (const d of dirs) {
    mkdirSync(d, { recursive: true });
  }

  const fm = SHARED_FRONTMATTER;

  writeFileSync(
    join(WIKI_ROOT, 'index.md'),
    [
      frontmatter({
        document_type: 'index',
        summary: 'Navigation index for the wiki-aware-sdd test fixture wiki.',
        confidence: 'high',
        generated_at: fm.generated_at,
        generated_by: fm.generated_by,
        graph_version: fm.graph_version,
        graph_commit: fm.graph_commit,
        graph_queries_used: ['mcp__code_graph__get_architecture_overview'],
        sources: [
          {
            path: 'README.md',
            sha256: fm.source_sha256,
            ingested_at: fm.generated_at,
            commit: fm.source_commit,
          },
        ],
        related: ['wiki/ARCHITECTURE.md', 'wiki/SERVICES.md'],
        last_verified: fm.generated_at,
      }),
      '',
      '# Wiki Index',
      '',
      '## Navigation',
      '',
      '- [Architecture](ARCHITECTURE.md)',
      '- [Services](SERVICES.md)',
      '- [Data Flows](DATA-FLOWS.md)',
      '- [Patterns](PATTERNS.md)',
      '- [Auth Service](services/auth.md)',
    ].join('\n'),
  );

  writeFileSync(
    join(WIKI_ROOT, 'ARCHITECTURE.md'),
    [
      frontmatter({
        document_type: 'architecture',
        summary: 'High-level architecture overview for the wiki-aware-sdd fixture project.',
        confidence: 'high',
        generated_at: fm.generated_at,
        generated_by: fm.generated_by,
        graph_version: fm.graph_version,
        graph_commit: fm.graph_commit,
        graph_queries_used: ['mcp__code_graph__get_architecture_overview'],
        sources: [
          {
            path: 'README.md',
            sha256: fm.source_sha256,
            ingested_at: fm.generated_at,
            commit: fm.source_commit,
          },
        ],
        related: ['wiki/SERVICES.md', 'wiki/DATA-FLOWS.md'],
        last_verified: fm.generated_at,
      }),
      '',
      '# Architecture',
      '',
      'Minimal Node.js REST API fixture for wiki-aware SDD ticket testing. ^[graph]',
      '',
      '## Services',
      '',
      'The system exposes two services: `auth` and `users`. ^[inferred]',
    ].join('\n'),
  );

  writeFileSync(
    join(WIKI_ROOT, 'SERVICES.md'),
    [
      frontmatter({
        document_type: 'services',
        summary: 'Catalogue of services: auth and users.',
        confidence: 'high',
        generated_at: fm.generated_at,
        generated_by: fm.generated_by,
        graph_version: fm.graph_version,
        graph_commit: fm.graph_commit,
        graph_queries_used: ['mcp__code_graph__list_communities'],
        sources: [
          {
            path: 'src/services/auth.ts',
            sha256: 'e'.repeat(64),
            ingested_at: fm.generated_at,
            commit: fm.source_commit,
          },
          {
            path: 'src/services/users.ts',
            sha256: 'f'.repeat(64),
            ingested_at: fm.generated_at,
            commit: fm.source_commit,
          },
        ],
        related: ['wiki/services/auth.md', 'wiki/ARCHITECTURE.md'],
        last_verified: fm.generated_at,
      }),
      '',
      '# Services',
      '',
      '## auth',
      '',
      'Service ID: `auth`. JWT-based authentication and session management. ^[graph]',
      '',
      '## users',
      '',
      'Service ID: `users`. User CRUD operations and profile data. ^[inferred]',
    ].join('\n'),
  );

  writeFileSync(
    join(WIKI_ROOT, 'DATA-FLOWS.md'),
    [
      frontmatter({
        document_type: 'data-flow',
        summary: 'Key data flows: auth token lifecycle and user CRUD paths.',
        confidence: 'medium',
        generated_at: fm.generated_at,
        generated_by: fm.generated_by,
        graph_version: fm.graph_version,
        graph_commit: fm.graph_commit,
        graph_queries_used: ['mcp__code_graph__get_data_flow'],
        sources: [
          {
            path: 'src/routes/auth.ts',
            sha256: '1'.repeat(64),
            ingested_at: fm.generated_at,
            commit: fm.source_commit,
          },
        ],
        related: ['wiki/SERVICES.md', 'wiki/ARCHITECTURE.md'],
        last_verified: fm.generated_at,
      }),
      '',
      '# Data Flows',
      '',
      '## Auth Token Lifecycle',
      '',
      '1. Client POSTs credentials to `POST /auth/login`. ^[graph]',
      '2. `AuthService.login()` validates and issues a JWT access token + refresh token.',
    ].join('\n'),
  );

  writeFileSync(
    join(WIKI_ROOT, 'PATTERNS.md'),
    [
      frontmatter({
        document_type: 'pattern',
        summary: 'Design patterns: throttling middleware and repository pattern.',
        confidence: 'high',
        generated_at: fm.generated_at,
        generated_by: fm.generated_by,
        graph_version: fm.graph_version,
        graph_commit: fm.graph_commit,
        graph_queries_used: ['mcp__code_graph__get_patterns'],
        sources: [
          {
            path: 'src/middleware/throttle.ts',
            sha256: '2'.repeat(64),
            ingested_at: fm.generated_at,
            commit: fm.source_commit,
          },
        ],
        related: ['wiki/ARCHITECTURE.md', 'wiki/services/auth.md'],
        last_verified: fm.generated_at,
      }),
      '',
      '# Patterns',
      '',
      '## Throttling {#throttling}',
      '',
      'Rate limiting applied at middleware level using a sliding window algorithm. ^[graph]',
      '',
      '## Repository Pattern',
      '',
      'All database access goes through repository classes. ^[inferred]',
    ].join('\n'),
  );

  writeFileSync(
    join(WIKI_ROOT, 'services/auth.md'),
    [
      frontmatter({
        document_type: 'service',
        summary: 'Auth service: JWT issuance, refresh token management, and rate limiting.',
        confidence: 'high',
        generated_at: fm.generated_at,
        generated_by: fm.generated_by,
        graph_version: fm.graph_version,
        graph_commit: fm.graph_commit,
        graph_queries_used: ['mcp__code_graph__get_community'],
        service_id: 'auth',
        entry_points: ['src/services/auth.ts', 'src/routes/auth.ts'],
        sources: [
          {
            path: 'src/services/auth.ts',
            sha256: 'e'.repeat(64),
            ingested_at: fm.generated_at,
            commit: fm.source_commit,
          },
        ],
        related: ['wiki/SERVICES.md', 'wiki/PATTERNS.md#throttling', 'wiki/DATA-FLOWS.md'],
        last_verified: fm.generated_at,
      }),
      '',
      '# Auth Service',
      '',
      'Responsible for JWT-based authentication and session management. ^[graph]',
      '',
      '## Key Symbols',
      '',
      '- `AuthService.login(credentials)` — validates and issues token pair',
      '- `AuthService.refresh(refreshToken)` — rotates refresh token',
    ].join('\n'),
  );
}

describe('create-sdd-ticket wiki-aware integration', () => {
  beforeAll(() => {
    buildWikiFixture();
  });

  afterAll(() => {
    if (existsSync(FIXTURE_ROOT)) {
      rmSync(FIXTURE_ROOT, { recursive: true, force: true });
    }
  });

  describe('fixture wiki tree is well-formed', () => {
    const coreFiles = [
      'index.md',
      'ARCHITECTURE.md',
      'SERVICES.md',
      'DATA-FLOWS.md',
      'PATTERNS.md',
    ];

    for (const fileName of coreFiles) {
      it(`fixture contains ${fileName} with valid frontmatter`, () => {
        const filePath = join(WIKI_ROOT, fileName);
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf-8');
        expect(content.startsWith('---')).toBe(true);

        const closingIdx = content.indexOf('\n---', 3);
        expect(closingIdx).toBeGreaterThan(3);

        const frontmatterBlock = content.slice(3, closingIdx);
        expect(frontmatterBlock).toContain('document_type:');
        expect(frontmatterBlock).toContain('summary:');
        expect(frontmatterBlock).toContain('confidence:');
        expect(frontmatterBlock).toContain('graph_commit:');
        expect(frontmatterBlock).toContain('sources:');
      });
    }

    it('fixture contains services/auth.md service detail page', () => {
      const authPath = join(WIKI_ROOT, 'services/auth.md');
      expect(existsSync(authPath)).toBe(true);

      const content = readFileSync(authPath, 'utf-8');
      expect(content).toContain('service_id:');
      expect(content).toContain('auth');
    });

    it('SERVICES.md lists auth service ID', () => {
      const servicesPath = join(WIKI_ROOT, 'SERVICES.md');
      const content = readFileSync(servicesPath, 'utf-8');
      expect(content).toContain('auth');
    });

    it('PATTERNS.md includes throttling section for graph evidence matching', () => {
      const patternsPath = join(WIKI_ROOT, 'PATTERNS.md');
      const content = readFileSync(patternsPath, 'utf-8');
      expect(content).toContain('throttling');
    });
  });

  describe('loadLlmWikiContext() against the fixture', () => {
    it('returns non-empty context when the wiki-aware-sdd fixture wiki exists', () => {
      const context = loadLlmWikiContext(FIXTURE_ROOT);
      expect(context).not.toBe('');
    });

    it('context includes # LLM Wiki Context header', () => {
      const context = loadLlmWikiContext(FIXTURE_ROOT);
      expect(context).toContain('# LLM Wiki Context');
    });

    it('context includes ARCHITECTURE section', () => {
      const context = loadLlmWikiContext(FIXTURE_ROOT);
      expect(context).toContain('## ARCHITECTURE');
    });

    it('context includes SERVICES section', () => {
      const context = loadLlmWikiContext(FIXTURE_ROOT);
      expect(context).toContain('## SERVICES');
    });

    it('context includes DATA-FLOWS section', () => {
      const context = loadLlmWikiContext(FIXTURE_ROOT);
      expect(context).toContain('## DATA-FLOWS');
    });

    it('context includes PATTERNS section', () => {
      const context = loadLlmWikiContext(FIXTURE_ROOT);
      expect(context).toContain('## PATTERNS');
    });

    it('context strips frontmatter so agent receives only body content', () => {
      const context = loadLlmWikiContext(FIXTURE_ROOT);
      expect(context).not.toContain('document_type:');
      expect(context).not.toContain('graph_version:');
    });
  });

  describe('SKILL.md Phase 0.5 references match fixture paths', () => {
    let skillContent: string;

    beforeAll(() => {
      skillContent = readFileSync(SKILL_PATH, 'utf-8');
    });

    it('Phase 0.5 references docs/llm-wiki/wiki/ — the path the fixture provides', () => {
      const phase05 = skillContent.slice(
        skillContent.indexOf('### Phase 0.5:'),
        skillContent.indexOf('### Phase 1:'),
      );
      expect(phase05).toContain('docs/llm-wiki/wiki/');
    });

    it('Phase 0.5 references docs/llm-wiki/wiki/services/<service-id>.md — the path auth.md follows', () => {
      const phase05 = skillContent.slice(
        skillContent.indexOf('### Phase 0.5:'),
        skillContent.indexOf('### Phase 1:'),
      );
      expect(phase05).toContain('docs/llm-wiki/wiki/services/<service-id>.md');
    });

    it('Phase 0.5 references index in the core docs list', () => {
      const phase05 = skillContent.slice(
        skillContent.indexOf('### Phase 0.5:'),
        skillContent.indexOf('### Phase 1:'),
      );
      expect(phase05).toContain('index');
    });

    it('wiki-context.md persistence path uses TEMP_DIR placeholder', () => {
      const phase05 = skillContent.slice(
        skillContent.indexOf('### Phase 0.5:'),
        skillContent.indexOf('### Phase 1:'),
      );
      expect(phase05).toContain('{{TEMP_DIR}}');
      expect(phase05).toContain('wiki-context.md');
    });
  });

  describe('SKILL.md Quality Checks list wiki items', () => {
    let skillContent: string;

    beforeAll(() => {
      skillContent = readFileSync(SKILL_PATH, 'utf-8');
    });

    it('Technical Clarity quality check includes wiki evidence item', () => {
      const techClarity = skillContent.slice(
        skillContent.indexOf('### Technical Clarity'),
        skillContent.indexOf('## Integration Notes'),
      );
      expect(techClarity).toContain('wiki evidence cited when available');
    });

    it('Technical Clarity quality check includes graph evidence item', () => {
      const techClarity = skillContent.slice(
        skillContent.indexOf('### Technical Clarity'),
        skillContent.indexOf('## Integration Notes'),
      );
      expect(techClarity).toContain('graph evidence cited when the graph is available');
    });
  });

  describe('fallback log string is present and greppable', () => {
    it('SKILL.md contains the exact fallback log string', () => {
      const skillContent = readFileSync(SKILL_PATH, 'utf-8');
      expect(skillContent).toContain('wiki unavailable — falling back to project-context only');
    });
  });
});
