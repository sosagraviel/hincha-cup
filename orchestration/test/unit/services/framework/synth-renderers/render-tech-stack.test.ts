import { describe, expect, it } from 'vitest';
import { renderTechStackMarkdown } from '../../../../../src/services/framework/synth-renderers/render-tech-stack.js';

/**
 * Unit tests for the deterministic `## Tech Stack` CANDIDATE renderer.
 *
 * The renderer is uniform across single- and multi-service projects: one
 * `### <service>` block per service (a single-repo is just the one-service
 * case), each carrying that service's framework + its OWN production
 * dependencies (≤5), plus a shared preamble. The synthesizer later curates each
 * block into one bullet; cross-service dedup is Phase 3.5's job, not the
 * renderer's. Stack-agnostic — fixtures cover pip, npm, and scoped-npm syntaxes.
 */

describe('renderTechStackMarkdown — single service (one block)', () => {
  const md = renderTechStackMarkdown({
    runtimes: { python: '3.11' },
    services: [{ id: 'cm-ai-api', type: 'backend', framework_main: 'FastAPI', language: 'python' }],
    dependencies: {
      by_service: {
        'cm-ai-api': {
          production: [
            'fastapi>=0.115.0',
            'SQLAlchemy>=2.0.36',
            'alembic>=1.13.3',
            'PyJWT>=2.10.1',
          ],
        },
      },
    },
  });

  it('renders one service block with the runtime folded into the header', () => {
    expect(md).toContain('### cm-ai-api (Python 3.11)');
    expect(md).not.toContain('- **Python** 3.11 — runtime');
  });

  it('keeps the framework version (backfilled from the matching dependency)', () => {
    expect(md).toContain('- **FastAPI** >=0.115.0 — framework');
  });

  it('lists the service production dependencies with versions', () => {
    expect(md).toContain('- **SQLAlchemy** >=2.0.36');
    expect(md).toContain('- **alembic** >=1.13.3');
    expect(md).toContain('- **PyJWT** >=2.10.1');
  });

  it('does not duplicate the framework as a dependency line', () => {
    expect(md).not.toContain('- **fastapi**');
    expect((md.match(/FastAPI/g) ?? []).length).toBe(1);
  });
});

describe('renderTechStackMarkdown — multiple services (one block each)', () => {
  const md = renderTechStackMarkdown({
    services: [
      { id: 'backend', type: 'backend', framework_main: 'NestJS 11' },
      { id: 'web', type: 'frontend', framework_main: 'React 19' },
    ],
    dependencies: {
      by_service: {
        backend: { production: ['@nestjs/core@^11.0.0', 'typeorm@0.3.20'] },
      },
    },
  });

  it('emits a block per service with no inline service suffix', () => {
    expect(md).toContain('### backend');
    expect(md).toContain('### web');
    expect(md).toContain('- **NestJS** 11 — framework');
    expect(md).toContain('- **React** 19 — framework');
    expect(md).not.toContain('(backend)');
  });

  it('groups dependencies under their own service (scoped + plain npm parsing)', () => {
    expect(md).toContain('- **@nestjs/core** ^11.0.0');
    expect(md).toContain('- **typeorm** 0.3.20');
    expect(md.indexOf('typeorm')).toBeLessThan(md.indexOf('### web'));
  });
});

describe('renderTechStackMarkdown — runtime folding (Node family)', () => {
  const md = renderTechStackMarkdown({
    runtimes: { node: '22' },
    services: [{ id: 'web', framework_main: 'React 19', language: 'typescript' }],
    dependencies: { by_service: { web: { production: ['react@19', 'vite@5'] } } },
  });

  it('keeps the Node runtime in the preamble and never mislabels it on the TS service', () => {
    expect(md).toContain('- **Node.js** 22 — runtime');
    expect(md).toContain('### web (TypeScript)');
    expect(md).not.toContain('(TypeScript 22)');
  });
});

describe('renderTechStackMarkdown — dependency spec edge cases', () => {
  const md = renderTechStackMarkdown({
    services: [{ id: 'svc' }],
    dependencies: {
      by_service: {
        svc: {
          production: ['express@4.18.2', 'uvicorn[standard]>=0.30', 'lodash', 'requests==2.31.0'],
        },
      },
    },
  });

  it('handles npm exact, pip extras, bare names, and pip pins', () => {
    expect(md).toContain('- **express** 4.18.2');
    expect(md).toContain('- **uvicorn** >=0.30');
    expect(md).toContain('- **lodash**');
    expect(md).toContain('- **requests** ==2.31.0');
  });
});

describe('renderTechStackMarkdown — per-service cap, no cross-service dedup, empty', () => {
  it('lists a shared dependency under each service (Phase 3.5 consolidates, not the renderer)', () => {
    const md = renderTechStackMarkdown({
      services: [{ id: 'a' }, { id: 'b' }],
      dependencies: {
        by_service: {
          a: { production: ['axios@1.6.0'] },
          b: { production: ['axios@1.6.0', 'zod@3.22.0'] },
        },
      },
    });
    expect((md.match(/- \*\*axios\*\*/g) ?? []).length).toBe(2);
    expect(md).toContain('- **zod** 3.22.0');
  });

  it('caps each service at 5 dependencies with no overflow meta-line', () => {
    const md = renderTechStackMarkdown({
      services: [{ id: 'a' }],
      dependencies: {
        by_service: { a: { production: Array.from({ length: 35 }, (_, i) => `pkg${i}@1.0.0`) } },
      },
    });
    expect((md.match(/- \*\*pkg\d+\*\*/g) ?? []).length).toBe(5);
    expect(md).toContain('- **pkg0** 1.0.0');
    expect(md).not.toContain('- **pkg5** 1.0.0');
    expect(md).not.toContain('more dependencies');
  });

  it('falls back to a not-determined marker when nothing is discovered', () => {
    expect(renderTechStackMarkdown({})).toContain('(not determined by analysis)');
  });
});
