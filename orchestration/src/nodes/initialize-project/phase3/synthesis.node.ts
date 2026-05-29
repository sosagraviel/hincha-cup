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

  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  const consolidationPath = join(tempDir, 'phase2-consolidation.json');

  if (!existsSync(consolidationPath)) {
    throw new Error(`Phase 2 consolidation file not found: ${consolidationPath}`);
  }

  phaseLogger.info(' Loading Phase 2 consolidation from disk...');
  const phase2Consolidation = JSON.parse(readFileSync(consolidationPath, 'utf-8'));
  phaseLogger.success(' ✓ Phase 2 consolidation loaded from disk');

  const expectedCatalog = buildCatalogFromConsolidation(phase2Consolidation).command_catalog;

  try {
    const validator = (output: string): ValidationResult => {
      const result = validateSynthesisOutput(output);
      const errors = [...result.errors];

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

    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
      attemptNumber?: number,
    ): Promise<{ output: string; sessionId: string }> => {
      const inputPrompt = buildSynthesisPrompt(phase2Consolidation, feedbackPrompt);

      const factory = await AgentFactory.create();

      const baseExcluded = getExcludedDirectories(state.project_path, state.framework_path);
      const synthesizerExcluded = baseExcluded.filter(
        (d) => d !== '.claude-temp' && d !== '.codex-temp',
      );

      const agent = await factory.createAgent({
        agentName,
        agentFilePath: getFrameworkAgentPath(state.framework_path, agentFile),
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        timeout: 900000,
        resumeSessionId,
        phase: getInitializeProjectPhase('phase3'),
        settingsPath: join(
          state.framework_path,
          'orchestration/src/nodes/initialize-project/phase3/settings.json',
        ),
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

    const synthesisWarnings = collectSynthesisWarnings(synthesisContent, tempDir, phaseLogger);

    return {
      phase3_synthesis: {
        synthesis_content: synthesisContent,
        timestamp: new Date().toISOString(),
        validation_passed: true,
      },
      current_phase: 'phase3_synthesis',
      ...(synthesisWarnings.length > 0 ? { warnings: synthesisWarnings } : {}),
    };
  } catch (error) {
    const errorMessage = `Synthesis failed: ${(error as Error).message}`;
    phaseLogger.error(` ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
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
