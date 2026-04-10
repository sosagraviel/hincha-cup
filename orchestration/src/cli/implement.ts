#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { getLLMFactory } from '../llm/llm-factory.js';
import { AgentFactory } from '../utils/shared/agent-factory/index.js';
import { Logger } from '../utils/logger.js';
import { compileImplementTicketGraph } from '../graphs/implement-ticket.graph.js';
import { MemorySaver } from '@langchain/langgraph';
import type { ImplementTicketState } from '../state/schemas/implement-ticket.schema.js';

const logger = new Logger('implement-ticket');

/**
 * CLI Entry Point for Implement-Ticket Workflow
 *
 * This orchestrator runs the complete 11-phase ticket implementation workflow:
 * - Phase 0: Preflight Validation
 * - Phase 1: Context Gathering
 * - Phase 2: Planning & Architecture
 * - Phase 3: Environment Setup
 * - Phase 4: Implementation
 * - Phase 5: Testing
 * - Phase 6: Visual Verification
 * - Phase 7: Documentation Update
 * - Phase 8: PR Creation
 * - Phase 9: Review Loop
 * - Phase 10: Cleanup
 *
 * Features:
 * - Resume from any phase via --start-phase N
 * - Multiple input sources (Jira, Markdown, stdin)
 * - Disk-first idempotency
 * - Checkpointing support
 * - Signal handling for graceful shutdown
 */

const program = new Command();

program
  .name('implement-ticket')
  .description('Implement a ticket using the Claude Code framework')
  .version('1.0.0')
  .requiredOption('-p, --project-path <path>', 'Path to the project to implement in')
  .requiredOption('-f, --framework-path <path>', 'Path to the Claude Code framework')
  .requiredOption('--ticket-id <id>', 'Ticket ID (e.g., PROJ-123)')
  .option('--from-jira', 'Fetch ticket context from Jira + Confluence')
  .option('--from-markdown <path>', 'Read ticket context from markdown file')
  .option('--from-input', 'Read ticket context from stdin')
  .option('--start-phase <phase>', 'Start from specific phase (0-10)', parseInt)
  .option('--resume', 'Auto-detect last completed phase and resume from next')
  .option('--model-tier <tier>', 'Model tier to use (sonnet, opus, haiku)', 'sonnet')
  .parse(process.argv);

const options = program.opts();

const projectPath = resolve(options.projectPath);
const frameworkPath = resolve(options.frameworkPath);

if (!existsSync(projectPath)) {
  logger.error(`Project path does not exist: ${projectPath}`);
  process.exit(1);
}

if (!existsSync(frameworkPath)) {
  logger.error(`Framework path does not exist: ${frameworkPath}`);
  process.exit(1);
}

const ticketId = options.ticketId;
if (!ticketId || ticketId.trim() === '') {
  logger.error('Ticket ID is required');
  process.exit(1);
}

const inputSourceCount = [options.fromJira, options.fromMarkdown, options.fromInput].filter(
  Boolean,
).length;
if (inputSourceCount === 0) {
  logger.error('Must specify one input source: --from-jira, --from-markdown, or --from-input');
  process.exit(1);
}
if (inputSourceCount > 1) {
  logger.error('Cannot specify multiple input sources');
  process.exit(1);
}

let inputSource: 'jira' | 'markdown' | 'input';
let inputValue = '';

if (options.fromJira) {
  inputSource = 'jira';
  inputValue = ticketId;
} else if (options.fromMarkdown) {
  inputSource = 'markdown';
  const markdownPath = resolve(options.fromMarkdown);
  if (!existsSync(markdownPath)) {
    logger.error(`Markdown file does not exist: ${markdownPath}`);
    process.exit(1);
  }
  inputValue = markdownPath;
} else {
  inputSource = 'input';
}

const tempDir = join(projectPath, '.claude-temp/implement-ticket', ticketId);
let startPhase = 0;

if (options.resume) {
  startPhase = detectLastCompletedPhase(tempDir);
  if (startPhase > 0) {
    logger.info(`Resuming from Phase ${startPhase} (auto-detected)`);
  } else {
    logger.info('No completed phases found, starting from beginning');
  }
} else if (options.startPhase !== undefined) {
  startPhase = options.startPhase;
  if (startPhase < 0 || startPhase > 10) {
    logger.error('Start phase must be between 0 and 10');
    process.exit(1);
  }
  if (startPhase > 0) {
    logger.warn(`Starting from Phase ${startPhase} (manual override)`);
    logger.warn(`This will OVERWRITE outputs from Phase ${startPhase} onwards`);
  }
}

const validTiers = ['sonnet', 'opus', 'haiku'];
if (!validTiers.includes(options.modelTier)) {
  logger.error(
    `Invalid model tier: ${options.modelTier}. Must be one of: ${validTiers.join(', ')}`,
  );
  process.exit(1);
}

/**
 * Detect last completed phase from disk
 */
