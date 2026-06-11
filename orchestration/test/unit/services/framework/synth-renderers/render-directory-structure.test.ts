import { describe, expect, it } from 'vitest';
import { renderDirectoryStructureMarkdown } from '../../../../../src/services/framework/synth-renderers/render-directory-structure.js';

/**
 * Unit tests for the deterministic `## Directory Structure` renderer.
 *
 * Guards the single-repo regression: when every service has path `.` the
 * renderer used to emit a placeholder. It must instead derive an annotated
 * top-level tree from the grounded `file_placement_patterns`, while leaving
 * the multi-service path-based branch untouched.
 *
 * Stack-agnostic — fixtures use generic directory names and pattern types.
 */

describe('renderDirectoryStructureMarkdown — single-repo derivation', () => {
  const md = renderDirectoryStructureMarkdown({
    projectName: 'cm-ai-api',
    services: [
      {
        id: 'cm-ai-api',
        path: '.',
        type: 'backend',
        file_placement_patterns: [
          { type: 'REST router', location: 'src/api/routers/rest/{domain}.py', example: 'x.py' },
          {
            type: 'Webhook handler',
            location: 'src/api/routers/webhooks/{svc}.py',
            example: 'x.py',
          },
          { type: 'SQLAlchemy model', location: 'src/models/{domain}.py', example: 'x.py' },
          { type: 'Domain service', location: 'src/services/{domain}.py', example: 'x.py' },
          { type: 'Alembic migration', location: 'alembic/versions/{rev}.py', example: 'x.py' },
          { type: 'Unit test', location: 'tests/unit/{domain}/test_{mod}.py', example: 'x.py' },
        ],
      },
    ],
  });

  it('does not emit the single-repo placeholder', () => {
    expect(md).not.toContain('single-service / polyrepo');
    expect(md).not.toContain('layout not determined');
  });

  it('renders the project name and a real tree', () => {
    expect(md).toContain('cm-ai-api/');
    expect(md).toContain('├── src/');
  });

  it('groups second-level directories and merges their pattern types into annotations', () => {
    expect(md).toContain('api/  # REST router, Webhook handler');
    expect(md).toContain('models/  # SQLAlchemy model');
    expect(md).toContain('services/  # Domain service');
    expect(md).toContain('versions/  # Alembic migration');
    expect(md).toContain('unit/  # Unit test');
  });
});

describe('renderDirectoryStructureMarkdown — multi-service path branch (unchanged)', () => {
  const md = renderDirectoryStructureMarkdown({
    projectName: 'mono',
    services: [
      { id: 'backend', path: 'services/backend', type: 'backend', framework_main: 'NestJS 11' },
      { id: 'web', path: 'services/web', type: 'frontend', framework_main: 'React' },
    ],
  });

  it('renders the path-based tree grouped by top-level directory', () => {
    expect(md).toContain('└── services/');
    expect(md).toContain('backend/');
    expect(md).toContain('web/');
    expect(md).toContain('NestJS');
  });
});

describe('renderDirectoryStructureMarkdown — fallbacks and caps', () => {
  it('falls back when a single-repo service has no placement patterns', () => {
    const md = renderDirectoryStructureMarkdown({
      projectName: 'bare',
      services: [{ id: 'bare', path: '.' }],
    });
    expect(md).toContain('layout not determined');
  });

  it('falls back when there are no services at all', () => {
    const md = renderDirectoryStructureMarkdown({ projectName: 'empty', services: [] });
    expect(md).toContain('layout not determined');
  });

  it('truncates an oversized derived tree', () => {
    const md = renderDirectoryStructureMarkdown({
      projectName: 'wide',
      services: [
        {
          id: 'wide',
          path: '.',
          file_placement_patterns: Array.from({ length: 20 }, (_, i) => ({
            type: 'Thing',
            location: `dir${i}/{x}.py`,
            example: 'x.py',
          })),
        },
      ],
    });
    expect(md).toContain('truncated');
  });
});
