import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';

/**
 * Phase 7: Documentation Node
 *
 * This node updates project documentation:
 * - Reads modified files from Phase 4
 * - Applies "maintenance test" (hard-to-discover knowledge only)
 * - Makes surgical updates to .claude/CLAUDE.md
 * - Updates stack profile if new dependencies or frameworks detected
 * - Non-blocking: Best-effort documentation updates
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 4 outputs from disk, NOT from state
 * - Non-blocking: Documentation updates are best-effort
 *
 * @param state - Current workflow state
 * @returns Updated state with phase7 completion flag
 */
export async function phase7DocumentationNode(
  state: ImplementTicketState,
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir =
    state.temp_dir || join(projectPath, '.claude-temp/tickets', ticketId, 'artifacts');
  const phase7Dir = join(tempDir, 'phase7');

  console.log('\n[Phase 7: Documentation] Starting documentation update...');

  const completionMarkerPath = join(phase7Dir, 'documentation-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 7: Documentation] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase8_pr',
      phase7_complete: true,
      phase7_documentation: completionData.documentation_data,
    };
  }

  try {
    console.log('[Phase 7: Documentation] Validating Phase 6 completion...');
    const phase6Dir = join(tempDir, 'phase6');
    const phase6CompletionPath = join(phase6Dir, 'visual-complete.json');

    if (!existsSync(phase6CompletionPath)) {
      throw new Error('Phase 6 not complete. Run Phase 6 first or use --start-phase 6');
    }
    console.log('[Phase 7: Documentation] ✓ Phase 6 verified');

    const phase4Dir = join(tempDir, 'phase4');
    const filesModifiedPath = join(phase4Dir, 'files-modified.txt');

    if (!existsSync(filesModifiedPath)) {
      console.log(
        '[Phase 7: Documentation] ⚠ No modified files found, skipping documentation update',
      );
      return skipDocumentation(phase7Dir, completionMarkerPath, ticketId, 'No modified files');
    }

    const modifiedFilesContent = readFileSync(filesModifiedPath, 'utf-8');
    const modifiedFiles = modifiedFilesContent.split('\n').filter(Boolean);

    console.log(`[Phase 7: Documentation] ✓ Found ${modifiedFiles.length} modified files`);

    const implementationPlan = readFileSync(
      join(tempDir, 'phase2', 'implementation-plan.md'),
      'utf-8',
    );
    const fullContext = readFileSync(join(tempDir, 'phase1', 'full-context.md'), 'utf-8');

    console.log('[Phase 7: Documentation] Analyzing changes for documentation updates...');

    const docUpdates = analyzeDocumentationNeeds(
      modifiedFiles,
      implementationPlan,
      fullContext,
      ticketId,
    );

    if (docUpdates.length === 0) {
      console.log('[Phase 7: Documentation] ⚠ No documentation updates needed');
      return skipDocumentation(
        phase7Dir,
        completionMarkerPath,
        ticketId,
        'No hard-to-discover knowledge to document',
      );
    }

    console.log(`[Phase 7: Documentation] Found ${docUpdates.length} documentation updates needed`);

    const claudeMdPath = join(projectPath, '.claude', 'CLAUDE.md');
    let claudeMdContent = '';
    let claudeMdUpdated = false;

    if (existsSync(claudeMdPath)) {
      claudeMdContent = readFileSync(claudeMdPath, 'utf-8');

      // Apply surgical updates
      console.log('[Phase 7: Documentation] Updating CLAUDE.md...');

      for (const update of docUpdates) {
        claudeMdContent = applySurgicalUpdate(claudeMdContent, update);
        claudeMdUpdated = true;
      }

      if (claudeMdUpdated) {
        writeFileSync(claudeMdPath, claudeMdContent);
        console.log('[Phase 7: Documentation] ✓ CLAUDE.md updated');
      }
    } else {
      console.log('[Phase 7: Documentation] ⚠ CLAUDE.md not found, skipping update');
    }

    console.log('[Phase 7: Documentation] Checking for stack profile updates...');

    const stackProfileUpdates = detectStackProfileChanges(modifiedFiles, projectPath);

    if (stackProfileUpdates.length > 0) {
      console.log(
        `[Phase 7: Documentation] Found ${stackProfileUpdates.length} stack profile updates:`,
      );
      for (const update of stackProfileUpdates) {
        console.log(`  • ${update.type}: ${update.value}`);
      }

      // Update stack profile section in CLAUDE.md
      if (claudeMdUpdated && existsSync(claudeMdPath)) {
        claudeMdContent = readFileSync(claudeMdPath, 'utf-8');
        claudeMdContent = updateStackProfileSection(claudeMdContent, stackProfileUpdates);
        writeFileSync(claudeMdPath, claudeMdContent);
        console.log('[Phase 7: Documentation] ✓ Stack profile updated in CLAUDE.md');
      }
    } else {
      console.log('[Phase 7: Documentation] ✓ No stack profile updates needed');
    }

    // 8. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 7: Documentation] Writing outputs to disk...');
    mkdirSync(phase7Dir, { recursive: true });

    writeFileSync(join(phase7Dir, 'doc-updates.json'), JSON.stringify(docUpdates, null, 2));

    writeFileSync(
      join(phase7Dir, 'stack-profile-updates.json'),
      JSON.stringify(stackProfileUpdates, null, 2),
    );

    const docSummary: string[] = [];
    docSummary.push(`# Documentation Updates for ${ticketId}\n`);
    docSummary.push(`**Timestamp**: ${new Date().toISOString()}\n`);
    docSummary.push(`## Changes Made\n`);

    for (const update of docUpdates) {
      docSummary.push(`### ${update.section}\n`);
      docSummary.push(`${update.content}\n`);
    }

    if (stackProfileUpdates.length > 0) {
      docSummary.push(`## Stack Profile Updates\n`);
      for (const update of stackProfileUpdates) {
        docSummary.push(`- ${update.type}: ${update.value}`);
      }
      docSummary.push('');
    }

    writeFileSync(join(phase7Dir, 'documentation-summary.md'), docSummary.join('\n'));

    const documentationData = {
      doc_updates: docUpdates,
      stack_profile_updates: stackProfileUpdates,
      claude_md_updated: claudeMdUpdated,
      project_context_updated: false, // TODO: Implement project context updates
      modified_files_count: modifiedFiles.length,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(
      join(phase7Dir, 'documentation-data.json'),
      JSON.stringify(documentationData, null, 2),
    );

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify(
        {
          completed_at: new Date().toISOString(),
          ticket_id: ticketId,
          documentation_data: documentationData,
        },
        null,
        2,
      ),
    );

    console.log('[Phase 7: Documentation] ✓ Outputs written to disk');
    console.log(`[Phase 7: Documentation] ✓ Phase complete (outputs: ${phase7Dir})`);

    // 9. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase8_pr',
      phase7_complete: true,
      phase7_documentation: documentationData,
    };
  } catch (error) {
    const errorMessage = `Documentation update failed: ${(error as Error).message}`;
    console.error(`[Phase 7: Documentation] ✗ ${errorMessage}`);

    // Non-blocking: Log error but continue to next phase
    console.log('[Phase 7: Documentation] ⚠ Continuing to Phase 8 (documentation is non-blocking)');

    return skipDocumentation(phase7Dir, completionMarkerPath, ticketId, errorMessage);
  }
}

