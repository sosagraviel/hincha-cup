import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import {
  initRetryState,
  updateRetryState,
  completeRetryState,
  shouldRetry,
  buildErrorFeedback,
  sleep
} from '../../utils/retry.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createAgentFromMarkdown } from '../../utils/agent-factory.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { generateFrameworkConfig, type StackProfile } from '../../utils/config-generator.js';

/**
 * Phase 4: Context Generation Node
 *
 * This node:
 * - Extracts CLAUDE.md and project-context content from Phase 3 synthesis
 * - Runs stack detection using existing utilities
 * - Generates framework-config.json with all phase outputs
 * - Writes all files to project directory
 *
 * Features:
 * - Uses question-consolidator agent to extract structured content
 * - Retry logic with exponential backoff (up to 5 attempts)
 * - Error feedback for self-correction
 * - Validates extracted content before writing
 *
 * @param state - Current workflow state
 * @returns Updated state with context generation results
 */
export async function contextGenerationNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  const agentName = 'question-consolidator';
  const agentFile = '06-question-consolidator.md';

  console.log('\n[Phase 4: Context Generation] Starting file extraction...');

  // Verify Phase 3 completed
  if (!state.phase3_synthesis?.synthesis_content) {
    throw new Error('Phase 3 synthesis not found in state');
  }

  // Initialize retry state
  let retryState = state.phase4_retry || initRetryState(5);

  const tempDir = state.temp_dir!;
  let additionalContext = '';

  // Retry loop
  while (shouldRetry(retryState)) {
    try {
      console.log(`[Phase 4: Context Generation] Attempt ${retryState.attempt + 1}/${retryState.max_attempts}`);

      // Build error feedback from previous attempts
      additionalContext = buildErrorFeedback(retryState);

      // Build context with synthesis output
      const synthesisContext = `
=== SYNTHESIS OUTPUT FROM PHASE 3 ===

${state.phase3_synthesis.synthesis_content}

=== YOUR TASK ===

Extract the following files from the synthesis output above:

1. CLAUDE.md - Project overview and context for Claude
2. project-context/SKILL.md - Project-specific skill documentation

Return ONLY a JSON object with this exact structure:
{
  "claude_md": "... full CLAUDE.md content ...",
  "project_context_md": "... full project-context/SKILL.md content ..."
}

IMPORTANT:
- Both files should be complete markdown documents
- CLAUDE.md should include project name, stack, architecture, patterns
- project-context/SKILL.md should include how to work with this project
- Do NOT include any other text outside the JSON object

${additionalContext}
`;

      // Create question consolidator agent
      const agent = await createAgentFromMarkdown({
        agentName,
        agentFile,
        projectPath: state.project_path,
        frameworkPath: state.framework_path,
        additionalContext: synthesisContext,
        timeout: 300000 // 5 minutes
      });

      // Invoke extraction agent
      const result = await agent.invoke({
        input: `Extract CLAUDE.md and project-context/SKILL.md from synthesis`
      });

      const rawOutput = result.output || result.content || String(result);

      // Validate and parse output
      const extraction = await validateExtraction(rawOutput);

      // Write CLAUDE.md
      const claudeMdPath = join(state.project_path, '.claude', 'CLAUDE.md');
      mkdirSync(join(state.project_path, '.claude'), { recursive: true });
      writeFileSync(claudeMdPath, extraction.claude_md);
      console.log(`[Phase 4: Context Generation] ✓ Written: ${claudeMdPath}`);

      // Write project-context/SKILL.md
      const projectContextDir = join(state.project_path, '.claude', 'project-context');
      mkdirSync(projectContextDir, { recursive: true });
      const projectContextPath = join(projectContextDir, 'SKILL.md');
      writeFileSync(projectContextPath, extraction.project_context_md);
      console.log(`[Phase 4: Context Generation] ✓ Written: ${projectContextPath}`);

      // Run stack detection to generate stack profile
      console.log('[Phase 4: Context Generation] Running stack detection...');
      const stackProfileRaw = await runStackDetection(state.project_path, state.framework_path);

      // Validate and parse stack profile
      const stackProfile: StackProfile = {
        languages: Array.isArray(stackProfileRaw.languages) ? stackProfileRaw.languages as string[] : [],
        primary_language: stackProfileRaw.primary_language as string | undefined,
        frameworks: {
          frontend: Array.isArray((stackProfileRaw.frameworks as any)?.frontend)
            ? (stackProfileRaw.frameworks as any).frontend as string[]
            : [],
          backend: Array.isArray((stackProfileRaw.frameworks as any)?.backend)
            ? (stackProfileRaw.frameworks as any).backend as string[]
            : [],
          mobile: Array.isArray((stackProfileRaw.frameworks as any)?.mobile)
            ? (stackProfileRaw.frameworks as any).mobile as string[]
            : []
        },
        testing_frameworks: stackProfileRaw.testing_frameworks as Record<string, string[]> | undefined,
        detected_workspaces: stackProfileRaw.detected_workspaces as any[] | undefined,
        file_counts: stackProfileRaw.file_counts as Record<string, number> | undefined,
        workspaces: stackProfileRaw.workspaces as any[] | undefined,
        package_manager: stackProfileRaw.package_manager as string | undefined,
        workspace_type: stackProfileRaw.workspace_type as string | undefined
      };

      // Save stack profile to temp dir for reference
      const stackProfilePath = join(tempDir, 'stack-profile.json');
      writeFileSync(stackProfilePath, JSON.stringify(stackProfile, null, 2));

      // Generate framework-config.json using TypeScript utility
      console.log('[Phase 4: Context Generation] Generating framework-config.json...');
      const frameworkConfig = generateFrameworkConfig(state, stackProfile, state.framework_path);

      const configPath = join(state.project_path, '.claude', 'framework-config.json');
      writeFileSync(configPath, JSON.stringify(frameworkConfig, null, 2));
      console.log(`[Phase 4: Context Generation] ✓ Written: ${configPath}`);

      // Mark as completed
      retryState = completeRetryState(retryState);

      return {
        phase3_synthesis: {
          ...state.phase3_synthesis,
          extracted_files: {
            claude_md: extraction.claude_md,
            project_context_md: extraction.project_context_md
          }
        },
        phase4_context: {
          claude_md_written: true,
          project_context_written: true,
          stack_profile: stackProfile,
          framework_config_generated: true,
          timestamp: new Date().toISOString()
        },
        framework_config_path: configPath,
        claude_md_path: claudeMdPath,
        project_context_path: projectContextPath,
        phase4_retry: retryState,
        current_phase: 'phase4_context'
      };

    } catch (error) {
      const errorMessage = `Context generation failed: ${(error as Error).message}`;
      retryState = updateRetryState(retryState, errorMessage);

      console.error(`[Phase 4: Context Generation] Error:`, errorMessage);

      if (shouldRetry(retryState) && retryState.next_delay_ms) {
        console.log(`[Phase 4: Context Generation] Retrying in ${retryState.next_delay_ms}ms...`);
        await sleep(retryState.next_delay_ms);
      }
    }
  }

  // Max retries exceeded
  const finalError = `Context generation failed after ${retryState.max_attempts} attempts. Last error: ${retryState.last_error}`;

  console.error(`[Phase 4: Context Generation] ✗ ${finalError}`);

  return {
    phase4_retry: retryState,
    errors: [...state.errors, finalError],
    current_phase: 'failed'
  };
}

/**
 * Validate and parse extraction output
 */
const ExtractionSchema = z.object({
  claude_md: z.string().min(100, 'CLAUDE.md content too short'),
  project_context_md: z.string().min(100, 'project-context/SKILL.md content too short')
});

async function validateExtraction(rawOutput: string): Promise<z.infer<typeof ExtractionSchema>> {
  // Extract JSON from output
  const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in agent output');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return ExtractionSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = (error as any).errors.map((err: any) => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Extraction validation failed: ${errors.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Run stack detection using existing framework utilities
 */
async function runStackDetection(
  projectPath: string,
  frameworkPath: string
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const stackCli = join(frameworkPath, 'utils', 'stack', 'cli.js');

    const proc = spawn('node', [stackCli, projectPath], {
      cwd: projectPath,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const profile = JSON.parse(stdout);
          resolve(profile);
        } catch (error) {
          reject(new Error(`Failed to parse stack detection output: ${(error as Error).message}`));
        }
      } else {
        reject(new Error(`Stack detection failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn stack detection CLI: ${error.message}`));
    });
  });
}

