import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { renderSchemaSkeleton } from '../../../../src/services/framework/schema-skeleton/render-skeleton.js';
import { AGENT_OUTPUT_SCHEMAS } from '../../../../src/schemas/phase1-agent-outputs.schema.js';

describe('renderSchemaSkeleton — Plan v8', () => {
  describe('primitive types', () => {
    it('renders string as "<string>"', () => {
      expect(renderSchemaSkeleton(z.string())).toBe('"<string>"');
    });

    it('renders number as <number>', () => {
      expect(renderSchemaSkeleton(z.number())).toBe('<number>');
    });

    it('renders integer as <int>', () => {
      expect(renderSchemaSkeleton(z.int())).toBe('<int>');
    });

    it('renders boolean as <bool>', () => {
      expect(renderSchemaSkeleton(z.boolean())).toBe('<bool>');
    });

    it('renders literal as JSON-stringified value', () => {
      expect(renderSchemaSkeleton(z.literal('hello'))).toBe('"hello"');
    });

    it('renders enum as "a|b|c"', () => {
      expect(renderSchemaSkeleton(z.enum(['a', 'b', 'c']))).toBe('"a|b|c"');
    });
  });

  describe('string constraints', () => {
    it('renders min length as ≥N', () => {
      expect(renderSchemaSkeleton(z.string().min(40))).toBe('"<string ≥40>"');
    });

    it('renders max length as ≤N', () => {
      expect(renderSchemaSkeleton(z.string().max(600))).toBe('"<string ≤600>"');
    });

    it('combines min + max', () => {
      expect(renderSchemaSkeleton(z.string().min(1).max(200))).toBe('"<string ≥1, ≤200>"');
    });
  });

  describe('arrays', () => {
    it('renders ZodArray as [<elem>]', () => {
      expect(renderSchemaSkeleton(z.array(z.string()))).toBe('["<string>"]');
    });

    it('annotates array min/max as field-level comment', () => {
      const out = renderSchemaSkeleton(
        z.object({
          xs: z.array(z.string()).min(2).max(3),
        }),
      );
      expect(out).toMatch(/"xs": \["<string>"\]\s+\/\/ ≥2, ≤3/);
    });
  });

  describe('object optionality', () => {
    it('marks optional fields with a "?" suffix in the key', () => {
      const out = renderSchemaSkeleton(z.object({ req: z.string(), opt: z.string().optional() }));
      expect(out).toContain('"req": "<string>"');
      expect(out).toContain('"opt?": "<string>"');
    });

    it('keeps required-keyed fields without "?"', () => {
      const out = renderSchemaSkeleton(z.object({ a: z.string() }));
      expect(out).not.toMatch(/"a\?"/);
    });
  });

  describe('records and forbidden', () => {
    it('renders z.record() as { "<key>": <value> }', () => {
      expect(renderSchemaSkeleton(z.record(z.string(), z.number()))).toBe('{ "<key>": <number> }');
    });

    it('renders z.never() inside an object as a FORBIDDEN comment line', () => {
      const out = renderSchemaSkeleton(
        z.object({ banned: z.never().optional(), good: z.string() }),
      );
      expect(out).toMatch(/\/\/ "banned": FORBIDDEN/);
      expect(out).toContain('"good": "<string>"');
    });
  });

  describe('Phase 1 analyzer schemas', () => {
    it('renders every analyzer schema with its literal agent_name', () => {
      for (const [name, schema] of Object.entries(AGENT_OUTPUT_SCHEMAS)) {
        const out = renderSchemaSkeleton(schema);
        expect(out, `agent_name literal for ${name}`).toContain(`"agent_name": "${name}"`);
      }
    });

    it('structure analyzer carries the services enum + ≥1 constraint', () => {
      const out = renderSchemaSkeleton(AGENT_OUTPUT_SCHEMAS['structure-architecture-analyzer']);
      // ServiceTypeEnum vocabulary
      expect(out).toMatch(
        /"type": "backend\|frontend\|serverless\|mobile\|worker\|library\|cli\|desktop\|infrastructure"/,
      );
      // services array constraint (renderer may place a `,` between `]` and the comment)
      expect(out).toMatch(/"services": \[[\s\S]+?\][\s,]+\/\/ ≥1/);
      // automation.makefiles target shape
      expect(out).toMatch(/"makefiles": \[\{[\s\S]+"path": "<string ≥1>"[\s\S]+"targets":/);
    });

    it('tech-stack analyzer marks findings.services as FORBIDDEN', () => {
      const out = renderSchemaSkeleton(AGENT_OUTPUT_SCHEMAS['tech-stack-dependencies-analyzer']);
      expect(out).toMatch(/\/\/ "services": FORBIDDEN/);
      // documented_commands.source enum vocabulary
      expect(out).toMatch(/"source\??": "documented\|makefile\|scripts\|package_json"/);
    });

    it('code-patterns analyzer marks findings.services as FORBIDDEN', () => {
      const out = renderSchemaSkeleton(AGENT_OUTPUT_SCHEMAS['code-patterns-testing-analyzer']);
      expect(out).toMatch(/\/\/ "services": FORBIDDEN/);
    });

    it('data-flows analyzer marks findings.services as FORBIDDEN', () => {
      const out = renderSchemaSkeleton(AGENT_OUTPUT_SCHEMAS['data-flows-integrations-analyzer']);
      expect(out).toMatch(/\/\/ "services": FORBIDDEN/);
    });

    it('every analyzer surfaces needs_verification constraints (≤3 + ≥2 entries + ≥40 impact)', () => {
      for (const [name, schema] of Object.entries(AGENT_OUTPUT_SCHEMAS)) {
        const out = renderSchemaSkeleton(schema);
        expect(out, `≤3 cap on needs_verification for ${name}`).toMatch(
          /"needs_verification\??":[\s\S]+\/\/ ≤3/,
        );
        expect(out, `attempted_resolution ≥2 for ${name}`).toMatch(
          /"attempted_resolution": \["<string ≥1>"\][\s,]+\/\/ ≥2/,
        );
        expect(out, `impact ≥40 chars for ${name}`).toContain('"impact": "<string ≥40>"');
      }
    });
  });
});
