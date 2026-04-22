import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';
import { EnvironmentManagerService } from '../../services/implement-ticket/environment-manager.service.js';
import { resolveTempPath } from '../../utils/provider-paths.js';

/**
 * Phase 10: Cleanup Node
 *
 * This node performs cleanup operations:
 * - Stops Docker Compose services
 * - Removes Docker Compose override file
 * - Closes Playwright browser
 * - Archives artifacts to .tar.gz
 * - Optionally removes temporary files (keep by default for debugging)
 * - Non-blocking: Best-effort cleanup
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 9 outputs from disk, NOT from state
 * - Non-blocking: Cleanup failures are logged but don't fail the workflow
 *
 * @param state - Current workflow state
 * @returns Updated state with phase10 completion flag
 */
export async function phase10CleanupNode(
  state: ImplementTicketState,
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir =
    state.temp_dir || resolveTempPath(projectPath, 'tickets', ticketId, 'artifacts');
  const phase10Dir = join(tempDir, 'phase10');

  console.log('\n[Phase 10: Cleanup] Starting cleanup...');

  const completionMarkerPath = join(phase10Dir, 'cleanup-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 10: Cleanup] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'complete',
      phase10_complete: true,
      phase10_cleanup: completionData.cleanup_data,
    };
  }

  const cleanupLog: string[] = [];
  const cleanupErrors: string[] = [];

  try {
    console.log('[Phase 10: Cleanup] Validating Phase 9 completion...');
    const phase9Dir = join(tempDir, 'phase9');
    const phase9CompletionPath = join(phase9Dir, 'review-complete.json');

    if (!existsSync(phase9CompletionPath)) {
      console.log('[Phase 10: Cleanup] ⚠ Phase 9 not complete, but continuing with cleanup');
      cleanupLog.push('⚠ Phase 9 not complete, but continuing with cleanup');
    } else {
      console.log('[Phase 10: Cleanup] ✓ Phase 9 verified');
      cleanupLog.push('✓ Phase 9 verified');
    }

    const phase3Dir = join(tempDir, 'phase3');
    const envConfigPath = join(phase3Dir, 'environment-config.json');

    let envConfig = null;
    if (existsSync(envConfigPath)) {
      envConfig = JSON.parse(readFileSync(envConfigPath, 'utf-8'));
      console.log('[Phase 10: Cleanup] ✓ Environment config loaded');
      cleanupLog.push('✓ Environment config loaded');
    } else {
      console.log(
        '[Phase 10: Cleanup] ⚠ No environment config found, skipping environment teardown',
      );
      cleanupLog.push('⚠ No environment config found');
    }

    // 5. Teardown environment (Docker, Playwright) - NON-BLOCKING
    if (envConfig) {
      console.log('[Phase 10: Cleanup] Tearing down environment...');

      try {
        const envManager = new EnvironmentManagerService(projectPath);
        await envManager.teardownEnvironment(ticketId);

        console.log('[Phase 10: Cleanup] ✓ Environment teardown complete');
        cleanupLog.push('✓ Environment teardown complete');
      } catch (error: any) {
        const errorMsg = `Environment teardown failed: ${error.message}`;
        console.error(`[Phase 10: Cleanup] ⚠ ${errorMsg}`);
        cleanupLog.push(`⚠ ${errorMsg}`);
        cleanupErrors.push(errorMsg);
      }
    }

    // 6. Create artifacts archive - NON-BLOCKING
    console.log('[Phase 10: Cleanup] Creating artifacts archive...');

    let archivePath = '';
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveName = `${ticketId}-artifacts-${timestamp}.tar.gz`;
      archivePath = join(tempDir, archiveName);

      // Archive entire temp directory
      execSync(`tar -czf "${archivePath}" -C "${tempDir}" .`, {
        cwd: projectPath,
        stdio: 'pipe',
      });

      console.log(`[Phase 10: Cleanup] ✓ Artifacts archived: ${archivePath}`);
      cleanupLog.push(`✓ Artifacts archived: ${archivePath}`);
    } catch (error: any) {
      const errorMsg = `Archive creation failed: ${error.message}`;
      console.error(`[Phase 10: Cleanup] ⚠ ${errorMsg}`);
      cleanupLog.push(`⚠ ${errorMsg}`);
      cleanupErrors.push(errorMsg);
    }

    // 7. Calculate temp directory size
    let tempDirSize = 0;
    try {
      const duOutput = execSync(`du -sk "${tempDir}"`, {
        encoding: 'utf-8',
      }).trim();

      tempDirSize = parseInt(duOutput.split('\t')[0], 10); // Size in KB

      console.log(`[Phase 10: Cleanup] Temp directory size: ${(tempDirSize / 1024).toFixed(2)} MB`);
      cleanupLog.push(`Temp directory size: ${(tempDirSize / 1024).toFixed(2)} MB`);
    } catch (error) {
      // Ignore size calculation errors
    }

    // 8. Optionally remove temporary files (keep by default for debugging)
    const removeTempFiles = process.env.CLEANUP_TEMP_FILES === 'true';

    if (removeTempFiles) {
      console.log('[Phase 10: Cleanup] Removing temporary files...');

      try {
        // Keep the archive, remove everything else
        const filesAndDirs = [
          'phase0',
          'phase1',
          'phase2',
          'phase3',
          'phase4',
          'phase5',
          'phase6',
          'phase7',
          'phase8',
          'phase9',
          'phase10',
        ];

        for (const item of filesAndDirs) {
          const itemPath = join(tempDir, item);
          if (existsSync(itemPath)) {
            rmSync(itemPath, { recursive: true, force: true });
          }
        }

        console.log('[Phase 10: Cleanup] ✓ Temporary files removed');
        cleanupLog.push('✓ Temporary files removed (kept archive)');
      } catch (error: any) {
        const errorMsg = `Temp file removal failed: ${error.message}`;
        console.error(`[Phase 10: Cleanup] ⚠ ${errorMsg}`);
        cleanupLog.push(`⚠ ${errorMsg}`);
        cleanupErrors.push(errorMsg);
      }
    } else {
      console.log('[Phase 10: Cleanup] ✓ Keeping temporary files for debugging');
      console.log(`[Phase 10: Cleanup] Set CLEANUP_TEMP_FILES=true to remove temp files`);
      cleanupLog.push('✓ Kept temporary files for debugging');
    }

    // 9. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 10: Cleanup] Writing outputs to disk...');
    mkdirSync(phase10Dir, { recursive: true });

    writeFileSync(join(phase10Dir, 'cleanup-log.txt'), cleanupLog.join('\n'));

    if (cleanupErrors.length > 0) {
      writeFileSync(join(phase10Dir, 'cleanup-errors.txt'), cleanupErrors.join('\n'));
    }

    const cleanupData = {
      cleanup_log: cleanupLog,
      cleanup_errors: cleanupErrors,
      docker_stopped: true,
      artifacts_archived: archivePath !== '',
      archive_path: archivePath,
      temp_dir_size_kb: tempDirSize,
      temp_files_removed: removeTempFiles,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(join(phase10Dir, 'cleanup-data.json'), JSON.stringify(cleanupData, null, 2));

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          cleanup_data: cleanupData,
        },
        null,
        2,
      ),
    );

    console.log('[Phase 10: Cleanup] ✓ Outputs written to disk');
    console.log(`[Phase 10: Cleanup] ✓ Phase complete (outputs: ${phase10Dir})`);

    // 10. Final summary
    console.log('\n' + '='.repeat(80));
    console.log(`✨ IMPLEMENT-TICKET WORKFLOW COMPLETE FOR ${ticketId}`);
    console.log('='.repeat(80));

    if (archivePath) {
      console.log(`\n📦 Artifacts: ${archivePath}`);
    }

    if (existsSync(join(tempDir, 'phase8', 'pr-url.txt'))) {
      const prUrl = readFileSync(join(tempDir, 'phase8', 'pr-url.txt'), 'utf-8').trim();
      console.log(`🔗 Pull Request: ${prUrl}`);
    }

    if (cleanupErrors.length > 0) {
      console.log(`\n⚠️  Cleanup warnings: ${cleanupErrors.length}`);
      for (const error of cleanupErrors) {
        console.log(`   • ${error}`);
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // 11. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'complete',
      phase10_complete: true,
      phase10_cleanup: cleanupData,
    };
  } catch (error) {
    const errorMessage = `Cleanup failed: ${(error as Error).message}`;
    console.error(`[Phase 10: Cleanup] ✗ ${errorMessage}`);

    // Non-blocking: Log error but still mark as complete
    cleanupLog.push(`✗ ${errorMessage}`);
    cleanupErrors.push(errorMessage);

    mkdirSync(phase10Dir, { recursive: true });

    const cleanupData = {
      cleanup_log: cleanupLog,
      cleanup_errors: cleanupErrors,
      docker_stopped: false,
      artifacts_archived: false,
      archive_path: '',
      temp_dir_size_kb: 0,
      temp_files_removed: false,
      failed: true,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(join(phase10Dir, 'cleanup-data.json'), JSON.stringify(cleanupData, null, 2));

    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          cleanup_data: cleanupData,
        },
        null,
        2,
      ),
    );

    return {
      current_phase: 'complete',
      phase10_complete: true,
      phase10_cleanup: cleanupData,
      warnings: [`Cleanup had errors: ${errorMessage}`],
    };
  }
}
