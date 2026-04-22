import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { AgentFactory } from '../../utils/shared/agent-factory/index.js';
import {
  buildPlannerPrompt,
  getProjectAgentPath,
} from '../../services/implement-ticket/shared/index.js';
import { resolveTempPath, resolveConfigPath } from '../../utils/provider-paths.js';

/**
 * Phase 2: Planning & Architecture Node
 *
 * This node creates an implementation plan:
 * - Reads context from Phase 1
 * - TODO: Spawns planner agent (Opus) with context + stack profile
 * - Extracts implementation plan, test plan, environment requirements
 * - Validates plan completeness
 * - Writes plans to disk
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 1 outputs from disk, NOT from state
 *
 * @param state - Current workflow state
 * @returns Updated state with phase2 completion flag
 */
export async function phase2PlanningNode(
  state: ImplementTicketState,
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir =
    state.temp_dir || resolveTempPath(projectPath, 'tickets', ticketId, 'artifacts');
  const phase2Dir = join(tempDir, 'phase2');

  console.log('\n[Phase 2: Planning] Starting planning...');

  const completionMarkerPath = join(phase2Dir, 'planning-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 2: Planning] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase3_environment',
      phase2_complete: true,
      phase2_planning: completionData.planning_data,
    };
  }

  try {
    console.log('[Phase 2: Planning] Validating Phase 1 completion...');
    const phase1Dir = join(tempDir, 'phase1');
    const phase1CompletionPath = join(phase1Dir, 'context-complete.json');
    const fullContextPath = join(phase1Dir, 'full-context.md');

    if (!existsSync(phase1CompletionPath) || !existsSync(fullContextPath)) {
      throw new Error('Phase 1 not complete. Run Phase 1 first or use --start-phase 1');
    }

    // Read context from disk (NOT from state!)
    const fullContext = readFileSync(fullContextPath, 'utf-8');
    console.log(`[Phase 2: Planning] ✓ Context loaded (${fullContext.length} characters)`);

    const phase0Dir = join(tempDir, 'phase0');
    const stackProfilePath = join(phase0Dir, 'stack-profile.json');

    if (!existsSync(stackProfilePath)) {
      throw new Error('Stack profile not found from Phase 0');
    }

    const stackProfile = JSON.parse(readFileSync(stackProfilePath, 'utf-8'));
    console.log(
      `[Phase 2: Planning] ✓ Stack profile loaded (primary language: ${stackProfile.primary_language || 'unknown'})`,
    );

    console.log('[Phase 2: Planning] Invoking planner agent...');

    const frameworkPath = state.framework_path;
    if (!frameworkPath) {
      throw new Error('framework_path not set in state');
    }

    // Declare variables outside try block so they're in scope for file writes
    let implementationPlan = '';
    let testPlan: any = {};
    let environmentRequirements: any = undefined;

    try {
      // Build planner prompt
      const inputPrompt = buildPlannerPrompt(ticketId, fullContext, stackProfile);

      // Create and invoke planner agent (Opus)
      const factory = await AgentFactory.create();
      const agent = await factory.createAgent({
        agentName: 'planner',
        agentFilePath: getProjectAgentPath(projectPath, 'planner.md'),
        projectPath,
        frameworkPath,
        timeout: 600000, // 10 minutes
      });

      const result = await agent.invoke({ inputPrompt });
      const plannerOutput = result.output;

      console.log('[Phase 2: Planning] ✓ Planner agent completed');

      // Parse planner output to extract structured plan data
      // The planner should return markdown with clear sections
      implementationPlan = plannerOutput;

      // Extract test plan from planner output
      // Look for "## Test Plan" or "## Testing" section
      const testPlanMatch = plannerOutput.match(
        /##\s+Test(?:ing)?\s+Plan\s*\n([\s\S]*?)(?=\n##|$)/i,
      );
      const testPlanText = testPlanMatch ? testPlanMatch[1].trim() : '';

      // Build structured test plan
      testPlan = {
        unit_tests: {
          required: testPlanText.toLowerCase().includes('unit test'),
          frameworks: stackProfile.testing_frameworks || {},
          coverage_target: 80,
        },
        integration_tests: {
          required: testPlanText.toLowerCase().includes('integration test'),
          frameworks: stackProfile.testing_frameworks || {},
        },
        e2e_tests: {
          required:
            testPlanText.toLowerCase().includes('e2e') ||
            testPlanText.toLowerCase().includes('end-to-end'),
          frameworks: stackProfile.testing_frameworks || {},
        },
        details: testPlanText,
      };

      // Extract environment requirements from planner output
      // Look for "## Environment" section
      const envMatch = plannerOutput.match(
        /##\s+Environment(?:\s+Requirements)?\s*\n([\s\S]*?)(?=\n##|$)/i,
      );
      const envText = envMatch ? envMatch[1].trim() : '';

      if (envText && envText.length > 0) {
        // Check if Docker is mentioned
        const requiresDocker = envText.toLowerCase().includes('docker');

        // Extract environment variables
        const envVarMatches = envText.match(/[A-Z_][A-Z0-9_]*=/g) || [];
        const envVars = envVarMatches.map((match) => match.replace('=', ''));

        environmentRequirements = {
          docker: {
            required: requiresDocker,
            services: requiresDocker ? ['app'] : [],
          },
          env_vars: envVars,
          details: envText,
        };
      } else {
        // No environment requirements mentioned
        environmentRequirements = undefined;
      }

      console.log('[Phase 2: Planning] ✓ Plans extracted and structured');
    } catch (error: any) {
      // If agent invocation fails, provide helpful error message
      throw new Error(
        `Planner agent invocation failed: ${error.message}\n` +
          `Make sure initialize-project has generated the planner agent at:\n` +
          resolveConfigPath(projectPath, 'agents/planner.md'),
      );
    }

    // 5. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 2: Planning] Writing outputs to disk...');
    mkdirSync(phase2Dir, { recursive: true });

    writeFileSync(join(phase2Dir, 'implementation-plan.md'), implementationPlan);

    writeFileSync(join(phase2Dir, 'test-plan.json'), JSON.stringify(testPlan, null, 2));

    if (environmentRequirements) {
      writeFileSync(
        join(phase2Dir, 'environment-requirements.json'),
        JSON.stringify(environmentRequirements, null, 2),
      );
    }

    const planningData = {
      implementation_plan: implementationPlan,
      test_plan: testPlan,
      environment_requirements: environmentRequirements,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(join(phase2Dir, 'planning-data.json'), JSON.stringify(planningData, null, 2));

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          planning_data: planningData,
        },
        null,
        2,
      ),
    );

    console.log('[Phase 2: Planning] ✓ Outputs written to disk');
    console.log(`[Phase 2: Planning] ✓ Phase complete (outputs: ${phase2Dir})`);

    // 6. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase3_environment',
      phase2_complete: true,
      phase2_planning: planningData,
    };
  } catch (error) {
    const errorMessage = `Planning failed: ${(error as Error).message}`;
    console.error(`[Phase 2: Planning] ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
