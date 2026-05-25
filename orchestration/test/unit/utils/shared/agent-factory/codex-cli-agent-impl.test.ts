import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  normalizeCodexReasoningEffort,
  transformSchemaForStructuredOutputs,
} from '../../../../../src/utils/shared/agent-factory/codex-cli-agent-impl.js';
import {
  CodePatternsAnalyzerOutputSchema,
  DataFlowsAnalyzerOutputSchema,
  StructureAnalyzerOutputSchema,
  TechStackAnalyzerOutputSchema,
} from '../../../../../src/schemas/phase1-agent-outputs.schema.js';

function collectKeys(value: unknown, key: string, matches: unknown[] = []): unknown[] {
  if (!value || typeof value !== 'object') return matches;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, key, matches);
    return matches;
  }

  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    matches.push(record[key]);
  }
  for (const item of Object.values(record)) {
    collectKeys(item, key, matches);
  }
  return matches;
}

describe('Codex CLI adapter structured-output schema', () => {
  it.each([
    ['tech-stack-dependencies-analyzer', TechStackAnalyzerOutputSchema],
    ['code-patterns-testing-analyzer', CodePatternsAnalyzerOutputSchema],
    ['data-flows-integrations-analyzer', DataFlowsAnalyzerOutputSchema],
  ])('removes z.never() forbidden properties for %s', (_agentName, schema) => {
    const rawJsonSchema = z.toJSONSchema(schema, {
      target: 'draft-7',
      io: 'input',
      unrepresentable: 'any',
    });

    const transformed = transformSchemaForStructuredOutputs(
      rawJsonSchema as Record<string, unknown>,
    );

    const findings = (transformed.properties as Record<string, unknown>).findings as {
      properties: Record<string, unknown>;
    };
    expect(findings.properties).not.toHaveProperty('services');
    expect(collectKeys(transformed, 'not')).toEqual([]);
  });

  it('represents transform-based fields with their input type', () => {
    const rawJsonSchema = z.toJSONSchema(StructureAnalyzerOutputSchema, {
      target: 'draft-7',
      io: 'input',
      unrepresentable: 'any',
    });

    const transformed = transformSchemaForStructuredOutputs(
      rawJsonSchema as Record<string, unknown>,
    );
    const serviceSchema = (transformed.properties as any).findings.properties.services.items as {
      properties?: Record<string, unknown>;
    };

    expect(serviceSchema.properties?.language).toMatchObject({ type: 'string' });
  });
});

describe('Codex CLI adapter reasoning effort', () => {
  it('floors minimal to low for Codex requests', () => {
    expect(normalizeCodexReasoningEffort('minimal')).toBe('low');
  });

  it('preserves non-minimal efforts', () => {
    expect(normalizeCodexReasoningEffort('low')).toBe('low');
    expect(normalizeCodexReasoningEffort('medium')).toBe('medium');
    expect(normalizeCodexReasoningEffort('high')).toBe('high');
    expect(normalizeCodexReasoningEffort('xhigh')).toBe('xhigh');
    expect(normalizeCodexReasoningEffort(undefined)).toBeUndefined();
  });
});
