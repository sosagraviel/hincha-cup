import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { AgentFactory } from '../../utils/shared/agent-factory/index.js';
import {
  buildImplementerPrompt,
  getProjectAgentPath,
} from '../../services/implement-ticket/shared/index.js';

/**
 * Phase 4: Implementation Node
 *
 * This node implements the planned changes:
 * - Reads implementation plan from Phase 2
 * - Reads stack profile from Phase 0
 * - Detects primary language
 * - Invokes language-specific implementer agent (with fallback to generic)
 * - Tracks modified files via git
 * - Saves implementation log
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 2 outputs from disk, NOT from state
 *
 * @param state - Current workflow state
 * @returns Updated state with phase4 completion flag
 */
export async function phase4ImplementationNode(
  state: ImplementTicketState,
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const frameworkPath = state.framework_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/tickets', ticketId, 'artifacts');
  const phase4Dir = join(tempDir, 'phase4');

  console.log('\n[Phase 4: Implementation] Starting implementation...');

  const completionMarkerPath = join(phase4Dir, 'implementation-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 4: Implementation] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase5_testing',
      phase4_complete: true,
      phase4_implementation: completionData.implementation_data,
    };
  }

  try {
    console.log('[Phase 4: Implementation] Validating Phase 3 completion...');
    const phase3Dir = join(tempDir, 'phase3');
    const phase3CompletionPath = join(phase3Dir, 'environment-complete.json');

    if (!existsSync(phase3CompletionPath)) {
      throw new Error('Phase 3 not complete. Run Phase 3 first or use --start-phase 3');
    }
    console.log('[Phase 4: Implementation] ✓ Phase 3 verified');

    const phase2Dir = join(tempDir, 'phase2');
    const implementationPlanPath = join(phase2Dir, 'implementation-plan.md');

    if (!existsSync(implementationPlanPath)) {
      throw new Error('Implementation plan not found from Phase 2');
    }

    const implementationPlan = readFileSync(implementationPlanPath, 'utf-8');
    console.log(
      `[Phase 4: Implementation] ✓ Plan loaded (${implementationPlan.split('\n').length} lines)`,
    );

    const phase1Dir = join(tempDir, 'phase1');
    const fullContextPath = join(phase1Dir, 'full-context.md');

    if (!existsSync(fullContextPath)) {
      throw new Error('Context not found from Phase 1');
    }

    const fullContext = readFileSync(fullContextPath, 'utf-8');
    console.log(`[Phase 4: Implementation] ✓ Context loaded (${fullContext.length} characters)`);

    // 5. Read stack profile from Phase 0 (from disk)
    const phase0Dir = join(tempDir, 'phase0');
    const stackProfilePath = join(phase0Dir, 'stack-profile.json');

    if (!existsSync(stackProfilePath)) {
      throw new Error('Stack profile not found from Phase 0');
    }

    const stackProfile = JSON.parse(readFileSync(stackProfilePath, 'utf-8'));
    const primaryLanguage = stackProfile.primary_language || 'generic';

    console.log(`[Phase 4: Implementation] Primary language: ${primaryLanguage}`);

    // 6. Validate framework path
    if (!frameworkPath) {
      throw new Error('framework_path not set in state');
    }

    // 7. Invoke implementer agent
    console.log('[Phase 4: Implementation] Invoking implementer agent...');

    let implementerOutput: string;
    try {
      // Build implementer prompt
      const inputPrompt = buildImplementerPrompt(implementationPlan, fullContext);

      // Determine agent file based on primary language
      const agentFile = `implementer-${primaryLanguage.toLowerCase()}.md`;

      // Create and invoke implementer agent
      const factory = await AgentFactory.create();
      const agent = await factory.createAgent({
        agentName: `implementer-${primaryLanguage}`,
        agentFilePath: getProjectAgentPath(projectPath, agentFile),
        projectPath,
        frameworkPath,
        timeout: 900000, // 15 minutes
      });

      const result = await agent.invoke({ inputPrompt });
      implementerOutput = result.output;

      console.log('[Phase 4: Implementation] ✓ Implementer agent completed');
    } catch (error: any) {
      throw new Error(
        `Implementer agent invocation failed: ${error.message}\n` +
          `Make sure initialize-project has generated the implementer agent.`,
      );
    }

    // 9. Track modified files via git
    console.log('[Phase 4: Implementation] Tracking modified files...');

    let modifiedFiles: string[] = [];
    try {
      const gitDiff = execSync('git diff --name-only HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
      }).trim();

      modifiedFiles = gitDiff.split('\n').filter(Boolean);

      console.log(`[Phase 4: Implementation] ✓ Modified ${modifiedFiles.length} files`);
    } catch (error: any) {
      console.log(`[Phase 4: Implementation] ⚠ Could not track files: ${error.message}`);
    }

    // 10. Get file statistics
    let fileStatistics: any = {
      filesChanged: modifiedFiles.length,
      linesAdded: 0,
      linesRemoved: 0,
    };

    try {
      const gitStats = execSync('git diff --stat HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
      });

      const match = gitStats.match(
        /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/,
      );

      if (match) {
        fileStatistics = {
          filesChanged: parseInt(match[1], 10),
          linesAdded: match[2] ? parseInt(match[2], 10) : 0,
          linesRemoved: match[3] ? parseInt(match[3], 10) : 0,
        };
      }

      console.log(
        `[Phase 4: Implementation] Statistics: ${fileStatistics.filesChanged} files, ` +
          `+${fileStatistics.linesAdded}/-${fileStatistics.linesRemoved} lines`,
      );
    } catch (error: any) {
      console.log(`[Phase 4: Implementation] ⚠ Could not get statistics: ${error.message}`);
    }

    // 11. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 4: Implementation] Writing outputs to disk...');
    mkdirSync(phase4Dir, { recursive: true });

    writeFileSync(join(phase4Dir, 'implementation-log.md'), implementerOutput);

    writeFileSync(join(phase4Dir, 'files-modified.txt'), modifiedFiles.join('\n'));

    writeFileSync(join(phase4Dir, 'file-statistics.json'), JSON.stringify(fileStatistics, null, 2));

    const implementationData = {
      implementation_log: implementerOutput,
      files_modified: modifiedFiles,
      file_statistics: fileStatistics,
      primary_language: primaryLanguage,
      agent_used: `implementer-${primaryLanguage}`,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(
      join(phase4Dir, 'implementation-data.json'),
      JSON.stringify(implementationData, null, 2),
    );

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          implementation_data: implementationData,
        },
        null,
        2,
      ),
    );

    console.log('[Phase 4: Implementation] ✓ Outputs written to disk');
    console.log(`[Phase 4: Implementation] ✓ Phase complete (outputs: ${phase4Dir})`);

    // 12. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase5_testing',
      phase4_complete: true,
      phase4_implementation: implementationData,
    };
  } catch (error) {
    const errorMessage = `Implementation failed: ${(error as Error).message}`;
    console.error(`[Phase 4: Implementation] ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
