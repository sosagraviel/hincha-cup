/**
 * Unit Tests for Phase 1 Agent Output Schemas - Automation Features
 *
 * Tests validate:
 * 1. automation field validation in StructureAnalyzerOutputSchema
 * 2. documented_commands field validation in TechStackAnalyzerOutputSchema
 * 3. Backward compatibility (schema accepts data without new fields)
 * 4. Invalid data is rejected
 */

import { describe, it, expect } from 'vitest';
import {
  StructureAnalyzerOutputSchema,
  TechStackAnalyzerOutputSchema,
} from '../../../src/schemas/phase1-agent-outputs.schema.js';

describe('Phase 1 Agent Output Schemas - Automation Features', () => {
  describe('Structure Analyzer - Automation Field', () => {
    it('should accept output with automation field containing all automation types', () => {
      const outputWithAutomation = {
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          services: [
            {
              id: 'backend',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { main: 'NestJS' },
            },
          ],
          automation: {
            makefiles: [
              {
                path: 'Makefile',
                targets: ['build', 'test', 'clean', 'deploy'],
              },
              {
                path: 'scripts/Makefile',
                targets: ['lint', 'format'],
              },
            ],
            shell_scripts: [
              {
                path: 'scripts/setup.sh',
                name: 'setup.sh',
                purpose: 'Initial project setup and dependency installation',
              },
              {
                path: 'deploy.sh',
                name: 'deploy.sh',
              },
            ],
            justfiles: [
              {
                path: 'justfile',
                targets: ['dev', 'build', 'test'],
              },
            ],
          },
        },
        needs_verification: [],
      };

      const result = StructureAnalyzerOutputSchema.parse(outputWithAutomation);
      expect(result.findings.automation).toBeDefined();
      expect(result.findings.automation?.makefiles).toHaveLength(2);
      expect(result.findings.automation?.shell_scripts).toHaveLength(2);
      expect(result.findings.automation?.justfiles).toHaveLength(1);
      expect(result.findings.automation?.makefiles?.[0].targets).toContain('build');
      expect(result.findings.automation?.shell_scripts?.[0].purpose).toBe(
        'Initial project setup and dependency installation',
      );
    });

    it('should accept output with partial automation (only makefiles)', () => {
      const outputWithMakefileOnly = {
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          services: [
            {
              id: 'backend',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { main: 'NestJS' },
            },
          ],
          automation: {
            makefiles: [
              {
                path: 'Makefile',
                targets: ['all', 'clean'],
              },
            ],
          },
        },
        needs_verification: [],
      };

      const result = StructureAnalyzerOutputSchema.parse(outputWithMakefileOnly);
      expect(result.findings.automation?.makefiles).toHaveLength(1);
      expect(result.findings.automation?.shell_scripts).toBeUndefined();
      expect(result.findings.automation?.justfiles).toBeUndefined();
    });

    it('should accept output without automation field (backward compatibility)', () => {
      const outputWithoutAutomation = {
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          services: [
            {
              id: 'backend',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { main: 'NestJS' },
            },
          ],
        },
        needs_verification: [],
      };

      expect(() => StructureAnalyzerOutputSchema.parse(outputWithoutAutomation)).not.toThrow();
      const result = StructureAnalyzerOutputSchema.parse(outputWithoutAutomation);
      expect(result.findings.automation).toBeUndefined();
    });

    it('should reject invalid automation data - missing required fields', () => {
      const invalidOutput = {
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          services: [
            {
              id: 'backend',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { main: 'NestJS' },
            },
          ],
          automation: {
            makefiles: [
              {
                path: 'Makefile',
                // Missing targets field
              },
            ],
          },
        },
        needs_verification: [],
      };

      expect(() => StructureAnalyzerOutputSchema.parse(invalidOutput)).toThrow();
    });

    it('should reject invalid automation data - wrong types', () => {
      const invalidOutput = {
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          services: [
            {
              id: 'backend',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { main: 'NestJS' },
            },
          ],
          automation: {
            makefiles: [
              {
                path: 'Makefile',
                targets: 'invalid', // Should be array
              },
            ],
          },
        },
        needs_verification: [],
      };

      expect(() => StructureAnalyzerOutputSchema.parse(invalidOutput)).toThrow();
    });
  });

  describe('Tech Stack Analyzer - Documented Commands Field', () => {
    it('should accept output with documented_commands field', () => {
      const outputWithDocumentedCommands = {
        agent_name: 'tech-stack-dependencies-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          documented_commands: {
            by_task: {
              dev: 'npm run dev',
              test: 'npm test',
              build: 'npm run build',
              lint: 'npm run lint',
              typecheck: 'tsc --noEmit',
              deploy: 'npm run deploy',
            },
            source: 'documented',
            conflicts: [
              {
                task: 'test',
                documented: 'npm test',
                discovered: 'jest',
              },
            ],
          },
        },
        needs_verification: [],
      };

      const result = TechStackAnalyzerOutputSchema.parse(outputWithDocumentedCommands);
      expect(result.findings.documented_commands).toBeDefined();
      expect(result.findings.documented_commands?.by_task?.dev).toBe('npm run dev');
      expect(result.findings.documented_commands?.source).toBe('documented');
      expect(result.findings.documented_commands?.conflicts).toHaveLength(1);
      expect(result.findings.documented_commands?.conflicts?.[0].task).toBe('test');
    });

    it('should accept output with partial documented_commands (only by_task)', () => {
      const outputWithPartialCommands = {
        agent_name: 'tech-stack-dependencies-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          documented_commands: {
            by_task: {
              dev: 'make dev',
              build: 'make build',
            },
          },
        },
        needs_verification: [],
      };

      const result = TechStackAnalyzerOutputSchema.parse(outputWithPartialCommands);
      expect(result.findings.documented_commands?.by_task?.dev).toBe('make dev');
      expect(result.findings.documented_commands?.source).toBeUndefined();
      expect(result.findings.documented_commands?.conflicts).toBeUndefined();
    });

    it('should accept different source types', () => {
      const sourceTypes = ['documented', 'makefile', 'scripts', 'package_json'] as const;

      for (const source of sourceTypes) {
        const output = {
          agent_name: 'tech-stack-dependencies-analyzer',
          timestamp: '2026-04-13T10:00:00.000Z',
          findings: {
            documented_commands: {
              by_task: { dev: 'test command' },
              source,
            },
          },
          needs_verification: [],
        };

        expect(() => TechStackAnalyzerOutputSchema.parse(output)).not.toThrow();
        const result = TechStackAnalyzerOutputSchema.parse(output);
        expect(result.findings.documented_commands?.source).toBe(source);
      }
    });

    it('should accept output without documented_commands field (backward compatibility)', () => {
      const outputWithoutCommands = {
        agent_name: 'tech-stack-dependencies-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          dependencies: {
            by_service: {
              backend: {
                production: ['express', 'mongoose'],
                development: ['jest', 'nodemon'],
              },
            },
          },
        },
        needs_verification: [],
      };

      expect(() => TechStackAnalyzerOutputSchema.parse(outputWithoutCommands)).not.toThrow();
      const result = TechStackAnalyzerOutputSchema.parse(outputWithoutCommands);
      expect(result.findings.documented_commands).toBeUndefined();
    });

    it('should reject invalid source value', () => {
      const invalidOutput = {
        agent_name: 'tech-stack-dependencies-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          documented_commands: {
            by_task: { dev: 'npm start' },
            source: 'invalid_source', // Not in enum
          },
        },
        needs_verification: [],
      };

      expect(() => TechStackAnalyzerOutputSchema.parse(invalidOutput)).toThrow();
    });

    it('should reject invalid conflicts structure', () => {
      const invalidOutput = {
        agent_name: 'tech-stack-dependencies-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          documented_commands: {
            by_task: { dev: 'npm start' },
            conflicts: [
              {
                task: 'test',
                documented: 'npm test',
                // Missing discovered field
              },
            ],
          },
        },
        needs_verification: [],
      };

      expect(() => TechStackAnalyzerOutputSchema.parse(invalidOutput)).toThrow();
    });
  });

  describe('Combined Schema Tests', () => {
    it('should accept data with both automation and documented_commands in separate analyzers', () => {
      const structureOutput = {
        agent_name: 'structure-architecture-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          services: [
            {
              id: 'backend',
              path: 'src',
              type: 'backend',
              language: 'typescript',
              frameworks: { main: 'NestJS' },
            },
          ],
          automation: {
            makefiles: [
              {
                path: 'Makefile',
                targets: ['dev', 'build'],
              },
            ],
          },
        },
        needs_verification: [],
      };

      const techStackOutput = {
        agent_name: 'tech-stack-dependencies-analyzer',
        timestamp: '2026-04-13T10:00:00.000Z',
        findings: {
          documented_commands: {
            by_task: {
              dev: 'make dev',
              build: 'make build',
            },
            source: 'makefile',
          },
        },
        needs_verification: [],
      };

      expect(() => StructureAnalyzerOutputSchema.parse(structureOutput)).not.toThrow();
      expect(() => TechStackAnalyzerOutputSchema.parse(techStackOutput)).not.toThrow();

      const structureResult = StructureAnalyzerOutputSchema.parse(structureOutput);
      const techStackResult = TechStackAnalyzerOutputSchema.parse(techStackOutput);

      expect(structureResult.findings.automation?.makefiles?.[0].targets).toContain('dev');
      expect(techStackResult.findings.documented_commands?.by_task?.dev).toBe('make dev');
      expect(techStackResult.findings.documented_commands?.source).toBe('makefile');
    });
  });
});
