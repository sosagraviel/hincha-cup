import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { EnvironmentManagerService } from '../../services/implement-ticket/environment-manager.service.js';
import { ScreenshotService } from '../../services/implement-ticket/screenshot.service.js';

/**
 * Phase 3: Environment Setup Node
 *
 * This node sets up the isolated development environment:
 * - Allocates deterministic port for ticket
 * - Generates Docker Compose override (if docker-compose.yml exists)
 * - Starts Docker services
 * - Initializes Playwright for screenshot capture
 * - Captures "before" screenshots
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 2 outputs from disk, NOT from state
 *
 * @param state - Current workflow state
 * @returns Updated state with phase3 completion flag
 */
export async function phase3EnvironmentNode(
  state: ImplementTicketState,
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/implement-ticket', ticketId);
  const phase3Dir = join(tempDir, 'phase3');

  console.log('\n[Phase 3: Environment] Starting environment setup...');

  const completionMarkerPath = join(phase3Dir, 'environment-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 3: Environment] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase4_implementation',
      phase3_complete: true,
      phase3_environment: completionData.environment_data,
    };
  }

  try {
    console.log('[Phase 3: Environment] Validating Phase 2 completion...');
    const phase2Dir = join(tempDir, 'phase2');
    const phase2CompletionPath = join(phase2Dir, 'planning-complete.json');

    if (!existsSync(phase2CompletionPath)) {
      throw new Error('Phase 2 not complete. Run Phase 2 first or use --start-phase 2');
    }
    console.log('[Phase 3: Environment] ✓ Phase 2 verified');

    const envManager = new EnvironmentManagerService(projectPath);

    console.log('[Phase 3: Environment] Setting up environment...');
    const envConfig = await envManager.setupEnvironment(ticketId, true);

    // 5. Capture "before" screenshots (if Playwright initialized)
    let beforeScreenshots: any[] = [];
    const screenshotsDir = join(phase3Dir, 'screenshots-before');

    if (envConfig.playwrightInitialized) {
      console.log('[Phase 3: Environment] Capturing "before" screenshots...');

      mkdirSync(screenshotsDir, { recursive: true });

      const screenshotService = new ScreenshotService(screenshotsDir);
      const page = envManager.getPlaywrightPage();

      if (page) {
        // Determine routes to capture
        const baseUrl = `http://localhost:${envConfig.port}`;
        const routes = ['/', '/about', '/contact']; // Default routes

        try {
          beforeScreenshots = await screenshotService.captureMultipleScreenshots(
            page,
            baseUrl,
            routes,
            'before',
          );

          console.log(`[Phase 3: Environment] ✓ Captured ${beforeScreenshots.length} screenshots`);
        } catch (error: any) {
          console.log(`[Phase 3: Environment] ⚠ Screenshot capture failed: ${error.message}`);
          console.log('[Phase 3: Environment] Continuing without screenshots');
          beforeScreenshots = [];
        }
      }
    } else {
      console.log('[Phase 3: Environment] Playwright not initialized, skipping screenshots');
    }

    // 6. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 3: Environment] Writing outputs to disk...');
    mkdirSync(phase3Dir, { recursive: true });

    writeFileSync(join(phase3Dir, 'environment-config.json'), JSON.stringify(envConfig, null, 2));

    if (beforeScreenshots.length > 0) {
      writeFileSync(
        join(phase3Dir, 'screenshots-before.json'),
        JSON.stringify(beforeScreenshots, null, 2),
      );
    }

    const environmentData = {
      environment_config: envConfig,
      screenshots_before: beforeScreenshots,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(
      join(phase3Dir, 'environment-data.json'),
      JSON.stringify(environmentData, null, 2),
    );

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          environment_data: environmentData,
        },
        null,
        2,
      ),
    );

    console.log('[Phase 3: Environment] ✓ Outputs written to disk');
    console.log(`[Phase 3: Environment] ✓ Phase complete (outputs: ${phase3Dir})`);

    // 7. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase4_implementation',
      phase3_complete: true,
      phase3_environment: environmentData,
    };
  } catch (error) {
    const errorMessage = `Environment setup failed: ${(error as Error).message}`;
    console.error(`[Phase 3: Environment] ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed',
    };
  }
}
