import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { generateFrameworkConfig } from "./config-generator.js";
import type {
  StackProfile,
  Service,
  ServiceTesting,
  ServiceDatabase,
  ServiceEnvironment
} from "../../../schemas/stack-profile.schema.js";
import type {
  StructureAnalyzerOutput,
  TechStackAnalyzerOutput,
  CodePatternsAnalyzerOutput,
} from "../../../schemas/phase1-agent-outputs.schema.js";
import { logger } from "../../../utils/logger.js";
import {
  countFilesByLanguage,
  type FileCountResult,
} from "./file-counter.js";
import {
  detectWorkspaces,
  type WorkspaceDetectionResult,
} from "./workspace-detector.js";
import { extractSynthesisMarkdown } from "../../../utils/validator.js";

/**
 * Phase 4: Context Generation Node
 *
 * This node:
 * - Extracts CLAUDE.md and project-context content from Phase 3 synthesis using regex
 * - Runs stack detection using existing utilities
 * - Generates framework-config.json with all phase outputs
 * - Writes all files to project directory
 *
 * Features:
 * - Fast regex-based extraction (no LLM calls)
 * - Deterministic and reliable
 * - Matches bash flow implementation
 *
 * @param state - Current workflow state
 * @returns Updated state with context generation results
 */
export async function contextGenerationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child("Phase 4: Context Generation");
  phaseLogger.info(" Starting file extraction...");

  // Read Phase 3 synthesis from disk (not from state)
  const tempDir =
    state.temp_dir ||
    join(state.project_path, ".claude-temp/initialize-project");
  const synthesisPath = join(tempDir, "synthesis-raw.md");

  if (!existsSync(synthesisPath)) {
    throw new Error(`Phase 3 synthesis file not found: ${synthesisPath}`);
  }

  phaseLogger.info(" Loading Phase 3 synthesis from disk...");
  const synthesisContent = readFileSync(synthesisPath, "utf-8");
  phaseLogger.success(" ✓ Phase 3 synthesis loaded from disk");

  try {
    phaseLogger.info(" Extracting from markdown format...");

    // Use resilient extraction (handles preamble text like "Let me output...")
    const extracted = extractSynthesisMarkdown(synthesisContent);
    if (!extracted) {
      throw new Error(
        "Could not find required sections in synthesis output. " +
        "Expected '# CLAUDE.md Content', '---', and '# project-context/SKILL.md Content'"
      );
    }

    const claudeMdContent = extracted.claudemd;
    const claudeMdLines = claudeMdContent.split("\n").length;
    phaseLogger.success(`✓ Extracted CLAUDE.md (${claudeMdLines} lines)`);

    const projectContextContent = extracted.projectContext;
    const projectContextLines = projectContextContent.split("\n").length;
    phaseLogger.success(
      `✓ Extracted project-context/SKILL.md (${projectContextLines} lines)`,
    );

    const claudeMdPath = join(state.project_path, ".claude", "CLAUDE.md");
    mkdirSync(join(state.project_path, ".claude"), { recursive: true });
    writeFileSync(claudeMdPath, claudeMdContent);
    phaseLogger.success(`✓ Written: ${claudeMdPath}`);

    const projectContextDir = join(
      state.project_path,
      ".claude",
      "skills",
      "project-context",
    );
    mkdirSync(projectContextDir, { recursive: true });
    const projectContextPath = join(projectContextDir, "SKILL.md");

    // Ensure the skill name is always "project-context" (not project-specific name)
    const normalizedProjectContext = projectContextContent.replace(
      /^---\n([\s\S]*?)name:\s*[^\n]+\n([\s\S]*?)---/m,
      (match, before, after) => `---\n${before}name: project-context\n${after}---`
    );

    writeFileSync(projectContextPath, normalizedProjectContext);
    phaseLogger.success(`✓ Written: ${projectContextPath}`);

    // Read Phase 1 analysis files from disk (not from state)
    phaseLogger.info(" Loading Phase 1 analysis from disk...");

    const phase1Dir = join(tempDir, "phase1-outputs");
    if (!existsSync(phase1Dir)) {
      throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
    }

    const structureArchPath = join(phase1Dir, "01-structure-architecture.json");
    const techStackPath = join(phase1Dir, "02-tech-stack-dependencies.json");
    const codePatternsPath = join(phase1Dir, "03-code-patterns-testing.json");
    const dataFlowsPath = join(phase1Dir, "04-data-flows-integrations.json");

    if (!existsSync(structureArchPath) || !existsSync(techStackPath)) {
      throw new Error("Required Phase 1 analyzer outputs not found");
    }

    const structureArchData = JSON.parse(
      readFileSync(structureArchPath, "utf-8"),
    );
    const techStackData = JSON.parse(readFileSync(techStackPath, "utf-8"));

    // Also read code-patterns-testing for testing_framework field
    const codePatternsData = existsSync(codePatternsPath)
      ? JSON.parse(readFileSync(codePatternsPath, "utf-8"))
      : {
          agent_name: "code-patterns-testing-analyzer",
          timestamp: new Date().toISOString(),
          findings: {},
        };

    // Read data-flows-integrations if it exists
    const dataFlowsData = existsSync(dataFlowsPath)
      ? JSON.parse(readFileSync(dataFlowsPath, "utf-8"))
      : null;

    phaseLogger.success(" ✓ Phase 1 analysis loaded from disk");
    phaseLogger.info(" Extracting stack profile from Phase 1 analysis...");

    const structureFindings = structureArchData.findings as any;
    const techStackFindings = techStackData.findings as any;
    const codePatternsFindings = codePatternsData?.findings as any;

    // Extract languages from structure analyzer
    // Handle both array format ["typescript", "python"] and object format {"backend": "TypeScript 5.8.x", "frontend": "..."}
    let languagesFromPhase1: string[] = [];

    if (Array.isArray(structureFindings?.tech_stack?.languages)) {
      // Array format: ["typescript", "python"]
      languagesFromPhase1 = structureFindings.tech_stack.languages.map((l: string) => l.toLowerCase());
    } else if (typeof structureFindings?.tech_stack?.languages === 'object' && structureFindings.tech_stack.languages !== null) {
      // Object format: {"backend": "TypeScript 5.8.x", "frontend": "JavaScript"}
      // Extract unique language names from values (e.g., "TypeScript 5.8.x" -> "typescript")
      const languageValues = Object.values(structureFindings.tech_stack.languages) as string[];
      const uniqueLanguages = new Set<string>();

      for (const langStr of languageValues) {
        // Extract base language name (e.g., "TypeScript 5.8.x" -> "typescript")
        const match = langStr.match(/^([a-zA-Z]+)/);
        if (match) {
          uniqueLanguages.add(match[1].toLowerCase());
        }
      }

      languagesFromPhase1 = Array.from(uniqueLanguages);
    } else if (Array.isArray(structureFindings?.languages)) {
      // Fallback: check top-level languages field
      languagesFromPhase1 = structureFindings.languages.map((l: string) => l.toLowerCase());
    } else if (typeof structureFindings?.languages === 'object' && structureFindings.languages !== null) {
      // Fallback: object format at top level
      const languageValues = Object.values(structureFindings.languages) as string[];
      const uniqueLanguages = new Set<string>();

      for (const langStr of languageValues) {
        const match = langStr.match(/^([a-zA-Z]+)/);
        if (match) {
          uniqueLanguages.add(match[1].toLowerCase());
        }
      }

      languagesFromPhase1 = Array.from(uniqueLanguages);
    }

    // Additional extraction: Check nested backend/frontend language fields
    // Common in structure and tech-stack analyzer outputs
    const languageSet = new Set<string>(languagesFromPhase1);

    // Check structure analyzer's backend.language field
    if (structureFindings?.backend?.language) {
      const match = structureFindings.backend.language.match(/^([a-zA-Z]+)/);
      if (match) {
        languageSet.add(match[1].toLowerCase());
      }
    }

    // Check structure analyzer's frontend.language field
    if (structureFindings?.frontend?.language) {
      const match = structureFindings.frontend.language.match(/^([a-zA-Z]+)/);
      if (match) {
        languageSet.add(match[1].toLowerCase());
      }
    }

    // Check tech-stack analyzer's backend.language field
    if (techStackFindings?.backend?.language) {
      const match = techStackFindings.backend.language.match(/^([a-zA-Z]+)/);
      if (match) {
        languageSet.add(match[1].toLowerCase());
      }
    }

    // Check tech-stack analyzer's frontend.language field
    if (techStackFindings?.frontend?.language) {
      const match = techStackFindings.frontend.language.match(/^([a-zA-Z]+)/);
      if (match) {
        languageSet.add(match[1].toLowerCase());
      }
    }

    // Update the final languages array
    languagesFromPhase1 = Array.from(languageSet);

    phaseLogger.info(
      `  Languages from Phase 1: ${languagesFromPhase1.join(", ") || "none"}`,
    );

    // STEP 1: Count files by language (independent validation)
    phaseLogger.info(" Counting files by language for validation...");
    let fileCountResult: FileCountResult | undefined;
    try {
      fileCountResult = await countFilesByLanguage(state.project_path, 10, state.framework_path);
      phaseLogger.success(
        ` ✓ Found ${fileCountResult.total_files} files across ${fileCountResult.by_language.length} languages`,
      );

      // Log breakdown
      for (const langCount of fileCountResult.by_language) {
        phaseLogger.info(`   ${langCount.language}: ${langCount.count} files`);
      }
    } catch (error) {
      phaseLogger.warn(
        ` File counting failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      phaseLogger.warn(" Continuing with agent-detected languages only");
    }

    // STEP 2: Cross-validate agent findings with file counts
    const detectedLanguages = new Set<string>(languagesFromPhase1);

    if (fileCountResult) {
      for (const langCount of fileCountResult.by_language) {
        const lang = langCount.language.toLowerCase();

        // If file counter found significant files but agent missed it
        if (langCount.count >= 5 && !detectedLanguages.has(lang)) {
          phaseLogger.warn(
            ` Agent missed ${lang} (${langCount.count} files) - adding to stack profile`,
          );
          detectedLanguages.add(lang);
        }
      }
    }

    // STEP 3: Detect workspaces for monorepo projects
    phaseLogger.info(" Detecting workspaces...");
    let workspaceResult: WorkspaceDetectionResult | undefined;
    try {
      workspaceResult = await detectWorkspaces(state.project_path, 5, state.framework_path);

      if (workspaceResult.is_monorepo) {
        phaseLogger.success(
          ` ✓ Monorepo detected with ${workspaceResult.total_workspaces} workspaces`,
        );
        for (const ws of workspaceResult.workspaces) {
          phaseLogger.info(`   ${ws.path} (${ws.language} - ${ws.type})`);
        }
      } else {
        phaseLogger.info(" Single-repo project (no additional workspaces)");
      }
    } catch (error) {
      phaseLogger.warn(
        ` Workspace detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // STEP 4: Merge workspace detection results with agent findings
    if (workspaceResult && workspaceResult.is_monorepo) {
      // Extract unique languages from workspaces
      const workspaceLanguages = new Set(
        workspaceResult.workspaces.map((ws) => ws.language.toLowerCase()),
      );

      // Merge with detected languages
      for (const lang of workspaceLanguages) {
        if (!detectedLanguages.has(lang)) {
          phaseLogger.info(` Added ${lang} from workspace detection`);
          detectedLanguages.add(lang);
        }
      }
    }

    const finalLanguages = Array.from(detectedLanguages);

    const frameworksObj = structureFindings?.frameworks || {};
    const frontendFrameworks: string[] = [];
    const backendFrameworks: string[] = [];

    // (it has main, orm, testing, ui fields)
    if (frameworksObj.main) {
      // Determine if it's frontend or backend based on name
      const mainFramework = frameworksObj.main.split(" ")[0].toLowerCase(); // "Next.js 15.5.10" -> "next.js"
      if (
        mainFramework.includes("next") ||
        mainFramework.includes("react") ||
        mainFramework.includes("vue") ||
        mainFramework.includes("angular")
      ) {
        frontendFrameworks.push(mainFramework);
      } else {
        backendFrameworks.push(mainFramework);
      }
    }

    if (frameworksObj.ui) {
      const uiFrameworks = frameworksObj.ui
        .split("+")
        .map((f: string) => f.trim().split(" ")[0].toLowerCase());
      frontendFrameworks.push(...uiFrameworks);
    }

    // NOTE: Framework extraction from services array now handled by extractServicesFromPhase1Analyzers()
    // This legacy code that extracted from multi_stack.workspaces has been removed

    phaseLogger.info(
      `  Frontend frameworks: ${frontendFrameworks.join(", ") || "none"}`,
    );
    phaseLogger.info(
      `  Backend frameworks: ${backendFrameworks.join(", ") || "none"}`,
    );

    // Extract infrastructure from Phase 1 tech-stack-dependencies analyzer
    const infrastructureFromPhase1 = Array.isArray(
      techStackFindings?.infrastructure,
    )
      ? (techStackFindings.infrastructure as string[])
      : [];

    phaseLogger.info(
      `  Infrastructure from Phase 1: ${infrastructureFromPhase1.join(", ") || "none"}`,
    );

    // NOTE: Testing framework extraction now handled by extractServicesFromPhase1Analyzers()
    // Testing data comes from codePatternsFindings.services[].testing field
    // This legacy code that extracted from multi_stack.workspaces has been removed

    // ========== SERVICE EXTRACTION FUNCTIONS ==========

    /**
     * Extract testing configuration for a specific service
     */
    function extractTestingForService(serviceId: string, codePatternsFindings: any): ServiceTesting | undefined {
      const serviceTests = codePatternsFindings?.services?.find((s: any) => s.id === serviceId)?.testing;
      if (!serviceTests) return undefined;

      return {
        unit: serviceTests.unit,
        integration: serviceTests.integration,
        e2e: serviceTests.e2e,
      };
    }

    /**
     * Extract testing framework name for a specific service
     */
    function extractTestingFrameworkForService(serviceId: string, codePatternsFindings: any): string | undefined {
      const serviceTests = codePatternsFindings?.services?.find((s: any) => s.id === serviceId);
      return serviceTests?.frameworks?.testing;
    }

    /**
     * Extract databases for a specific service
     */
    function extractDatabasesForService(
      serviceId: string,
      techStackFindings: any,
      dataFlowsFindings?: any
    ): ServiceDatabase[] | undefined {
      const serviceDbs = techStackFindings?.services?.find((s: any) => s.id === serviceId)?.databases;
      if (!serviceDbs || serviceDbs.length === 0) return undefined;

      return serviceDbs.map((db: any) => ({
        type: db.type,
        client_library: db.client_library,
        orm: db.orm,
        orm_version: db.orm_version,
        migration_tool: db.migration_tool,
      }));
    }

    /**
     * Extract ORM for a specific service (from first database that has one)
     */
    function extractORMForService(serviceId: string, techStackFindings: any): string | undefined {
      const serviceDbs = techStackFindings?.services?.find((s: any) => s.id === serviceId)?.databases;
      if (!serviceDbs || serviceDbs.length === 0) return undefined;

      // Return ORM from first database that has one
      for (const db of serviceDbs) {
        if (db.orm) return db.orm;
      }

      return undefined;
    }

    /**
     * Extract environment configuration for a specific service
     */
    function extractEnvironmentForService(serviceId: string, structureFindings: any): ServiceEnvironment | undefined {
      const svcEnv = structureFindings?.services?.find((s: any) => s.id === serviceId)?.environment;
      if (!svcEnv) return undefined;

      return {
        port: svcEnv.port,
        env_file: svcEnv.env_file,
        deployment_target: svcEnv.deployment_target,
        docker_image: svcEnv.docker_image,
      };
    }

    /**
     * Extract package manager for a specific service
     */
    function extractPackageManagerForService(serviceId: string, techStackFindings: any): string | undefined {
      return techStackFindings?.services?.find((s: any) => s.id === serviceId)?.package_manager;
    }

    /**
     * Extract manifest file path for a specific service
     */
    function extractManifestFileForService(serviceId: string, techStackFindings: any): string | undefined {
      return techStackFindings?.services?.find((s: any) => s.id === serviceId)?.manifest_file;
    }

    /**
     * Extract services from Phase 1 analyzer outputs
     *
     * This is the main service extraction function that merges data from all Phase 1 analyzers
     * into a complete Service[] array for the service-centric stack profile.
     */
    function extractServicesFromPhase1Analyzers(
      structureFindings: any,
      techStackFindings: any,
      codePatternsFindings: any,
      dataFlowsFindings?: any
    ): Service[] {
      const services: Service[] = [];

      // Use explicit services[] from Agent 01 (structure-architecture)
      if (!structureFindings?.services || !Array.isArray(structureFindings.services)) {
        throw new Error(
          "Phase 1 structure analyzer did not output services[] array. " +
          "Cannot generate service-centric framework config. " +
          "This indicates the analyzer is using an outdated output format."
        );
      }

      for (const svc of structureFindings.services) {
        const service: Service = {
          id: svc.id,
          name: svc.name,
          path: svc.path, // DYNAMIC path from agent discovery
          type: svc.type,
          language: svc.language.toLowerCase(),
          language_version: svc.language_version,
          frameworks: {
            main: svc.frameworks?.main,
            orm: svc.frameworks?.orm || extractORMForService(svc.id, techStackFindings),
            ui: svc.frameworks?.ui,
            testing: svc.frameworks?.testing || extractTestingFrameworkForService(svc.id, codePatternsFindings),
            additional: svc.frameworks?.additional,
          },
          testing: extractTestingForService(svc.id, codePatternsFindings),
          databases: extractDatabasesForService(svc.id, techStackFindings, dataFlowsFindings),
          environment: svc.environment || extractEnvironmentForService(svc.id, structureFindings),
          file_count: svc.file_count,
          package_manager: svc.package_manager || extractPackageManagerForService(svc.id, techStackFindings),
          manifest_file: svc.manifest_file || extractManifestFileForService(svc.id, techStackFindings), // DYNAMIC path
        };

        services.push(service);
      }

      return services;
    }

    // END SERVICE EXTRACTION FUNCTIONS

    // NOTE: Workspace extraction from multi_stack.workspaces removed
    // Service data is now extracted directly from Phase 1 services[] array
    // via extractServicesFromPhase1Analyzers()

    // STEP 5: Validate stack profile completeness
    phaseLogger.info(" Validating stack profile completeness...");

    // Check 1: If file counts show significant files for a language, it must be in languages array
    if (fileCountResult) {
      for (const langCount of fileCountResult.by_language) {
        if (langCount.count >= 10) {
          const lang = langCount.language.toLowerCase();
          if (!finalLanguages.includes(lang)) {
            phaseLogger.error(
              ` Validation failed: ${langCount.count} ${lang} files found but language not in profile`,
            );
            throw new Error(
              `Stack profile missing ${lang} despite ${langCount.count} files detected. ` +
                `This will cause incorrect agent generation.`,
            );
          }
        }
      }
    }

    // Check 2: Warn if no files found for a detected language
    for (const lang of finalLanguages) {
      const fileCount = fileCountResult?.by_language.find(
        (lc) => lc.language.toLowerCase() === lang.toLowerCase(),
      );

      if (!fileCount || fileCount.count === 0) {
        phaseLogger.warn(
          ` Language ${lang} in profile but no files found - may be configuration-only`,
        );
      }
    }

    phaseLogger.success(" ✓ Stack profile validation passed");
    phaseLogger.info(`  Final languages: ${finalLanguages.join(", ")}`);

    // ========== EXTRACT SERVICES FROM PHASE 1 ANALYZERS ==========
    phaseLogger.info("📦 Extracting service configurations...");

    let services: Service[];
    try {
      services = extractServicesFromPhase1Analyzers(
        structureFindings,
        techStackFindings,
        codePatternsFindings,
        dataFlowsData?.findings
      );
      phaseLogger.success(` ✓ Extracted ${services.length} service(s)`);

      for (const service of services) {
        phaseLogger.info(
          `   ${service.id} (${service.type}) at ${service.path}: ${service.language} ${service.language_version || ''} - ${service.frameworks.main || 'no framework'}`
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      phaseLogger.error(` Failed to extract services: ${errorMsg}`);
      throw error;
    }

    // ========== BUILD SERVICE-CENTRIC STACK PROFILE ==========
    const stackProfile: StackProfile = {
      // CORE: Service-centric data (source of truth)
      services,

      // METADATA: Repository-level information
      is_monorepo: workspaceResult?.is_monorepo || false,
      workspace_tool: techStackFindings?.monorepo?.workspace_manager,
      package_manager: techStackFindings?.monorepo?.package_manager,
      infrastructure:
        infrastructureFromPhase1.length > 0
          ? infrastructureFromPhase1
          : undefined,
      file_counts: fileCountResult
        ? {
            total: fileCountResult.total_files,
            by_language: fileCountResult.by_language.reduce((acc, lc) => {
              acc[lc.language] = lc.count;
              return acc;
            }, {} as Record<string, number>),
          }
        : undefined,
    };

    const stackProfilePath = join(state.temp_dir!, "stack-profile.json");
    writeFileSync(stackProfilePath, JSON.stringify(stackProfile, null, 2));

    phaseLogger.info(" Generating framework-config.json...");

    // Prepare Phase 1 analysis data for config generator
    const phase1Data = {
      structure_architecture: structureArchData,
      tech_stack_dependencies: techStackData,
      code_patterns_testing: codePatternsData,
      ...(dataFlowsData && { data_flows_integrations: dataFlowsData }),
    };

    const frameworkConfig = generateFrameworkConfig(
      state.project_path,
      tempDir,
      phase1Data,
      synthesisContent,
      stackProfile,
      state.framework_path,
    );

    const configPath = join(
      state.project_path,
      ".claude",
      "framework-config.json",
    );
    writeFileSync(configPath, JSON.stringify(frameworkConfig, null, 2));
    phaseLogger.success(`✓ Written: ${configPath}`);

    return {
      phase3_synthesis: {
        synthesis_content: synthesisContent,
        timestamp: new Date().toISOString(),
        validation_passed: true,
        extracted_files: {
          claude_md: claudeMdContent,
          project_context_md: projectContextContent,
        },
      },
      phase4_context: {
        claude_md_written: true,
        project_context_written: true,
        stack_profile: stackProfile,
        framework_config_generated: true,
        timestamp: new Date().toISOString(),
      },
      framework_config_path: configPath,
      claude_md_path: claudeMdPath,
      project_context_path: projectContextPath,
      current_phase: "phase4_context",
    };
  } catch (error) {
    const errorMessage = `Context generation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: "failed",
    };
  }
}