/**
 * Skip documentation and continue to next phase
 */
function skipDocumentation(
  phase7Dir: string,
  completionMarkerPath: string,
  ticketId: string,
  reason: string,
): Partial<ImplementTicketState> {
  mkdirSync(phase7Dir, { recursive: true });

  const documentationData = {
    doc_updates: [],
    stack_profile_updates: [],
    claude_md_updated: false,
    project_context_updated: false,
    modified_files_count: 0,
    skipped: true,
    skip_reason: reason,
    timestamp: new Date().toISOString(),
  };

  writeFileSync(
    join(phase7Dir, 'documentation-summary.md'),
    `# Documentation Updates\n\n⚠ SKIPPED\n\n**Reason**: ${reason}\n`,
  );

  writeFileSync(
    join(phase7Dir, 'documentation-data.json'),
    JSON.stringify(documentationData, null, 2),
  );

  writeFileSync(
    completionMarkerPath,
    JSON.stringify(
      {
        completed_at: new Date().toISOString(),
        ticket_id: ticketId,
        documentation_data: documentationData,
      },
      null,
      2,
    ),
  );

  return {
    current_phase: 'phase8_pr',
    phase7_complete: true,
    phase7_documentation: documentationData,
  };
}

/**
 * Analyze documentation needs using "maintenance test"
 * Only document hard-to-discover knowledge, not obvious code
 */
function analyzeDocumentationNeeds(
  modifiedFiles: string[],
  implementationPlan: string,
  fullContext: string,
  ticketId: string,
): Array<{ section: string; content: string; type: 'add' | 'update' }> {
  const updates: Array<{ section: string; content: string; type: 'add' | 'update' }> = [];

  // Check for new API endpoints
  const apiFiles = modifiedFiles.filter(
    (f) => f.includes('/api/') || f.includes('/routes/') || f.includes('/controllers/'),
  );

  if (apiFiles.length > 0) {
    updates.push({
      section: 'API Endpoints',
      content:
        `Added/modified API endpoints in ${ticketId}:\n` +
        apiFiles.map((f) => `  - ${f}`).join('\n'),
      type: 'update',
    });
  }

  // Check for new configuration
  const configFiles = modifiedFiles.filter(
    (f) => f.includes('config') || f.includes('.env') || f.includes('settings'),
  );

  if (configFiles.length > 0) {
    updates.push({
      section: 'Configuration',
      content:
        `Configuration changes in ${ticketId}:\n` +
        configFiles.map((f) => `  - ${f}`).join('\n') +
        '\n\nCheck these files for new environment variables or settings.',
      type: 'update',
    });
  }

  // Check for new database migrations
  const migrationFiles = modifiedFiles.filter(
    (f) => f.includes('migration') || f.includes('schema') || f.includes('models/'),
  );

  if (migrationFiles.length > 0) {
    updates.push({
      section: 'Database Schema',
      content:
        `Database changes in ${ticketId}:\n` + migrationFiles.map((f) => `  - ${f}`).join('\n'),
      type: 'update',
    });
  }

  // Check for new external integrations
  if (
    implementationPlan.toLowerCase().includes('api') ||
    implementationPlan.toLowerCase().includes('integration') ||
    implementationPlan.toLowerCase().includes('external')
  ) {
    updates.push({
      section: 'External Integrations',
      content:
        `Added/modified external integrations in ${ticketId}. ` +
        'Check implementation for API keys, webhooks, or third-party services.',
      type: 'add',
    });
  }

  return updates;
}

