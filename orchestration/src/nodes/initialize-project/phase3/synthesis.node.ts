import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { AgentFactory } from '../../../utils/shared/agent-factory/index.js';
import { retryWithEnhancedFeedback, DEFAULT_RETRY_CONFIG } from '../../../utils/enhanced-retry.js';
import type { ValidationResult } from '../../../utils/validator.js';
import { validateSynthesisOutput, extractSynthesisMarkdown } from './validators/index.js';
import {
  detectMissingValidationRules,
  findValidationLibrariesInDependencies,
} from './validators/detect-missing-validation-rules.js';
import {
  detectEssentialCommandsOrderingViolations,
  formatOrderingViolations,
} from './validators/validate-essential-commands-ordering.js';
import { buildCatalogFromConsolidation } from './helpers/build-catalog-from-consolidation.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../../utils/logger.js';
import { buildSynthesisPrompt } from './prompt-builder.js';
import { getFrameworkAgentPath } from '../shared/index.js';
import { reasoningPrefix } from '../../../utils/shared/context-tags.js';
import { resolveTempPath } from '../../../utils/provider-paths.js';
import { getInitializeProjectPhase } from '../../../services/framework/debug-store/index.js';
import { getExcludedDirectories } from '../../../utils/shared/prompt-loader.js';

/**
 * Phase 3: Opus Synthesis Node
 *
 * Runs the architect-synthesizer agent (Opus / GPT-5 model) which:
 * - Takes consolidated findings from Phase 2 as its sole input
 * - Emits five sections in a single response:
 *   1. CLAUDE.md (or AGENTS.md on Codex) — cheat-sheet
 *   2. code-conventions/SKILL.md — prescriptive code rules
 *   3. multi-file-workflows/SKILL.md — cross-cutting checklists
 *   4. testing-conventions/SKILL.md — prescriptive test rules
 *   5. Architectural Narrative — descriptive prose for the wiki-generator
 *
 * Features:
 * - Uses the most capable model for deep reasoning
 * - Retry logic with exponential backoff
 * - Error feedback for self-correction
 * - Longer timeout (10 minutes)
 *
 * @param state - Current workflow state
 * @returns Updated state with synthesis output
 */
