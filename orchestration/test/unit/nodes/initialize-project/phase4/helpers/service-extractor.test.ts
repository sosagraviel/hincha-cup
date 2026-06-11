/**
 * Tests that Phase-1 validation narration (`port_search_evidence`) never reaches
 * the committed stack profile / framework-config.json. The single normalization
 * point is `normalizeServiceEnvironment`; `extractServicesFromPhase1Analyzers`
 * must route both the verbatim and fallback environment branches through it.
 */
import { describe, expect, it } from 'vitest';

import {
  extractServicesFromPhase1Analyzers,
  normalizeServiceEnvironment,
} from '../../../../../../src/nodes/initialize-project/phase4/helpers/service-extractor.js';

describe('normalizeServiceEnvironment', () => {
  it('drops port_search_evidence while keeping committed-config fields', () => {
    const env = normalizeServiceEnvironment({
      port: 3000,
      env_file: '.env',
      deployment_target: 'AWS Lambda',
      docker_image: 'node:22-slim',
      port_applies: false,
      port_applies_reason: 'serverless — no localhost port',
      port_search_evidence: ['Read /Users/x/proj/.claude-temp/foo.json: empty', 'Glob — none'],
    });

    expect(env).toEqual({
      port: 3000,
      env_file: '.env',
      deployment_target: 'AWS Lambda',
      docker_image: 'node:22-slim',
      port_applies: false,
      port_applies_reason: 'serverless — no localhost port',
    });
    expect(env).not.toHaveProperty('port_search_evidence');
  });

  it('returns undefined when no environment exists', () => {
    expect(normalizeServiceEnvironment(undefined)).toBeUndefined();
    expect(normalizeServiceEnvironment(null)).toBeUndefined();
  });
});

describe('extractServicesFromPhase1Analyzers — environment normalization', () => {
  function structureFindingsWithEvidence() {
    return {
      services: [
        {
          id: 'api',
          name: 'API',
          path: 'services/api',
          type: 'backend',
          language: 'TypeScript',
          language_version: '5.9',
          frameworks: { main: 'NestJS' },
          file_count: 10,
          environment: {
            port: 3000,
            port_applies: true,
            port_search_evidence: [
              'Read /Users/x/proj/.claude-temp/initialize-project/project-inspection.json: port_candidates field is empty ({})',
              'Glob — none',
            ],
          },
        },
      ],
    };
  }

  it('strips port_search_evidence from the verbatim svc.environment branch', () => {
    const services = extractServicesFromPhase1Analyzers(structureFindingsWithEvidence(), {}, {});

    expect(services).toHaveLength(1);
    expect(services[0].environment).toBeDefined();
    expect(services[0].environment).not.toHaveProperty('port_search_evidence');
    expect(services[0].environment?.port).toBe(3000);
    expect(services[0].environment?.port_applies).toBe(true);
  });
});
