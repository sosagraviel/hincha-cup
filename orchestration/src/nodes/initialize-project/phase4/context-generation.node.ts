import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateFrameworkConfig } from './config-generator.js';
import type { StackProfile, Service } from '../../../schemas/stack-profile.schema.js';
import type {
  StructureAnalyzerOutput,
  TechStackAnalyzerOutput,
  CodePatternsAnalyzerOutput,
} from '../../../schemas/phase1-agent-outputs.schema.js';
import { logger } from '../../../utils/logger.js';
import { countFilesByLanguage, type FileCountResult } from './file-counter.js';
import { detectWorkspaces, type WorkspaceDetectionResult } from './workspace-detector.js';
import { extractAndWriteSynthesis } from './helpers/synthesis-extractor.js';
import { extractLanguagesFromPhase1 } from './helpers/language-extractor.js';
import {
  crossValidateWithFileCount,
  mergeWorkspaceLanguages,
} from './helpers/language-validator.js';
import { extractFrameworks } from './helpers/framework-extractor.js';
import { extractInfrastructure } from './helpers/infrastructure-extractor.js';
import { extractServicesFromPhase1Analyzers } from './helpers/service-extractor.js';
import { validateStackProfile } from './helpers/stack-profile-validator.js';
import {
  normalisePackageManager,
  normaliseWorkspaceTool,
} from './helpers/workspace-tool-normalizer.js';
import { resolveConfigPath, resolveTempPath } from '../../../utils/provider-paths.js';
import {
  PortablePathResolver,
  PortableWriter,
  asAbsolutePath,
} from '../../../services/framework/portable-paths/index.js';
import { FrameworkConfigSchema } from '../../../schemas/framework-config.schema.js';
import { buildCatalogFromConsolidation } from '../phase3/helpers/build-catalog-from-consolidation.js';
import { renderGettingStarted } from './render-getting-started.js';
import { basename } from 'path';

/**
 * Phase 4: Context Generation Node
 *
 * Splits the Phase 3 synthesis blob into its five sections and persists them:
 *   1. CLAUDE.md (or AGENTS.md on Codex) → `<project>/.claude/CLAUDE.md`
 *   2. code-conventions/SKILL.md         → `<project>/.claude/skills/code-conventions/SKILL.md`
 *   3. multi-file-workflows/SKILL.md     → `<project>/.claude/skills/multi-file-workflows/SKILL.md`
 *   4. testing-conventions/SKILL.md      → `<project>/.claude/skills/testing-conventions/SKILL.md`
 *   5. Architectural Narrative           → `<tempDir>/architectural-narrative.md`
 *      (descriptive prose; consumed by the wiki-generator in Phase 4b. It is
 *      NOT a skill.)
 *
 * Then runs the stack-detection / file-counting / workspace-detection
 * utilities and writes `framework-config.json`. Pure regex extraction — no
 * LLM calls in this node.
 *
 * @param state - Current workflow state
 * @returns Updated state with context generation results
 */
