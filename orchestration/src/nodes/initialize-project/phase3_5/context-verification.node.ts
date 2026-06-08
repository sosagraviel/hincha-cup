import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { InitializeProjectState } from '../../../state/schemas/initialize-project.schema.js';
import { AgentFactory } from '../../../utils/shared/agent-factory/index.js';
import { retryWithEnhancedFeedback, DEFAULT_RETRY_CONFIG } from '../../../utils/enhanced-retry.js';
import type { ValidationResult } from '../../../utils/validator.js';
import { logger } from '../../../utils/logger.js';
import { resolveTempPath } from '../../../utils/provider-paths.js';
import { getInitializeProjectPhase } from '../../../services/framework/debug-store/index.js';
import { getFrameworkAgentPath } from '../shared/index.js';
import { validateClaudeMdContent } from '../phase3/validators/validate-claude-md-content.js';
import { detectNonPortableAbsolutePath } from '../phase3/validators/detect-non-portable-absolute-path.js';
import {
  extractClaudeMdBody,
  spliceClaudeMdBody,
  normalizeVerifierOutput,
} from './helpers/splice-claude-md.js';

const AGENT_NAME = 'context-verifier';
const AGENT_FILE = '08-context-verifier.md';
const EXECUTION_INSTRUCTIONS =
  'orchestration/src/nodes/initialize-project/phase3_5/prompts/execution-instructions.md';
const CONTENT_PLACEHOLDER = '{{CLAUDE_MD_CONTENT}}';

/**
 * Phase 3.5: Context Verification Node
 *
 * Audits the generated CLAUDE.md/AGENTS.md cheat-sheet from Phase 3 against the
 * real repository and repairs it: broken paths, file-placement rows, and
 * directory-tree entries are fixed to the correct path or removed, and
 * duplicate/garbage Services & Ports rows are collapsed. Unlike the closed-book
 * synthesizer, this verifier is open-book (`Read`/`Glob`/`Grep`).
 *
 * Best-effort and non-blocking: any failure (no synthesis on disk, agent error,
 * exhausted retries, un-spliceable output) logs a warning and leaves the
 * original Phase 3 synthesis untouched so Phase 4 still proceeds.
 *
 * Disk-first: reads and rewrites `synthesis-raw.md` (the artifact Phase 4
 * extracts), and mirrors the corrected blob into state for consistency.
 */
export async function contextVerificationNode(
  state: InitializeProjectState,
): Promise<Partial<InitializeProjectState>> {
  logger.blank();
  const phaseLogger = logger.child('Phase 3.5: Context Verification');

  const tempDir = state.temp_dir || resolveTempPath(state.project_path, 'initialize-project');
  const synthesisPath = join(tempDir, 'synthesis-raw.md');

  if (!existsSync(synthesisPath)) {
    phaseLogger.warn(' ⚠ No synthesis on disk to verify — skipping');
    return {};
  }

  const synthesisBlob = readFileSync(synthesisPath, 'utf-8');
  const originalBody = extractClaudeMdBody(synthesisBlob);
  if (!originalBody) {
    phaseLogger.warn(' ⚠ Could not locate CLAUDE.md section in synthesis — skipping');
    return {};
  }

  phaseLogger.info(' Verifying generated CLAUDE.md claims against the repository...');

  try {
    const instructionsTemplate = readFileSync(
      join(state.framework_path, EXECUTION_INSTRUCTIONS),
      'utf-8',
    );

    const validator = (output: string): ValidationResult => {
      const normalized = normalizeVerifierOutput(output);
      const errors = validateClaudeMdContent(normalized);
      const portability = detectNonPortableAbsolutePath(normalized);
      if (portability) errors.push(portability);
      const valid = errors.length === 0;
      return { valid, errors, data: valid ? normalized : null };
    };

    const agentInvoke = async (
      feedbackPrompt: string,
      resumeSessionId?: string,
      attemptNumber?: number,
    ): Promise<{ output: string; sessionId: string }> => {
      const inputPrompt =
        instructionsTemplate.replace(CONTENT_PLACEHOLDER, originalBody) +
        (feedbackPrompt ? `\n\n${feedbackPrompt}` : '');

      const factory = await AgentFactory.create();
      const agent = await factory.createAgent({
        agentName: AGENT_NAME,
        agentFilePath: getFrameworkAgentPath(state.framework_path, AGENT_FILE),
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        timeout: 600000,
        resumeSessionId,
        phase: getInitializeProjectPhase('phase3_5'),
        validator,
      });

      const result = await agent.invoke({ inputPrompt, attemptNumber });
      return { output: result.output, sessionId: result.sessionId };
    };

    const { data: correctedBody } = await retryWithEnhancedFeedback<string>(
      agentInvoke,
      validator,
      { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 },
      {
        projectPath: state.project_path,
        agentName: AGENT_NAME,
        phase: getInitializeProjectPhase('phase3_5'),
      },
    );

    const splicedBlob = spliceClaudeMdBody(synthesisBlob, correctedBody);
    if (!splicedBlob) {
      phaseLogger.warn(' ⚠ Could not splice corrected CLAUDE.md back — keeping original');
      return {};
    }

    writeFileSync(synthesisPath, splicedBlob);
    phaseLogger.success(' ✓ CLAUDE.md verified and repaired against the repository');

    return {
      phase3_synthesis: {
        synthesis_content: splicedBlob,
        timestamp: new Date().toISOString(),
        validation_passed: true,
      },
      current_phase: 'phase3_synthesis',
    };
  } catch (error) {
    const message = `Context verification skipped: ${(error as Error).message}`;
    phaseLogger.warn(` ⚠ ${message}`);
    return { warnings: [`[phase3_5] ${message}`] };
  }
}
