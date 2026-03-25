#!/usr/bin/env tsx
/**
 * Save Checkpoint Script
 *
 * Saves workflow checkpoint with git state validation
 * Migrated from utils/error-handling/error-recovery.js
 *
 * Usage:
 *   npm run save-checkpoint <JIRA_KEY> <PHASE>
 *
 * Environment variables:
 *   COMPLETED_PHASES - JSON array of completed phase names
 *   WIP_MODE - 'true' if in WIP mode
 *   WIP_REASON - Reason for WIP mode
 *   BASE_COMMIT_SHA - Base commit SHA
 *   BASE_BRANCH - Base branch name
 */

import { writeFile, mkdir, readFile, rename } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import { logger } from '../utils/logger.js';

const CHECKPOINT_DIR = '.claude/checkpoints';

interface CheckpointState {
  wipMode?: boolean;
  wipReason?: string;
  baseCommitSha?: string;
  baseBranch?: string;
}

interface CheckpointData {
  phase: string;
  completedPhases: string[];
  state: CheckpointState;
}

interface EnhancedCheckpoint extends CheckpointData {
  ticketKey: string;
  timestamp: string;
  gitState: {
    commit: string;
    branch: string;
    hasUncommittedChanges: boolean;
  };
  environment: {
    nodeVersion: string;
    pythonVersion: string | null;
    cwd: string;
  };
  version: string;
}

function getPythonVersion(): string | null {
  try {
    const output = execSync('python3 --version', { encoding: 'utf-8' });
    return output.trim().split(' ')[1];
  } catch {
    return null;
  }
}

async function saveCheckpoint(
  ticketKey: string,
  checkpoint: CheckpointData
): Promise<string | undefined> {
  try {
    // Ensure checkpoint directory exists
    await mkdir(CHECKPOINT_DIR, { recursive: true });

    const checkpointPath = join(CHECKPOINT_DIR, `implement-ticket-${ticketKey}.json`);
    const checkpointTempPath = `${checkpointPath}.tmp`;

    // Enhance checkpoint with git state and environment
    const enhancedCheckpoint: EnhancedCheckpoint = {
      ...checkpoint,
      ticketKey,
      timestamp: new Date().toISOString(),
      gitState: {
        commit: execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim(),
        branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim(),
        hasUncommittedChanges: execSync('git status --porcelain', { encoding: 'utf-8' }).trim().length > 0,
      },
      environment: {
        nodeVersion: process.version,
        pythonVersion: getPythonVersion(),
        cwd: process.cwd(),
      },
      version: '1.0',
    };

    // Atomic write: temp file -> validate -> rename
    await writeFile(checkpointTempPath, JSON.stringify(enhancedCheckpoint, null, 2), 'utf8');

    // Validate temp file is readable
    const tempContent = await readFile(checkpointTempPath, 'utf8');
    JSON.parse(tempContent); // Will throw if corrupted

    // Atomic rename
    await rename(checkpointTempPath, checkpointPath);

    logger.success(`Checkpoint saved: ${checkpointPath}`);
    logger.info(`  Phase: ${checkpoint.phase}`);
    logger.info(`  Git commit: ${enhancedCheckpoint.gitState.commit.substring(0, 7)}`);
    logger.info(`  Completed phases: ${checkpoint.completedPhases.length}`);

    return checkpointPath;
  } catch (error) {
    logger.error(`Failed to save checkpoint: ${error instanceof Error ? error.message : String(error)}`);
    // Don't throw - checkpointing failure shouldn't stop execution
    return undefined;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jiraKey = args[0];
  const phase = args[1];

  if (!jiraKey || !phase) {
    logger.error('Usage: npm run save-checkpoint <JIRA_KEY> <PHASE>');
    logger.error('Example: npm run save-checkpoint PROJ-123 phase2');
    process.exit(1);
  }

  // Parse environment variables
  const completedPhases = process.env.COMPLETED_PHASES
    ? JSON.parse(process.env.COMPLETED_PHASES)
    : [];

  const checkpointData: CheckpointData = {
    phase,
    completedPhases,
    state: {
      wipMode: process.env.WIP_MODE === 'true',
      wipReason: process.env.WIP_REASON || '',
      baseCommitSha: process.env.BASE_COMMIT_SHA || '',
      baseBranch: process.env.BASE_BRANCH || '',
    },
  };

  const result = await saveCheckpoint(jiraKey, checkpointData);

  if (result) {
    logger.success('Checkpoint saved successfully');
    process.exit(0);
  } else {
    logger.error('Checkpoint save failed');
    process.exit(1);
  }
}

main();
