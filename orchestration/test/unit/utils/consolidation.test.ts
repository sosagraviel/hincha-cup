import { describe, it, expect } from 'vitest';
import { consolidateAnalyses } from '../../../src/utils/consolidation.js';
import type { AnalyzerOutput } from '../../../src/state/schemas/initialize-project.schema.js';

describe('consolidation', () => {
  const createAnalyzerOutput = (
    agent_name: AnalyzerOutput['agent_name'],
    findings: any = {},
    options: Partial<AnalyzerOutput> = {}
  ): AnalyzerOutput => ({
    agent_name,
    timestamp: '2024-01-01T00:00:00Z',
    findings,
    ...options
  });

  describe('consolidateAnalyses', () => {
    it('should consolidate 4 analyzer outputs successfully', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          project_type: 'monorepo',
          directories: ['src', 'tests']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          languages: ['typescript'],
          frameworks: ['react']
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          test_framework: 'vitest',
          patterns: ['factory']
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          apis: ['REST'],
          databases: ['postgres']
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(Object.keys(result.consolidated_findings)).toContain('01-structure-architecture');
      expect(Object.keys(result.consolidated_findings)).toContain('02-tech-stack-dependencies');
      expect(Object.keys(result.consolidated_findings)).toContain('03-code-patterns-testing');
      expect(Object.keys(result.consolidated_findings)).toContain('04-data-flows-integrations');
    });

    it('should throw error when not exactly 4 analyzers', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {}),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {})
      ];

      expect(() => consolidateAnalyses(analyzers)).toThrow('Expected 4 analyzer outputs, got 2');
    });

    it('should handle empty findings', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {}),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {}),
        createAnalyzerOutput('code-patterns-testing-analyzer', {}),
        createAnalyzerOutput('data-flows-integrations-analyzer', {})
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings).toBeDefined();
      expect(result.identified_gaps).toBeDefined();
      expect(result.identified_gaps!.length).toBeGreaterThan(0); // Should identify sparse findings
    });

    it('should identify overlaps when multiple agents report same category', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          languages: ['typescript'],
          framework: 'react'
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          languages: ['typescript', 'javascript'],
          framework: 'react'
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          languages: ['typescript']
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          apis: ['REST']
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings.overlaps).toBeDefined();
      expect(Array.isArray(result.consolidated_findings.overlaps)).toBe(true);
      const overlaps = result.consolidated_findings.overlaps;
      expect(overlaps.some((o: any) => o.category === 'languages')).toBe(true);
      expect(overlaps.some((o: any) => o.category === 'framework')).toBe(true);
    });

    it('should set high confidence when 3+ agents agree', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          shared_category: ['value1']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          shared_category: ['value2']
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          shared_category: ['value3']
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          unique_category: ['value4']
        })
      ];

      const result = consolidateAnalyses(analyzers);

      const overlaps = result.consolidated_findings.overlaps;
      const sharedOverlap = overlaps?.find((o: any) => o.category === 'shared_category');
      expect(sharedOverlap).toBeDefined();
      expect(sharedOverlap.confidence).toBe('high');
      expect(sharedOverlap.count).toBe(3);
    });

    it('should identify gaps from needs_verification with string format', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          data: 'test'
        }, {
          needs_verification: ['unclear dependency', 'missing config']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', { data: 'test' }),
        createAnalyzerOutput('code-patterns-testing-analyzer', { data: 'test' }),
        createAnalyzerOutput('data-flows-integrations-analyzer', { data: 'test' })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.identified_gaps).toBeDefined();
      expect(result.identified_gaps!.length).toBeGreaterThan(0);
      expect(result.identified_gaps!.some(g => g.includes('unclear dependency'))).toBe(true);
      expect(result.identified_gaps!.some(g => g.includes('missing config'))).toBe(true);
    });

    it('should identify gaps from needs_verification with object format', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          data: 'test'
        }, {
          needs_verification: [
            { item: 'unclear dependency', question: 'What is the dependency?', reason: 'Not clear' },
            { item: 'missing config', question: 'Where is config?' }
          ] as any
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', { data: 'test' }),
        createAnalyzerOutput('code-patterns-testing-analyzer', { data: 'test' }),
        createAnalyzerOutput('data-flows-integrations-analyzer', { data: 'test' })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.identified_gaps).toBeDefined();
      expect(result.identified_gaps!.length).toBeGreaterThan(0);
      expect(result.identified_gaps!.some(g => g.includes('unclear dependency'))).toBe(true);
      expect(result.identified_gaps!.some(g => g.includes('What is the dependency?'))).toBe(true);
    });

    it('should identify sparse findings gaps', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          only: 'one',
          finding: 'here'
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          full: 'findings',
          with: 'multiple',
          categories: 'here'
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          full: 'findings',
          with: 'multiple',
          categories: 'here'
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          full: 'findings',
          with: 'multiple',
          categories: 'here'
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.identified_gaps).toBeDefined();
      expect(result.identified_gaps!.some(g => g.includes('Sparse findings'))).toBe(true);
    });

    it('should detect language conflicts', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          languages: ['typescript', 'javascript']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          languages: ['python', 'javascript']
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          no_languages: 'here'
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          no_languages: 'here'
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.conflicting_findings).toBeDefined();
      expect(result.conflicting_findings!.length).toBeGreaterThan(0);
      expect(result.conflicting_findings![0]).toContain('language_detection');
    });

    it('should detect tech stack conflicts from nested structure', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          tech_stack: {
            languages: ['typescript'],
            frameworks: ['react']
          }
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          tech_stack: {
            languages: ['javascript'],
            frameworks: ['vue']
          }
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          data: 'test'
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          data: 'test'
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.conflicting_findings).toBeDefined();
      expect(result.conflicting_findings!.length).toBeGreaterThan(0);
    });

    it('should not detect conflicts when all agents agree', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          languages: ['typescript', 'javascript']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          languages: ['typescript', 'javascript']
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          data: 'test'
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          data: 'test'
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.conflicting_findings).toBeUndefined();
    });

    it('should handle confidence_level from analyzers', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', { data: 'test' }, { confidence_level: 'high' }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', { data: 'test' }, { confidence_level: 'low' }),
        createAnalyzerOutput('code-patterns-testing-analyzer', { data: 'test' }),
        createAnalyzerOutput('data-flows-integrations-analyzer', { data: 'test' })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings['01-structure-architecture'].confidence_level).toBe('high');
      expect(result.consolidated_findings['02-tech-stack-dependencies'].confidence_level).toBe('low');
      expect(result.consolidated_findings['03-code-patterns-testing'].confidence_level).toBe('medium');
    });

    it('should preserve original agent names in consolidated findings', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', { data: 'test' }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', { data: 'test' }),
        createAnalyzerOutput('code-patterns-testing-analyzer', { data: 'test' }),
        createAnalyzerOutput('data-flows-integrations-analyzer', { data: 'test' })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings['01-structure-architecture'].agent_name)
        .toBe('structure-architecture-analyzer');
      expect(result.consolidated_findings['02-tech-stack-dependencies'].agent_name)
        .toBe('tech-stack-dependencies-analyzer');
    });

    it('should deduplicate exact duplicate gaps', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          data: 'test'
        }, {
          needs_verification: ['duplicate item', 'duplicate item', 'unique item']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', { data: 'test' }),
        createAnalyzerOutput('code-patterns-testing-analyzer', { data: 'test' }),
        createAnalyzerOutput('data-flows-integrations-analyzer', { data: 'test' })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.identified_gaps).toBeDefined();
      // Should have deduplicated the duplicate items
      const duplicateCount = result.identified_gaps!.filter(g => g.includes('duplicate item')).length;
      expect(duplicateCount).toBe(1);
    });

    it('should handle findings with array items', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          features: ['auth', 'api', 'db']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          features: ['auth', 'api']
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          data: 'test'
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          data: 'test'
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings.overlaps).toBeDefined();
      const featureOverlap = result.consolidated_findings.overlaps?.find((o: any) => o.category === 'features');
      expect(featureOverlap).toBeDefined();
      expect(featureOverlap.count).toBe(2);
    });

    it('should handle non-array findings items', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          config_file: 'tsconfig.json'
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          config_file: 'package.json'
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          data: 'test'
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          data: 'test'
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings.overlaps).toBeDefined();
      const configOverlap = result.consolidated_findings.overlaps?.find((o: any) => o.category === 'config_file');
      expect(configOverlap).toBeDefined();
    });

    it('should handle null or undefined findings', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', null as any),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', undefined as any),
        createAnalyzerOutput('code-patterns-testing-analyzer', { data: 'test' }),
        createAnalyzerOutput('data-flows-integrations-analyzer', { data: 'test' })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.consolidated_findings).toBeDefined();
      expect(result.identified_gaps).toBeDefined();
    });

    it('should return undefined for gaps when no gaps found', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          a: 1,
          b: 2,
          c: 3,
          d: 4
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          a: 1,
          b: 2,
          c: 3,
          d: 4
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          a: 1,
          b: 2,
          c: 3,
          d: 4
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          a: 1,
          b: 2,
          c: 3,
          d: 4
        })
      ];

      const result = consolidateAnalyses(analyzers);

      expect(result.identified_gaps).toBeUndefined();
    });

    it('should handle frameworks in conflict detection', () => {
      const analyzers: AnalyzerOutput[] = [
        createAnalyzerOutput('structure-architecture-analyzer', {
          frameworks: ['react', 'express']
        }),
        createAnalyzerOutput('tech-stack-dependencies-analyzer', {
          frameworks: ['vue', 'express']
        }),
        createAnalyzerOutput('code-patterns-testing-analyzer', {
          data: 'test'
        }),
        createAnalyzerOutput('data-flows-integrations-analyzer', {
          data: 'test'
        })
      ];

      const result = consolidateAnalyses(analyzers);

      // Should detect conflict in languages (none provided, but structure allows frameworks)
      expect(result.consolidated_findings).toBeDefined();
    });
  });
});
