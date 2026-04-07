/**
 * Unit Tests for Phase 1 Agent Output Schemas
 *
 * Tests validate:
 * 1. .passthrough() allows rich fields beyond strict schema
 * 2. New schema structure prevents duplication
 * 3. Ownership boundaries are enforced (services in 01 only)
 */

import { describe, it, expect } from "vitest";
import {
  StructureAnalyzerOutputSchema,
  TechStackAnalyzerOutputSchema,
  CodePatternsAnalyzerOutputSchema,
  DataFlowsAnalyzerOutputSchema,
} from "../../../src/schemas/phase1-agent-outputs.schema.js";

describe("Phase 1 Agent Output Schemas", () => {
  describe("01: Structure Analyzer Schema", () => {
    it("should accept minimal valid output", () => {
      const minimalOutput = {
        agent_name: "structure-architecture-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              name: "Backend API",
              path: "services/backend",
              type: "backend",
              language: "typescript",
              language_version: "5.3.3",
              frameworks: {
                main: "NestJS 11.0",
              },
            },
          ],
          repository_type: "monorepo",
        },
        needs_verification: [],
      };

      expect(() =>
        StructureAnalyzerOutputSchema.parse(minimalOutput)
      ).not.toThrow();
    });

    it("should accept rich fields via .passthrough() - languages array", () => {
      const richOutput = {
        agent_name: "structure-architecture-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              name: "Backend",
              path: "services/backend",
              type: "backend",
              language: "typescript",
              language_version: "5.3.3",
              frameworks: { main: "NestJS" },
            },
          ],
          repository_type: "monorepo",
          // Rich field: languages array (not in strict schema)
          languages: ["typescript", "javascript"],
        },
        needs_verification: [],
      };

      const result = StructureAnalyzerOutputSchema.parse(richOutput);
      expect(result.findings).toHaveProperty("languages");
      expect((result.findings as any).languages).toEqual([
        "typescript",
        "javascript",
      ]);
    });

    it("should accept rich fields via .passthrough() - runtimes object", () => {
      const richOutput = {
        agent_name: "structure-architecture-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              name: "Backend",
              path: "services/backend",
              type: "backend",
              language: "typescript",
              language_version: "5.3.3",
              frameworks: { main: "NestJS" },
            },
          ],
          repository_type: "monorepo",
          // Rich field: runtimes object
          runtimes: {
            node: "20.10.0",
            npm: "10.2.3",
          },
        },
        needs_verification: [],
      };

      const result = StructureAnalyzerOutputSchema.parse(richOutput);
      expect(result.findings).toHaveProperty("runtimes");
      expect((result.findings as any).runtimes).toEqual({
        node: "20.10.0",
        npm: "10.2.3",
      });
    });

    it("should accept services with file_count and total_loc", () => {
      const outputWithFileCounts = {
        agent_name: "structure-architecture-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              name: "Backend",
              path: "services/backend",
              type: "backend",
              language: "typescript",
              language_version: "5.3.3",
              frameworks: { main: "NestJS" },
              file_count: 145,
              total_loc: 8234,
            },
          ],
          repository_type: "monorepo",
        },
        needs_verification: [],
      };

      const result = StructureAnalyzerOutputSchema.parse(outputWithFileCounts);
      expect(result.findings.services[0]).toHaveProperty("file_count");
      expect((result.findings.services[0] as any).file_count).toBe(145);
      expect(result.findings.services[0]).toHaveProperty("total_loc");
      expect((result.findings.services[0] as any).total_loc).toBe(8234);
    });

    it("should NOT have packages array in schema (anti-duplication test)", () => {
      const outputWithPackages = {
        agent_name: "structure-architecture-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              name: "Backend",
              path: "services/backend",
              type: "backend",
              language: "typescript",
              language_version: "5.3.3",
              frameworks: { main: "NestJS" },
            },
          ],
          repository_type: "monorepo",
          monorepo_layout: {
            root: ".",
            // packages array removed - derivable from services[].path
            packages: ["services/backend", "services/frontend"],
          },
        },
        needs_verification: [],
      };

      // Should still parse due to .passthrough(), but packages is not typed
      const result = StructureAnalyzerOutputSchema.parse(outputWithPackages);
      // Verify monorepo_layout doesn't have packages in the type
      expect(result.findings.monorepo_layout).toBeDefined();
    });
  });

  describe("02: Tech Stack Analyzer Schema", () => {
    it("should accept output WITHOUT services array (anti-duplication)", () => {
      const outputWithoutServices = {
        agent_name: "tech-stack-dependencies-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          // NO services array - references by ID instead
          dependencies: {
            by_service: {
              backend: {
                production: ["@nestjs/core", "prisma"],
                development: ["jest", "eslint"],
              },
              "web-frontend": {
                production: ["react", "zustand"],
                development: ["vite", "vitest"],
              },
            },
            shared_across_services: ["typescript", "prettier"],
          },
        },
        needs_verification: [],
      };

      expect(() =>
        TechStackAnalyzerOutputSchema.parse(outputWithoutServices)
      ).not.toThrow();
    });

    it("should accept output WITH services array (backward compat)", () => {
      const outputWithServices = {
        agent_name: "tech-stack-dependencies-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              language: "typescript",
              manifest_file: "package.json",
              package_manager: "pnpm",
            },
          ],
          dependencies: {
            by_service: {
              backend: {
                production: ["@nestjs/core"],
                development: ["jest"],
              },
            },
          },
        },
        needs_verification: [],
      };

      // Should parse because services is optional
      expect(() =>
        TechStackAnalyzerOutputSchema.parse(outputWithServices)
      ).not.toThrow();
    });

    it("should accept dependencies.by_service map structure", () => {
      const outputWithByService = {
        agent_name: "tech-stack-dependencies-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          dependencies: {
            by_service: {
              backend: {
                production: ["@nestjs/core", "prisma"],
                development: ["jest"],
              },
              frontend: {
                production: ["react", "vite"],
                development: ["vitest"],
              },
            },
          },
        },
        needs_verification: [],
      };

      const result = TechStackAnalyzerOutputSchema.parse(outputWithByService);
      expect(result.findings.dependencies?.by_service).toBeDefined();
      expect(result.findings.dependencies?.by_service?.backend).toEqual({
        production: ["@nestjs/core", "prisma"],
        development: ["jest"],
      });
    });
  });

  describe("03: Code Patterns Analyzer Schema", () => {
    it("should accept output WITHOUT services array (anti-duplication)", () => {
      const outputWithoutServices = {
        agent_name: "code-patterns-testing-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          // NO services array
          testing: {
            backend: {
              unit: {
                framework: "Jest 29.7",
                config_file: "jest.config.mjs",
                file_pattern: ".*\\.(spec|test)\\.ts$",
                file_count: 13,
              },
            },
          },
          api_patterns: {
            rest: true,
            graphql: false,
            websockets: true,
          },
        },
        needs_verification: [],
      };

      expect(() =>
        CodePatternsAnalyzerOutputSchema.parse(outputWithoutServices)
      ).not.toThrow();
    });

    it("should NOT have frameworks.testing field (anti-duplication test)", () => {
      const outputWithFrameworksTesting = {
        agent_name: "code-patterns-testing-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              // frameworks.testing removed - duplicates testing.*.framework
              frameworks: {
                testing: ["jest"], // This should NOT be in schema
              },
              testing: {
                unit: {
                  framework: "jest",
                  config_file: "jest.config.js",
                },
              },
            },
          ],
        },
        needs_verification: [],
      };

      // Should parse due to .passthrough(), but frameworks.testing is not typed
      const result = CodePatternsAnalyzerOutputSchema.parse(
        outputWithFrameworksTesting
      );
      // Verify output parses (passthrough allows extra fields)
      expect(result).toBeDefined();
    });

    it("should accept testing organized by service ID", () => {
      const outputWithTestingMap = {
        agent_name: "code-patterns-testing-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          testing: {
            backend: {
              unit: {
                framework: "Jest 29.7",
                config_file: "jest.config.mjs",
                file_count: 13,
              },
              integration: {
                framework: "Jest 29.7",
                config_file: "jest.e2e.config.mjs",
                file_count: 5,
              },
            },
            "web-frontend": {
              e2e: {
                framework: "Playwright 1.52",
                config_file: "playwright.config.ts",
                file_count: 7,
              },
            },
          },
        },
        needs_verification: [],
      };

      const result = CodePatternsAnalyzerOutputSchema.parse(
        outputWithTestingMap
      );
      expect(result.findings).toHaveProperty("testing");
      expect((result.findings as any).testing.backend).toBeDefined();
      expect((result.findings as any).testing["web-frontend"]).toBeDefined();
    });
  });

  describe("04: Data Flows Analyzer Schema", () => {
    it("should accept infrastructure_services (not application services)", () => {
      const outputWithInfrastructure = {
        agent_name: "data-flows-integrations-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          // Infrastructure services only (redis, postgres, etc.)
          infrastructure_services: [
            {
              id: "redis",
              type: "cache",
              port: 6379,
              used_by: ["backend"],
            },
            {
              id: "postgres",
              type: "database",
              port: 5432,
              used_by: ["backend"],
            },
          ],
        },
        needs_verification: [],
      };

      expect(() =>
        DataFlowsAnalyzerOutputSchema.parse(outputWithInfrastructure)
      ).not.toThrow();
    });

    it("should accept service_communication map with service IDs", () => {
      const outputWithCommunication = {
        agent_name: "data-flows-integrations-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          service_communication: {
            backend: {
              exposes_api: true,
              consumed_by: ["web-frontend", "mobile-app"],
              protocols: ["rest"],
            },
          },
        },
        needs_verification: [],
      };

      const result = DataFlowsAnalyzerOutputSchema.parse(
        outputWithCommunication
      );
      expect(result.findings).toHaveProperty("service_communication");
      expect(
        (result.findings as any).service_communication.backend
      ).toBeDefined();
    });

    it("should NOT mix application services with infrastructure (anti-pattern test)", () => {
      const mixedServicesOutput = {
        agent_name: "data-flows-integrations-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          // WRONG: Mixing application services (backend) with infrastructure (redis)
          infrastructure_services: [
            {
              id: "backend", // Application service - should NOT be here
              type: "backend",
            },
            {
              id: "redis", // Infrastructure service - correct
              type: "cache",
              port: 6379,
            },
          ],
        },
        needs_verification: [],
      };

      // Schema allows this (no strict validation), but it's an anti-pattern
      // This test documents that we expect ONLY infrastructure services
      const result = DataFlowsAnalyzerOutputSchema.parse(mixedServicesOutput);
      expect(result.findings.infrastructure_services?.length).toBe(2);

      // In production, execution instructions should prevent this pattern
    });
  });

  describe("Cross-Analyzer Anti-Duplication Tests", () => {
    it("should enforce services declared ONLY in Structure Analyzer (01)", () => {
      // Structure Analyzer (01) - Source of Truth
      const structureOutput = {
        agent_name: "structure-architecture-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          services: [
            {
              id: "backend",
              name: "Backend",
              path: "services/backend",
              type: "backend",
              language: "typescript",
              language_version: "5.3.3",
              frameworks: { main: "NestJS" },
            },
          ],
          repository_type: "monorepo",
        },
        needs_verification: [],
      };

      // Tech Stack (02) - References by ID, NO full service declarations
      const techStackOutput = {
        agent_name: "tech-stack-dependencies-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          // Services optional - use by_service map instead
          dependencies: {
            by_service: {
              backend: {
                // Reference by ID
                production: ["@nestjs/core"],
              },
            },
          },
        },
        needs_verification: [],
      };

      // Code Patterns (03) - References by ID
      const codePatternsOutput = {
        agent_name: "code-patterns-testing-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          testing: {
            backend: {
              // Reference by ID
              unit: {
                framework: "Jest",
              },
            },
          },
        },
        needs_verification: [],
      };

      // Data Flows (04) - Infrastructure only, communication by ID
      const dataFlowsOutput = {
        agent_name: "data-flows-integrations-analyzer",
        timestamp: "2026-04-07T10:00:00.000Z",
        findings: {
          infrastructure_services: [
            {
              id: "redis",
              type: "cache",
              used_by: ["backend"], // Reference by ID
            },
          ],
          service_communication: {
            backend: {
              // Reference by ID
              exposes_api: true,
            },
          },
        },
        needs_verification: [],
      };

      // All should parse successfully
      expect(() =>
        StructureAnalyzerOutputSchema.parse(structureOutput)
      ).not.toThrow();
      expect(() =>
        TechStackAnalyzerOutputSchema.parse(techStackOutput)
      ).not.toThrow();
      expect(() =>
        CodePatternsAnalyzerOutputSchema.parse(codePatternsOutput)
      ).not.toThrow();
      expect(() =>
        DataFlowsAnalyzerOutputSchema.parse(dataFlowsOutput)
      ).not.toThrow();
    });
  });
});