export async function synthesisNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child('Phase 3: Synthesis');

  const agentName = 'architect-synthesizer';
  const agentFile = '05-architect-synthesizer.md';

  phaseLogger.info(' Starting Opus synthesis...');

  // Read Phase 2 consolidation from disk (not from state)
  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  const consolidationPath = join(tempDir, 'phase2-consolidation.json');

  if (!existsSync(consolidationPath)) {
    throw new Error(`Phase 2 consolidation file not found: ${consolidationPath}`);
  }

  phaseLogger.info(' Loading Phase 2 consolidation from disk...');
  const phase2Consolidation = JSON.parse(readFileSync(consolidationPath, 'utf-8'));
  phaseLogger.success(' ✓ Phase 2 consolidation loaded from disk');

  // Plan 15 §D.4 + §D.8.2: build the deterministic command catalog
  // from the Phase 2 consolidation ONCE, here, so the validator can
  // assert ordering against it on every retry. The same catalog is
  // also embedded in the synthesizer's input prompt by `buildSynthesisPrompt`
  // → `trimSynthesisInput`.
  const expectedCatalog = buildCatalogFromConsolidation(phase2Consolidation).command_catalog;

  try {
    const validator = (output: string): ValidationResult => {
      // CRITICAL: The base validator MUST be IDENTICAL to the stop hook
      // validation. Uses the shared comprehensive validator.
      const result = validateSynthesisOutput(output);
      const errors = [...result.errors];

      // Plan 15 §D.8.2 hard validator: Essential Commands ordering. Only
      // run when the base validator already extracted a CLAUDE.md body
      // (otherwise there's nothing to inspect). The Stop hook does not
      // run this check (it has no catalog), so this external validator
      // is the single enforcement point.
      if (result.extracted?.claudemd) {
        const violations = detectEssentialCommandsOrderingViolations(
          result.extracted.claudemd,
          expectedCatalog,
        );
        if (violations.length > 0) {
          errors.push(...formatOrderingViolations(violations));
        }
      }

      const valid = errors.length === 0;
      return {
        valid,
        errors,
        data: valid ? output : null,
      };
    };

    // Define agent invocation function with feedback support
    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
      attemptNumber?: number,
    ): Promise<{ output: string; sessionId: string }> => {
      // Build input prompt using shared utility
      const contextPrompt = buildSynthesisPrompt(phase2Consolidation, feedbackPrompt);

      // Create agent using new interface
      const factory = await AgentFactory.create();

      // Provider-aware reasoning prefix (ultrathink for Claude, empty for Codex).
      // Synthesis reads actual code to fill gaps in Phase 2 consolidation, so deep
      // reasoning matters — for Codex that's delivered via --config model_reasoning_effort.
      const inputPrompt = `${reasoningPrefix(factory.getAuthConfig())}${contextPrompt}\n\nSynthesize comprehensive results for: ${state.project_path}`;

      // Plan v4 Phase F — drop `.claude-temp` / `.codex-temp` from the
      // exclusion list so the synthesizer can read its composer views
      // and the consolidation file. Same pattern proposed in Phase A.1
      // for the deny-rule fix; finally consumed here. The override is
      // threaded into BOTH the resolved settings.json deny list AND
      // the FRAMEWORK_EXCLUDED_DIRS env var (the path-restriction hook
      // reads it) so the two layers agree.
      const baseExcluded = getExcludedDirectories(state.project_path, state.framework_path);
      const synthesizerExcluded = baseExcluded.filter(
        (d) => d !== '.claude-temp' && d !== '.codex-temp',
      );

      const agent = await factory.createAgent({
        agentName,
        agentFilePath: getFrameworkAgentPath(state.framework_path, agentFile),
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        timeout: 900000, // 15 minutes (agent should use max 10 tool calls, mostly synthesis)
        resumeSessionId, // Pass session ID for context-preserving retry
        phase: getInitializeProjectPhase('phase3'),
        settingsPath: join(
          state.framework_path,
          'orchestration/src/nodes/initialize-project/phase3/settings.json',
        ),
        excludedDirsOverride: synthesizerExcluded,
        // Plan v4 Phase F: tell the layered restrict-synthesizer-reads
        // hook this is a synthesizer spawn so it activates. Without
        // FRAMEWORK_PHASE the hook silently no-ops (so ad-hoc Claude
        // CLI invocations are unaffected).
        extraEnv: {
          FRAMEWORK_PHASE: 'phase-3-synthesis',
        },
        // Internal validation layer for Codex. Claude enforces this via the
        // stop hook in settings.json; Codex has no blocking-hook equivalent, so
        // the impl runs this validator after each exec and resumes the session
        // with feedback on failure. Same function as the external validator.
        validator,
      });

      const result = await agent.invoke({ inputPrompt, attemptNumber });

      return {
        output: result.output,
        sessionId: result.sessionId,
      };
    };

    const synthesisPath = join(tempDir, 'synthesis-raw.md');

    const { data: synthesisContent } = await retryWithEnhancedFeedback<string>(
      agentInvoke,
      validator,
      { ...DEFAULT_RETRY_CONFIG, maxAttempts: 10 },
      {
        projectPath: state.project_path,
        agentName,
        phase: getInitializeProjectPhase('phase3'),
      },
    );
    writeFileSync(synthesisPath, synthesisContent);

    phaseLogger.success(' ✓ Synthesis complete');
    phaseLogger.info(`  - Output length: ${synthesisContent.length} characters`);

    // Plan §E.5 (2026-05-05) — soft signal that the synthesis omitted a
    // "Validation Rules" section even though the project ships at least
    // one validation library (Zod / class-validator / pydantic / etc.).
    // Surfaces as a phaseLogger.warn line; does NOT trigger retry. Reads
    // tech-stack-dependencies.json directly because Phase 2 consolidation
    // discards the raw dependency arrays once gaps are identified.
    const synthesisWarnings = collectSynthesisWarnings(synthesisContent, tempDir, phaseLogger);

    return {
      phase3_synthesis: {
        synthesis_content: synthesisContent,
        timestamp: new Date().toISOString(),
        validation_passed: true,
      },
      current_phase: 'phase3_synthesis',
      ...(synthesisWarnings.length > 0
        ? { warnings: [...state.warnings, ...synthesisWarnings] }
        : {}),
    };
  } catch (error) {
    const errorMessage = `Synthesis failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed',
    };
  }
}

/**
 * Phase 3 soft-signal collector. Currently emits a single warning when
 * the synthesized `code-conventions/SKILL.md` says nothing about
 * validation but Phase 1 saw a validation library in the dependency
 * tree. Logged as a warning at the end of the phase; non-fatal.
 *
 * Structured as a separate function so future soft signals (e.g. "code
 * conventions skill cites a deprecated framework version") can plug in
 * without touching the synthesis-orchestration code path.
 *
 * Reads `phase1-outputs/02-tech-stack-dependencies.json` directly
 * because Phase 2 consolidation produces gap questions, not dependency
 * arrays — the raw signal we need lives in Phase 1.
 */
function collectSynthesisWarnings(
  synthesisContent: string,
  tempDir: string,
  phaseLogger: ReturnType<typeof logger.child>,
): string[] {
  const warnings: string[] = [];

  const techStackPath = join(tempDir, 'phase1-outputs', '02-tech-stack-dependencies.json');
  if (!existsSync(techStackPath)) return warnings;

  let techStack: any;
  try {
    techStack = JSON.parse(readFileSync(techStackPath, 'utf-8'));
  } catch {
    return warnings;
  }

  const byService = techStack?.findings?.dependencies?.by_service ?? {};
  const dependencyArrays: Array<string[] | undefined> = [];
  for (const svc of Object.values(byService) as any[]) {
    if (svc && typeof svc === 'object') {
      dependencyArrays.push(svc.production, svc.development);
    }
  }
  const validationLibs = findValidationLibrariesInDependencies(dependencyArrays);

  const extracted = extractSynthesisMarkdown(synthesisContent);
  if (!extracted) return warnings;

  const validationWarning = detectMissingValidationRules(extracted.codeConventions, validationLibs);
  if (validationWarning) {
    phaseLogger.warn(` ${validationWarning}`);
    warnings.push(`[phase3] ${validationWarning}`);
  }

  return warnings;
}
