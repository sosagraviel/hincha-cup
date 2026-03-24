import type { InitializeProjectState } from "../../../state/schemas/initialize-project.schema.js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  generateFrameworkConfig,
  type StackProfile,
} from "../../../utils/config-generator.js";
import { logger } from "../../../utils/logger.js";
import {
  countFilesByLanguage,
  type FileCountResult,
} from "../../../utils/file-counter.js";
import {
  detectWorkspaces,
  type WorkspaceDetectionResult,
} from "../../../utils/workspace-detector.js";

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

    const claudeMatch = synthesisContent.match(
      /# CLAUDE\.md Content\s*\n+([\s\S]*?)(?=\n+---\s*\n+# project-context)/,
    );
    if (!claudeMatch) {
      throw new Error("Could not find CLAUDE.md Content section in synthesis");
    }
    const claudeMdContent = claudeMatch[1].trim();
    const claudeMdLines = claudeMdContent.split("\n").length;
    phaseLogger.success(`✓ Extracted CLAUDE.md (${claudeMdLines} lines)`);

    const contextMatch = synthesisContent.match(
      /# project-context\/SKILL\.md Content\s*\n+([\s\S]*$)/,
    );
    if (!contextMatch) {
      throw new Error(
        "Could not find project-context/SKILL.md Content section in synthesis",
      );
    }
    const projectContextContent = contextMatch[1].trim();
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
      "project-context",
    );
    mkdirSync(projectContextDir, { recursive: true });
    const projectContextPath = join(projectContextDir, "SKILL.md");
    writeFileSync(projectContextPath, projectContextContent);
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
    const languagesFromPhase1 = Array.isArray(structureFindings?.languages)
      ? structureFindings.languages.map((l: string) => l.toLowerCase())
      : [];

    phaseLogger.info(
      `  Languages from Phase 1: ${languagesFromPhase1.join(", ") || "none"}`,
    );

    // STEP 1: Count files by language (independent validation)
    phaseLogger.info(" Counting files by language for validation...");
    let fileCountResult: FileCountResult | undefined;
    try {
      fileCountResult = await countFilesByLanguage(state.project_path, 10);
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
      workspaceResult = await detectWorkspaces(state.project_path, 5);

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

    // Also extract from workspace dependencies
    const workspaces = structureFindings?.multi_stack?.workspaces || [];
    workspaces.forEach((ws: any) => {
      if (Array.isArray(ws.dependencies)) {
        ws.dependencies.forEach((dep: string) => {
          const depLower = dep.toLowerCase();
          // Frontend frameworks
          if (
            depLower.includes("react") ||
            depLower.includes("next") ||
            depLower.includes("vue") ||
            depLower.includes("angular") ||
            depLower.includes("grommet")
          ) {
            const frameworkName = dep.split(" ")[0].toLowerCase();
            if (!frontendFrameworks.includes(frameworkName)) {
              frontendFrameworks.push(frameworkName);
            }
          }
          // Backend frameworks
          if (
            depLower.includes("express") ||
            depLower.includes("flask") ||
            depLower.includes("django") ||
            depLower.includes("fastapi")
          ) {
            const frameworkName = dep.split(" ")[0].toLowerCase();
            if (!backendFrameworks.includes(frameworkName)) {
              backendFrameworks.push(frameworkName);
            }
          }
        });
      }
    });

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

    // Extract testing frameworks from file 03 (code-patterns-testing) and file 02 (tech-stack-dependencies)
    const testingFrameworks: Record<string, string[]> = {};

    // Source 1: Extract from code-patterns-testing (file 03) - has testing_framework field
    if (codePatternsFindings?.multi_stack?.workspaces) {
      for (const ws of codePatternsFindings.multi_stack.workspaces) {
        if (
          ws.language &&
          ws.testing_framework &&
          ws.testing_framework !== "none"
        ) {
          const lang = ws.language.toLowerCase();
          if (!testingFrameworks[lang]) testingFrameworks[lang] = [];
          if (!testingFrameworks[lang].includes(ws.testing_framework)) {
            testingFrameworks[lang].push(ws.testing_framework);
          }
        }
      }
    }

    // Source 2: Extract from tech-stack-dependencies (file 02) - check dependencies
    const knownTestingFrameworks = new Set([
      "pytest",
      "unittest",
      "nose",
      "coverage",
      "jest",
      "mocha",
      "jasmine",
      "vitest",
      "@playwright/test",
      "playwright",
      "junit",
      "testng",
      "rspec",
      "minitest",
      "cargo test",
      "testing",
      "testify",
    ]);

    if (techStackFindings?.dependencies?.by_package) {
      for (const [pkgName, deps] of Object.entries(
        techStackFindings.dependencies.by_package,
      )) {
        if (!deps || typeof deps !== "object") continue;
        const allDeps = {
          ...((deps as any).production || {}),
          ...((deps as any).dev || {}),
        };

        // Find workspace language for this package
        const workspace = techStackFindings?.multi_stack?.workspaces?.find(
          (w: any) =>
            w.path &&
            pkgName
              .toLowerCase()
              .includes(w.path.toLowerCase().split("/").pop()),
        );
        const lang = workspace?.language?.toLowerCase();
        if (!lang) continue;

        // Check dependencies for testing frameworks
        for (const depName of Object.keys(allDeps)) {
          if (
            knownTestingFrameworks.has(depName.toLowerCase()) ||
            knownTestingFrameworks.has(depName)
          ) {
            const framework = depName;
            if (!testingFrameworks[lang]) testingFrameworks[lang] = [];
            if (!testingFrameworks[lang].includes(framework)) {
              testingFrameworks[lang].push(framework);
            }
          }
        }
      }
    }

    phaseLogger.info(
      `  Testing frameworks detected: ${JSON.stringify(testingFrameworks)}`,
    );

    function inferWorkspaceType(workspace: any): string {
      const name = (workspace.name || workspace.path || "").toLowerCase();

      if (
        name.includes("web") ||
        name.includes("frontend") ||
        name.includes("ui")
      ) {
        return "frontend";
      }
      if (
        name.includes("backend") ||
        name.includes("api") ||
        name.includes("server")
      ) {
        return "backend";
      }
      if (
        name.includes("mobile") ||
        name.includes("ios") ||
        name.includes("android")
      ) {
        return "mobile";
      }
      if (
        name.includes("function") ||
        name.includes("lambda") ||
        name.includes("service")
      ) {
        return "service";
      }
      if (
        name.includes("lib") ||
        name.includes("package") ||
        name.includes("shared")
      ) {
        return "library";
      }

      return "service";
    }

    const rawWorkspaces = Array.isArray(
      structureFindings?.multi_stack?.workspaces,
    )
      ? structureFindings.multi_stack.workspaces
      : [];

    const detectedWorkspaces = rawWorkspaces.map((ws: any) => ({
      path: ws.path || "",
      language: ws.language || "javascript",
      type: inferWorkspaceType(ws),
      frameworks: ws.dependencies || [],
    }));

    const languageCounts: Record<string, number> = {};
    rawWorkspaces.forEach((ws: any) => {
      if (ws.language) {
        const lang = ws.language.toLowerCase();
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      }
    });
    const primaryLanguage =
      Object.keys(languageCounts).sort(
        (a, b) => languageCounts[b] - languageCounts[a],
      )[0] || undefined;

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

    const stackProfile: StackProfile = {
      languages: finalLanguages,
      primary_language: primaryLanguage,
      frameworks: {
        frontend: frontendFrameworks.length > 0 ? frontendFrameworks : [],
        backend: backendFrameworks.length > 0 ? backendFrameworks : [],
        mobile: [],
      },
      testing_frameworks:
        Object.keys(testingFrameworks).length > 0
          ? testingFrameworks
          : undefined,
      infrastructure:
        infrastructureFromPhase1.length > 0
          ? infrastructureFromPhase1
          : undefined,
      detected_workspaces:
        detectedWorkspaces.length > 0 ? detectedWorkspaces : undefined,
      file_counts: fileCountResult
        ? {
            total: fileCountResult.total_files,
            by_language: fileCountResult.by_language.map((lc) => ({
              language: lc.language,
              count: lc.count,
            })),
          }
        : undefined,
      workspaces:
        detectedWorkspaces.length > 0 ? detectedWorkspaces : undefined,
      multi_stack: workspaceResult?.is_monorepo
        ? {
            is_monorepo: true,
            workspaces: workspaceResult.workspaces.map((ws) => ({
              path: ws.path,
              language: ws.language,
              manifest: ws.manifest_file,
            })),
          }
        : undefined,
      package_manager: techStackFindings?.monorepo?.workspace_manager as
        | string
        | undefined,
      workspace_type: structureFindings?.repository_type as string | undefined,
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
