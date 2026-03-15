#!/usr/bin/env bash
# Save checkpoint wrapper script

JIRA_KEY="$1"
PHASE="$2"

node << 'NODEJS'
const { saveCheckpoint } = require('./utils/error-handling/error-recovery.js');

const jiraKey = process.argv[1];
const phase = process.argv[2];

const completedPhases = process.env.COMPLETED_PHASES
  ? JSON.parse(process.env.COMPLETED_PHASES)
  : [];

saveCheckpoint(jiraKey, {
  phase: phase,
  completedPhases: completedPhases,
  state: {
    wipMode: process.env.WIP_MODE === 'true',
    wipReason: process.env.WIP_REASON || '',
    baseCommitSha: process.env.BASE_COMMIT_SHA || '',
    baseBranch: process.env.BASE_BRANCH || ''
  }
}).then(() => {
  console.log('[Checkpoint] Saved successfully');
  process.exit(0);
}).catch(err => {
  console.error('[Checkpoint] Failed to save:', err.message);
  process.exit(1);
});
NODEJS "$JIRA_KEY" "$PHASE"