/**
 * Apply surgical update to CLAUDE.md
 * Only update specific sections, don't rewrite entire document
 */
function applySurgicalUpdate(
  claudeMdContent: string,
  update: { section: string; content: string; type: 'add' | 'update' },
): string {
  // Find section in CLAUDE.md
  const sectionRegex = new RegExp(`##\\s+${update.section}\\s*\\n`, 'i');
  const sectionMatch = claudeMdContent.match(sectionRegex);

  if (sectionMatch && update.type === 'update') {
    // Section exists, append to it
    const sectionIndex = sectionMatch.index! + sectionMatch[0].length;
    const beforeSection = claudeMdContent.substring(0, sectionIndex);
    const afterSection = claudeMdContent.substring(sectionIndex);

    // Find next section or end of document
    const nextSectionMatch = afterSection.match(/\n##\s+/);
    const insertIndex = nextSectionMatch ? nextSectionMatch.index! : afterSection.length;

    const updatedSection =
      afterSection.substring(0, insertIndex) +
      `\n${update.content}\n` +
      afterSection.substring(insertIndex);

    return beforeSection + updatedSection;
  } else if (!sectionMatch && update.type === 'add') {
    // Section doesn't exist, add it at the end
    return claudeMdContent + `\n## ${update.section}\n\n${update.content}\n`;
  }

  return claudeMdContent;
}

/**
 * Detect stack profile changes from modified files
 * (New dependencies, frameworks, libraries)
 */
function detectStackProfileChanges(
  modifiedFiles: string[],
  projectPath: string,
): Array<{ type: string; value: string }> {
  const updates: Array<{ type: string; value: string }> = [];

  // Check for package.json changes (new dependencies)
  if (modifiedFiles.includes('package.json')) {
    try {
      const packageJson = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'));

      // Extract new dependencies (this is simplified - ideally compare with previous)
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      const majorFrameworks = [
        'react',
        'vue',
        'angular',
        'svelte',
        'express',
        'fastify',
        'next',
        'nuxt',
      ];

      for (const framework of majorFrameworks) {
        if (allDeps[framework]) {
          updates.push({
            type: 'dependency',
            value: `${framework}@${allDeps[framework]}`,
          });
        }
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  // Check for requirements.txt changes (Python)
  if (modifiedFiles.includes('requirements.txt')) {
    updates.push({
      type: 'dependency_file',
      value: 'requirements.txt updated - check for new Python dependencies',
    });
  }

  // Check for Cargo.toml changes (Rust)
  if (modifiedFiles.includes('Cargo.toml')) {
    updates.push({
      type: 'dependency_file',
      value: 'Cargo.toml updated - check for new Rust dependencies',
    });
  }

  // Check for go.mod changes (Go)
  if (modifiedFiles.includes('go.mod')) {
    updates.push({
      type: 'dependency_file',
      value: 'go.mod updated - check for new Go dependencies',
    });
  }

  return updates;
}

/**
 * Update stack profile section in CLAUDE.md
 */
function updateStackProfileSection(
  claudeMdContent: string,
  stackProfileUpdates: Array<{ type: string; value: string }>,
): string {
  // Find stack profile section
  const stackSectionRegex = /##\s+Stack\s+Profile\s*\n/i;
  const stackSectionMatch = claudeMdContent.match(stackSectionRegex);

  if (stackSectionMatch) {
    const sectionIndex = stackSectionMatch.index! + stackSectionMatch[0].length;
    const beforeSection = claudeMdContent.substring(0, sectionIndex);
    const afterSection = claudeMdContent.substring(sectionIndex);

    // Add updates to stack profile section
    const updateText =
      '\n### Recent Updates\n\n' +
      stackProfileUpdates.map((u) => `- ${u.type}: ${u.value}`).join('\n') +
      '\n';

    // Insert updates at beginning of stack profile section
    return beforeSection + updateText + afterSection;
  }

  return claudeMdContent;
}