export async function contextGenerationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child('Phase 4: Context Generation');
  phaseLogger.info(' Starting file extraction...');

  // Read Phase 3 synthesis from disk (not from state)
  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  const synthesisPath = join(tempDir, 'synthesis-raw.md');

  if (!existsSync(synthesisPath)) {
    throw new Error(`Phase 3 synthesis file not found: ${synthesisPath}`);
  }

  phaseLogger.info(' Loading Phase 3 synthesis from disk...');
  const synthesisContent = readFileSync(synthesisPath, 'utf-8');
  phaseLogger.success(' ✓ Phase 3 synthesis loaded from disk');

  try {
    const synthesisResult = extractAndWriteSynthesis(
      synthesisContent,
      state.project_path,
      phaseLogger,
    );
    const {
      claudeMdContent,
      claudeMdPath,
      codeConventionsContent,
      codeConventionsPath,
      multiFileWorkflowsContent,
      multiFileWorkflowsPath,
      testingConventionsContent,
      testingConventionsPath,
      architecturalNarrative,
    } = synthesisResult;

    // Persist the architectural narrative to <tempDir>/architectural-narrative.md
    // so the wiki-preparation node (Phase 4b) can read it from disk like every
    // other upstream artifact. The narrative is descriptive prose only — no
    // YAML frontmatter, no skill semantics — so it lives in the run's temp
    // directory rather than under .claude/skills/.
    const architecturalNarrativePath = join(tempDir, 'architectural-narrative.md');
    writeFileSync(architecturalNarrativePath, architecturalNarrative, 'utf-8');
    phaseLogger.success(`✓ Written: ${architecturalNarrativePath}`);

    // Read Phase 1 analysis files from disk (not from state)
    phaseLogger.info(' Loading Phase 1 analysis from disk...');

    const phase1Dir = join(tempDir, 'phase1-outputs');
    if (!existsSync(phase1Dir)) {
      throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
    }

    const structureArchPath = join(phase1Dir, '01-structure-architecture.json');
    const techStackPath = join(phase1Dir, '02-tech-stack-dependencies.json');
    const codePatternsPath = join(phase1Dir, '03-code-patterns-testing.json');
    const dataFlowsPath = join(phase1Dir, '04-data-flows-integrations.json');

    if (!existsSync(structureArchPath) || !existsSync(techStackPath)) {
      throw new Error('Required Phase 1 analyzer outputs not found');
    }

    const structureArchData = JSON.parse(readFileSync(structureArchPath, 'utf-8'));
    const techStackData = JSON.parse(readFileSync(techStackPath, 'utf-8'));

    // Also read code-patterns-testing for testing_framework field
    const codePatternsData = existsSync(codePatternsPath)
      ? JSON.parse(readFileSync(codePatternsPath, 'utf-8'))
      : {
          agent_name: 'code-patterns-testing-analyzer',
          timestamp: new Date().toISOString(),
          findings: {},
        };

    // Read data-flows-integrations if it exists
    const dataFlowsData = existsSync(dataFlowsPath)
      ? JSON.parse(readFileSync(dataFlowsPath, 'utf-8'))
      : null;

    phaseLogger.success(' ✓ Phase 1 analysis loaded from disk');
    phaseLogger.info(' Extracting stack profile from Phase 1 analysis...');

    const structureFindings = structureArchData.findings;
    const techStackFindings = techStackData.findings;
    const codePatternsFindings = codePatternsData?.findings;

    const languagesFromPhase1 = extractLanguagesFromPhase1(structureFindings, techStackFindings);

    phaseLogger.info(`  Languages from Phase 1: ${languagesFromPhase1.join(', ') || 'none'}`);

    // STEP 1: Count files by language (independent validation)
    phaseLogger.info(' Counting files by language for validation...');
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
      phaseLogger.warn(' Continuing with agent-detected languages only');
    }

    // STEP 2: Cross-validate agent findings with file counts
    let detectedLanguages = new Set<string>(languagesFromPhase1);
    detectedLanguages = crossValidateWithFileCount(detectedLanguages, fileCountResult, phaseLogger);

    // STEP 3: Detect workspaces for monorepo projects
    phaseLogger.info(' Detecting workspaces...');
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
        phaseLogger.info(' Single-repo project (no additional workspaces)');
      }
    } catch (error) {
      phaseLogger.warn(
        ` Workspace detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // STEP 4: Merge workspace detection results with agent findings
    detectedLanguages = mergeWorkspaceLanguages(detectedLanguages, workspaceResult, phaseLogger);

    const finalLanguages = Array.from(detectedLanguages);

    const { frontendFrameworks, backendFrameworks } = extractFrameworks(structureFindings);

    phaseLogger.info(`  Frontend frameworks: ${frontendFrameworks.join(', ') || 'none'}`);
    phaseLogger.info(`  Backend frameworks: ${backendFrameworks.join(', ') || 'none'}`);

    const infrastructureFromPhase1 = extractInfrastructure(techStackFindings);

    phaseLogger.info(
      `  Infrastructure from Phase 1: ${infrastructureFromPhase1.join(', ') || 'none'}`,
    );

    // NOTE: Testing framework extraction now handled by extractServicesFromPhase1Analyzers()
    // Testing data comes from codePatternsFindings.services[].testing field
    // This legacy code that extracted from multi_stack.workspaces has been removed

    // STEP 5: Validate stack profile completeness
    phaseLogger.info(' Validating stack profile completeness...');
    validateStackProfile(finalLanguages, fileCountResult, phaseLogger);
    phaseLogger.success(' ✓ Stack profile validation passed');
    phaseLogger.info(`  Final languages: ${finalLanguages.join(', ')}`);

    // ========== EXTRACT SERVICES FROM PHASE 1 ANALYZERS ==========
    phaseLogger.info('📦 Extracting service configurations...');

    let services: Service[];
    try {
      services = extractServicesFromPhase1Analyzers(
        structureFindings,
        techStackFindings,
        codePatternsFindings,
        dataFlowsData?.findings,
      );
      phaseLogger.success(` ✓ Extracted ${services.length} manifest-based service(s)`);

      for (const service of services) {
        phaseLogger.info(
          `   ${service.id} (${service.type}) at ${service.path}: ${service.language} ${service.language_version || ''} - ${service.frameworks.main || 'no framework'}`,
        );
      }

      // ADD FALLBACK SERVICES: For languages with significant files but no manifest-based service
      // This ensures we generate implementers for utility scripts, test code, etc.
      if (fileCountResult) {
        const FALLBACK_THRESHOLD = 10; // Create fallback service if >= 10 files
        const existingLanguages = new Set(services.map((s) => s.language.toLowerCase()));
        let fallbackCount = 0;

        for (const langCount of fileCountResult.by_language) {
          const lang = langCount.language.toLowerCase();

          // Skip if we already have a service for this language
          if (existingLanguages.has(lang)) continue;

          // Skip if below threshold
          if (langCount.count < FALLBACK_THRESHOLD) continue;

          // Create generic fallback service for this language
          const fallbackService: Service = {
            id: `${lang}-scripts`,
            name: `${lang.charAt(0).toUpperCase() + lang.slice(1)} Scripts`,
            path: '.', // Root level (files scattered across project)
            type: 'library' as any, // Generic type for utility code
            language: lang,
            language_version: undefined, // Unknown without manifest
            frameworks: {}, // No framework detection for fallback services
            file_count: langCount.count,
          };

          services.push(fallbackService);
          fallbackCount++;
          phaseLogger.info(
            `   ${fallbackService.id} (${fallbackService.type}) at ${fallbackService.path}: ${fallbackService.language} - ${langCount.count} files (fallback service for utility code)`,
          );
        }

        if (fallbackCount > 0) {
          phaseLogger.success(
            ` ✓ Added ${fallbackCount} fallback service(s) for languages without manifests`,
          );
        }
      }

      // ========================================================================
      // FINAL FILTER: drop low-signal services regardless of how they were
      // discovered. The fallback path above already enforces a 10-file
      // floor, but the structure-architecture analyzer can surface
      // workspace-yaml-derived services like `seeds/` (gira run, 2026-05-04)
      // with `file_count: 2` and no `manifest_file`. Those entries cause
      // downstream noise: every Phase 5 implementer gets a placeholder
      // service it can't actually build for.
      //
      // Filter rule: drop a service when ALL of the following are true:
      //   1. It has no `manifest_file` (nothing tells us this is a real
      //      package/workspace).
      //   2. Its `file_count` is explicitly set AND below 5.
      //
      // Services with `file_count: undefined` are kept — that means the
      // analyzer didn't measure (e.g. older fixtures, partial output) and
      // we don't have evidence to drop. Manifest-backed services are kept
      // at any size — a freshly scaffolded package may legitimately have
      // only one file. Threshold is documented at `Service` in
      // `stack-profile.schema.ts`.
      const MIN_FILES_NO_MANIFEST = 5;
      const beforeFilter = services.length;
      services = services.filter((service) => {
        if (service.manifest_file) return true;
        if (service.file_count === undefined) return true;
        if (service.file_count >= MIN_FILES_NO_MANIFEST) return true;
        phaseLogger.info(
          `   ⏭  Dropping low-signal service "${service.id}" (no manifest, file_count=${service.file_count} < ${MIN_FILES_NO_MANIFEST})`,
        );
        return false;
      });
      if (services.length !== beforeFilter) {
        phaseLogger.info(
          `   Filtered ${beforeFilter - services.length} low-signal service(s); ${services.length} remaining`,
        );
      }
      if (services.length === 0) {
        throw new Error(
          'No services remain after filtering. Either manifest discovery failed or every ' +
            'discovered service has < 5 files and no manifest. Check Phase 1 structure analyzer output.',
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

      // METADATA: Repository-level information.
      //
      // Plan §C 1.2 (gira-exhaustive followup, 2026-05-05) — normalise
      // the workspace-tool / package-manager identifiers so the stack
      // profile carries canonical names (`"pnpm workspaces"`, `"Maven
      // multi-module"`, `"go workspaces"`, etc.) and the bare manager
      // name (`"pnpm"`, `"poetry"`, `"maven"`, `"cargo"`, …) regardless
      // of how the upstream tech-stack analyzer surfaced them. The
      // 2026-05-04 gira run produced `workspace_tool: "pnpm@10.2.1"`
      // (a Corepack version pin) and `package_manager: null` because
      // the analyzer's `monorepo.workspace_manager` was the raw
      // packageManager field; both helpers now decompose into the
      // canonical pair.
      //
      // Stack-agnostic: the normalisers cover JS/TS, Python, Ruby,
      // PHP, Java, Kotlin, Go, Rust, .NET, Scala, Elixir, plus
      // polyglot tools (Bazel, Pants, Please, Buck). When the
      // analyzer surfaces nothing, both fields are `undefined` —
      // never carry malformed strings into the schema.
      is_monorepo: workspaceResult?.is_monorepo || false,
      workspace_tool:
        normaliseWorkspaceTool(techStackFindings?.monorepo?.tool) ??
        normaliseWorkspaceTool(techStackFindings?.monorepo?.workspace_manager),
      package_manager:
        normalisePackageManager(techStackFindings?.monorepo?.package_manager) ??
        // Fallback: when the analyzer only emitted `workspace_manager`
        // (Corepack version-pin shape), strip the version and use the
        // bare manager name as a best-effort recovery.
        normalisePackageManager(techStackFindings?.monorepo?.workspace_manager),
      infrastructure: infrastructureFromPhase1.length > 0 ? infrastructureFromPhase1 : undefined,
      file_counts: fileCountResult
        ? {
            total: fileCountResult.total_files,
            by_language: fileCountResult.by_language.reduce(
              (acc, lc) => {
                acc[lc.language] = lc.count;
                return acc;
              },
              {} as Record<string, number>,
            ),
          }
        : undefined,
    };

    // Plan 15 §D.4 + §D.6: build the deterministic command catalog
    // from the Phase 2 consolidation and attach it to the stack profile
    // so framework-config.json carries the contract every downstream
    // skill / wiki / agent template depends on.
    const consolidationPath = join(tempDir, 'phase2-consolidation.json');
    if (existsSync(consolidationPath)) {
      try {
        const consolidationBlob = JSON.parse(readFileSync(consolidationPath, 'utf-8'));
        const catalogBundle = buildCatalogFromConsolidation(consolidationBlob);
        if (catalogBundle.automation) stackProfile.automation = catalogBundle.automation;
        if (catalogBundle.readme_run_sections) {
          stackProfile.readme_run_sections = catalogBundle.readme_run_sections;
        }
        stackProfile.command_catalog = catalogBundle.command_catalog;

        // Plan 15 §D.6: deterministically render
        // `docs/llm-wiki/wiki/getting-started.md` from the catalog +
        // README extracts. Pure rendering — no LLM, no editorial
        // decisions.
        const projectName = basename(state.project_path);
        const gettingStartedMd = renderGettingStarted({
          projectName,
          commandCatalog: catalogBundle.command_catalog,
          readmeRunSections: catalogBundle.readme_run_sections,
        });
        const wikiDir = join(state.project_path, 'docs', 'llm-wiki', 'wiki');
        mkdirSync(wikiDir, { recursive: true });
        const gettingStartedPath = join(wikiDir, 'getting-started.md');
        writeFileSync(gettingStartedPath, gettingStartedMd);
        phaseLogger.success(` ✓ Written: ${gettingStartedPath}`);
      } catch (e) {
        phaseLogger.warn(
          ` ⚠ Could not build command catalog from consolidation: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      phaseLogger.warn(
        ` ⚠ Phase 2 consolidation not found at ${consolidationPath} — skipping command catalog build`,
      );
    }

    const stackProfilePath = join(state.temp_dir!, 'stack-profile.json');
    writeFileSync(stackProfilePath, JSON.stringify(stackProfile, null, 2));

    phaseLogger.info(' Generating framework-config.json...');

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

    const configPath = resolveConfigPath(state.project_path, 'framework-config.json');
    // Single chokepoint for all writes into <project>/.claude/ or .codex/.
    // PortableWriter asserts no /Users/<name>/... or /home/<name>/... strings
    // land in the persisted JSON, and validates the shape against the schema.
    const portableWriter = new PortableWriter(
      new PortablePathResolver(asAbsolutePath(state.project_path)),
    );
    portableWriter.writeJson(asAbsolutePath(configPath), frameworkConfig);
    phaseLogger.success(`✓ Written: ${configPath}`);

    return {
      phase3_synthesis: {
        synthesis_content: synthesisContent,
        timestamp: new Date().toISOString(),
        validation_passed: true,
        extracted_files: {
          claude_md: claudeMdContent,
          code_conventions_md: codeConventionsContent,
          multi_file_workflows_md: multiFileWorkflowsContent,
          testing_conventions_md: testingConventionsContent,
        },
      },
      phase4_context: {
        claude_md_written: true,
        conventions_skills_written: true,
        architectural_narrative_written: true,
        stack_profile: stackProfile,
        framework_config_generated: true,
        timestamp: new Date().toISOString(),
      },
      framework_config_path: configPath,
      claude_md_path: claudeMdPath,
      code_conventions_path: codeConventionsPath,
      multi_file_workflows_path: multiFileWorkflowsPath,
      testing_conventions_path: testingConventionsPath,
      architectural_narrative_path: architecturalNarrativePath,
      current_phase: 'phase4_context',
    };
  } catch (error) {
    const errorMessage = `Context generation failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed',
    };
  }
}
