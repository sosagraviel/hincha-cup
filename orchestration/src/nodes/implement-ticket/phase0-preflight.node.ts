import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { ProjectConfigReaderService } from '../../services/implement-ticket/project-config-reader.service.js';

/**
 * Phase 0: Preflight Validation Node
 *
 * This node validates the environment before starting ticket implementation:
 * - Validates initialize-project was run (.claude/framework-config.json exists)
 * - Validates git repository state (clean working tree)
 * - Validates input source (--from-jira, --from-markdown, --from-input)
 * - Reads existing config using ProjectConfigReaderService (NO detection!)
 * - Validates prerequisites (gh CLI, docker if needed)
 * - WRITES TO DISK FIRST: Saves outputs to .claude-temp/implement-ticket/{TICKET_ID}/phase0/
 * - Returns minimal state for flow control only
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read-only: Only reads existing config, never detects/analyzes
 * - Fail-fast: Throws errors if prerequisites missing
 *
 * @param state - Current workflow state
 * @returns Updated state with phase0 completion flag
 */
export async function phase0PreflightNode(
  state: ImplementTicketState
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/implement-ticket', ticketId);
  const phase0Dir = join(tempDir, 'phase0');

  console.log('\n[Phase 0: Preflight] Starting validation...');

  // 1. Check if already complete (idempotency)
  const completionMarkerPath = join(phase0Dir, 'preflight-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 0: Preflight] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase1_context',
      phase0_complete: true,
      temp_dir: tempDir,
      phase0_preflight: completionData.preflight_data
    };
  }

  try {
    // 2. Validate initialize-project was run
    console.log('[Phase 0: Preflight] Checking project initialization...');
    if (!ProjectConfigReaderService.isProjectInitialized(projectPath)) {
      throw new Error(
        `Project not initialized. File not found: ${projectPath}/.claude/framework-config.json\n` +
        `Run initialize-project first: npm run initialize`
      );
    }
    console.log('[Phase 0: Preflight] ✓ Project initialized');

    // 3. Read existing config (NO detection!)
    console.log('[Phase 0: Preflight] Reading project configuration...');
    const configReader = new ProjectConfigReaderService(projectPath);
    const frameworkConfig = configReader.readFrameworkConfig();
    const stackProfile = configReader.readStackProfile();
    const testCommands = configReader.getTestCommands();

    console.log(`[Phase 0: Preflight] ✓ Config loaded (primary language: ${stackProfile.primary_language || 'unknown'})`);

    // 4. Validate git repository state
    console.log('[Phase 0: Preflight] Checking git status...');
    let gitClean = false;
    try {
      const gitStatus = execSync('git status --porcelain', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      if (gitStatus !== '') {
        throw new Error(
          `Working directory not clean. Please commit or stash changes.\n` +
          `Run: git status`
        );
      }
      gitClean = true;
      console.log('[Phase 0: Preflight] ✓ Git working tree clean');
    } catch (error: any) {
      if (error.message.includes('not a git repository')) {
        throw new Error(
          `Not a git repository. Please initialize git first.\n` +
          `Run: git init`
        );
      }
      throw error;
    }

    // 5. Validate input source
    console.log('[Phase 0: Preflight] Validating input source...');
    const inputSource = state.input_source;
    const inputValue = state.input_value;

    if (!inputSource || !inputValue) {
      throw new Error(
        'Missing input source or value. Please provide:\n' +
        '  --from-jira <JIRA_URL>\n' +
        '  --from-markdown <FILE_PATH>\n' +
        '  --from-input <CONTEXT>'
      );
    }

    if (inputSource === 'markdown' && !existsSync(inputValue)) {
      throw new Error(`Markdown file not found: ${inputValue}`);
    }

    console.log(`[Phase 0: Preflight] ✓ Input source validated (${inputSource})`);

    // 6. Validate prerequisites
    console.log('[Phase 0: Preflight] Checking prerequisites...');

    // Check gh CLI (required for PR creation)
    try {
      execSync('which gh', { stdio: 'pipe' });
      console.log('[Phase 0: Preflight] ✓ gh CLI available');
    } catch {
      throw new Error(
        'GitHub CLI (gh) not found. Please install it:\n' +
        '  https://cli.github.com/manual/installation'
      );
    }

    // Check docker (optional, only warn if missing)
    if (configReader.hasDocker()) {
      try {
        execSync('which docker', { stdio: 'pipe' });
        console.log('[Phase 0: Preflight] ✓ Docker available');
      } catch {
        console.log('[Phase 0: Preflight] ⚠ Docker detected in stack but not available (will skip environment setup)');
      }
    }

    // 7. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 0: Preflight] Writing outputs to disk...');
    mkdirSync(phase0Dir, { recursive: true });

    // Save framework config
    writeFileSync(
      join(phase0Dir, 'framework-config.json'),
      JSON.stringify(frameworkConfig, null, 2)
    );

    // Save stack profile
    writeFileSync(
      join(phase0Dir, 'stack-profile.json'),
      JSON.stringify(stackProfile, null, 2)
    );

    // Save test commands
    writeFileSync(
      join(phase0Dir, 'test-commands.json'),
      JSON.stringify(testCommands, null, 2)
    );

    // Save preflight data
    const preflightData = {
      stack_profile: stackProfile,
      framework_config: frameworkConfig,
      test_commands: testCommands,
      git_clean: gitClean,
      timestamp: new Date().toISOString()
    };

    writeFileSync(
      join(phase0Dir, 'preflight-data.json'),
      JSON.stringify(preflightData, null, 2)
    );

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify({
        completed_at: new Date().toISOString(),
        ticket_id: ticketId,
        preflight_data: preflightData
      }, null, 2)
    );

    console.log('[Phase 0: Preflight] ✓ Outputs written to disk');
    console.log(`[Phase 0: Preflight] ✓ Phase complete (outputs: ${phase0Dir})`);

    // 8. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase1_context',
      phase0_complete: true,
      temp_dir: tempDir,
      phase0_preflight: preflightData
    };

  } catch (error) {
    const errorMessage = `Preflight validation failed: ${(error as Error).message}`;
    console.error(`[Phase 0: Preflight] ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed'
    };
  }
}