function detectLastCompletedPhase(tempDir: string): number {
  const phaseCompletionFiles = [
    'phase0/preflight-complete.json',
    'phase1/context-complete.json',
    'phase2/planning-complete.json',
    'phase3/environment-complete.json',
    'phase4/implementation-complete.json',
    'phase5/testing-complete.json',
    'phase6/visual-complete.json',
    'phase7/documentation-complete.json',
    'phase8/pr-complete.json',
    'phase9/review-complete.json',
    'phase10/cleanup-complete.json',
  ];

  for (let phase = 10; phase >= 0; phase--) {
    const completionPath = join(tempDir, phaseCompletionFiles[phase]);
    if (existsSync(completionPath)) {
      return phase + 1;
    }
  }

  return 0;
}

/**
 * Main execution
 */
async function main() {
  logger.info('Starting Implement-Ticket workflow');
  logger.info(`Project: ${projectPath}`);
  logger.info(`Framework: ${frameworkPath}`);
  logger.info(`Ticket ID: ${ticketId}`);
  logger.info(`Input source: ${inputSource}`);
  logger.info(`Start phase: ${startPhase}`);
  logger.info(`Model tier: ${options.modelTier}`);

  mkdirSync(tempDir, { recursive: true });

  process.env.MODEL_TIER = options.modelTier;
  logger.info(`Model tier set to: ${options.modelTier}`);

  const cleanup = (signal: string) => {
    logger.warn(`\nReceived ${signal}, cleaning up...`);
    logger.stopAllSpinners();
    AgentFactory.abortAllInvocations();
    AgentFactory.killAllActiveProcesses();
    logger.info('Cleanup complete');
    process.exit(130);
  };

  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));

  try {
    const checkpointer = new MemorySaver();

    const app = compileImplementTicketGraph(checkpointer);

    const threadId = `implement-ticket-${ticketId}-${Date.now()}`;

    const initialState: Partial<ImplementTicketState> = {
      ticket_id: ticketId,
      project_path: projectPath,
      framework_path: frameworkPath,
      temp_dir: tempDir,
      input_source: inputSource,
      input_value: inputValue,
      start_phase: startPhase,
      current_phase: `phase${startPhase}_${getPhaseNameFromNumber(startPhase)}` as any,
      errors: [],
      warnings: [],
    };

    logger.info(`Thread ID: ${threadId}`);
    logger.info('Invoking workflow graph...\n');

    const finalState = await app.invoke(initialState, {
      configurable: { thread_id: threadId },
      recursionLimit: 50,
    });

    if (finalState.current_phase === 'complete') {
      logger.success('\n✨ Implement-Ticket workflow completed successfully!\n');

      if (finalState.phase8_complete && finalState.phase8_pr?.pr_url) {
        logger.info(`🔗 Pull Request: ${finalState.phase8_pr.pr_url}`);
      }

      if (finalState.phase10_complete && finalState.phase10_cleanup?.archive_path) {
        logger.info(`📦 Artifacts: ${finalState.phase10_cleanup.archive_path}`);
      }

      if (finalState.warnings && finalState.warnings.length > 0) {
        logger.warn('\n⚠️  Warnings:');
        for (const warning of finalState.warnings) {
          logger.warn(`   • ${warning}`);
        }
      }

      logger.info(`\nOutputs saved to: ${tempDir}\n`);
      process.exit(0);
    } else if (finalState.current_phase === 'failed') {
      logger.error('\n✗ Implement-Ticket workflow failed\n');

      if (finalState.errors && finalState.errors.length > 0) {
        logger.error('Errors:');
        for (const error of finalState.errors) {
          logger.error(`   • ${error}`);
        }
      }

      logger.info(`\nOutputs saved to: ${tempDir}`);
      logger.info('You can resume from the last successful phase using --resume\n');
      process.exit(1);
    } else {
      logger.warn(`\n⚠️  Workflow stopped at phase: ${finalState.current_phase}\n`);

      if (finalState.warnings && finalState.warnings.length > 0) {
        logger.warn('Warnings:');
        for (const warning of finalState.warnings) {
          logger.warn(`   • ${warning}`);
        }
      }

      logger.info(`\nOutputs saved to: ${tempDir}`);
      logger.info('You can resume from this phase using --resume\n');
      process.exit(0);
    }
  } catch (error: any) {
    logger.error('\n✗ Fatal error during workflow execution\n');
    logger.error(error.message);

    if (error.stack) {
      logger.debug(error.stack);
    }

    logger.info(`\nOutputs saved to: ${tempDir}`);
    logger.info('You can resume from the last successful phase using --resume\n');
    process.exit(1);
  } finally {
    logger.stopAllSpinners();
  }
}

/**
 * Get phase name from phase number
 */
function getPhaseNameFromNumber(phase: number): string {
  const phaseNames = [
    'preflight',
    'context',
    'planning',
    'environment',
    'implementation',
    'testing',
    'visual',
    'documentation',
    'pr',
    'review',
    'cleanup',
  ];

  return phaseNames[phase] || 'unknown';
}

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
