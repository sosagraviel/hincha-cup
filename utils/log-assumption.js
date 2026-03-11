#!/usr/bin/env node

/**
 * Enhanced Decision Logging with Assumption Tracking
 *
 * Tracks all assumptions made during implementation with:
 * - Risk categorization (High/Medium/Low)
 * - Code location linking (file:line)
 * - Validation checkboxes for reviewers
 * - Mitigation strategies
 *
 * Usage:
 *   node log-assumption.js --ticket JIRA-123 --title "OAuth Provider Setup" \
 *     --decision "Client IDs in env vars" --risk high \
 *     --rationale "Standard practice" --location "src/auth/oauth.service.ts:45"
 */

const fs = require('fs');
const path = require('path');

// Risk levels
const RISK_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

// Risk level emojis and labels
const RISK_CONFIG = {
  [RISK_LEVELS.HIGH]: {
    emoji: '⚠️',
    label: 'High-Risk',
    actionRequired: true,
    priority: 1
  },
  [RISK_LEVELS.MEDIUM]: {
    emoji: 'ℹ️',
    label: 'Medium-Risk',
    actionRequired: true,
    priority: 2
  },
  [RISK_LEVELS.LOW]: {
    emoji: '✓',
    label: 'Low-Risk',
    actionRequired: false,
    priority: 3
  }
};

/**
 * Log an assumption
 *
 * @param {Object} assumption - Assumption details
 * @param {string} assumption.ticketKey - Jira ticket key
 * @param {string} assumption.title - Assumption title/name
 * @param {string} assumption.decision - What was decided
 * @param {string} assumption.rationale - Why this choice was made
 * @param {string} assumption.risk - Risk level (high/medium/low)
 * @param {string} assumption.mitigation - How risk is minimized (optional)
 * @param {string} assumption.actionRequired - What reviewer must verify (optional)
 * @param {string} assumption.codeLocation - File path and line number (optional)
 * @param {string} assumption.context - Additional context (optional)
 * @param {string} assumption.projectPath - Project root path
 * @returns {Promise<void>}
 */
async function logAssumption(assumption) {
  const {
    ticketKey,
    title,
    decision,
    rationale,
    risk = RISK_LEVELS.MEDIUM,
    mitigation = '',
    actionRequired = '',
    codeLocation = '',
    context = '',
    projectPath = process.cwd()
  } = assumption;

  console.log(`📝 Logging ${risk}-risk assumption: ${title}`);

  // Validate risk level
  if (!Object.values(RISK_LEVELS).includes(risk)) {
    throw new Error(`Invalid risk level: ${risk}. Must be one of: ${Object.values(RISK_LEVELS).join(', ')}`);
  }

  const riskConfig = RISK_CONFIG[risk];

  // Create assumption entry
  const entry = {
    timestamp: new Date().toISOString(),
    title,
    decision,
    rationale,
    risk,
    mitigation,
    actionRequired,
    codeLocation,
    context
  };

  // Append to decision log
  await appendToDecisionLog(entry, ticketKey, riskConfig, projectPath);

  // Also track in separate assumptions file for easy extraction
  await trackAssumption(entry, ticketKey, projectPath);

  console.log(`✅ Assumption logged to .claude/decisions/${ticketKey}.md`);
}

/**
 * Append assumption to decision log
 */
async function appendToDecisionLog(entry, ticketKey, riskConfig, projectPath) {
  const decisionsDir = path.join(projectPath, '.claude', 'decisions');
  fs.mkdirSync(decisionsDir, { recursive: true });

  const decisionLogPath = path.join(decisionsDir, `${ticketKey}.md`);

  // Generate markdown entry
  const markdown = generateAssumptionMarkdown(entry, riskConfig);

  // Append to decision log
  if (fs.existsSync(decisionLogPath)) {
    const existing = fs.readFileSync(decisionLogPath, 'utf8');
    fs.writeFileSync(decisionLogPath, existing + markdown);
  } else {
    // Create new decision log
    const header = `# Implementation Decisions - ${ticketKey}\n\nAll autonomous decisions and assumptions made during implementation are logged below for transparency and review.\n\n`;
    fs.writeFileSync(decisionLogPath, header + markdown);
  }
}

/**
 * Generate markdown for assumption
 */
function generateAssumptionMarkdown(entry, riskConfig) {
  const { title, decision, rationale, risk, mitigation, actionRequired, codeLocation, context } = entry;

  let markdown = `\n### ${riskConfig.label} Assumption: ${title} ${riskConfig.emoji}\n\n`;
  markdown += `**Decision**: ${decision}\n`;
  markdown += `**Rationale**: ${rationale}\n`;

  if (context) {
    markdown += `**Context**: ${context}\n`;
  }

  if (risk === RISK_LEVELS.HIGH || risk === RISK_LEVELS.MEDIUM) {
    if (mitigation) {
      markdown += `**Risk Mitigation**: ${mitigation}\n`;
    }

    if (actionRequired) {
      markdown += `**Action Required**: ${actionRequired}\n`;
    } else {
      markdown += `**Action Required**: Review and validate this assumption before merging\n`;
    }
  }

  if (codeLocation) {
    markdown += `**Code Location**: \`${codeLocation}\`\n`;
  }

  markdown += `**Timestamp**: ${entry.timestamp}\n`;

  // Add validation checkbox for high/medium risk
  if (riskConfig.actionRequired) {
    markdown += `\n**Validation**:\n`;
    markdown += `- [ ] Assumption reviewed and validated\n`;
    if (risk === RISK_LEVELS.HIGH) {
      markdown += `- [ ] Risk mitigation verified\n`;
      markdown += `- [ ] Production impact assessed\n`;
    }
  }

  markdown += '\n---\n';

  return markdown;
}

/**
 * Track assumption separately for easy extraction
 */
async function trackAssumption(entry, ticketKey, projectPath) {
  const assumptionsDir = path.join(projectPath, '.claude', 'assumptions');
  fs.mkdirSync(assumptionsDir, { recursive: true });

  const assumptionsPath = path.join(assumptionsDir, `${ticketKey}-assumptions.json`);

  let assumptions = [];
  if (fs.existsSync(assumptionsPath)) {
    assumptions = JSON.parse(fs.readFileSync(assumptionsPath, 'utf8'));
  }

  assumptions.push(entry);

  fs.writeFileSync(assumptionsPath, JSON.stringify(assumptions, null, 2));
}

/**
 * Get all assumptions for a ticket
 *
 * @param {string} ticketKey - Jira ticket key
 * @param {string} projectPath - Project root path
 * @returns {Array<Object>} List of assumptions
 */
function getAssumptions(ticketKey, projectPath = process.cwd()) {
  const assumptionsPath = path.join(projectPath, '.claude', 'assumptions', `${ticketKey}-assumptions.json`);

  if (!fs.existsSync(assumptionsPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(assumptionsPath, 'utf8'));
}

/**
 * Get assumptions by risk level
 *
 * @param {string} ticketKey - Jira ticket key
 * @param {string} riskLevel - Risk level to filter by
 * @param {string} projectPath - Project root path
 * @returns {Array<Object>} Filtered assumptions
 */
function getAssumptionsByRisk(ticketKey, riskLevel, projectPath = process.cwd()) {
  const assumptions = getAssumptions(ticketKey, projectPath);
  return assumptions.filter(a => a.risk === riskLevel);
}

/**
 * Generate assumption summary for PR
 *
 * @param {string} ticketKey - Jira ticket key
 * @param {string} projectPath - Project root path
 * @returns {string} Markdown summary
 */
function generateAssumptionSummary(ticketKey, projectPath = process.cwd()) {
  const assumptions = getAssumptions(ticketKey, projectPath);

  if (assumptions.length === 0) {
    return '## 💭 Assumptions Made\n\nNo assumptions were made during implementation.\n';
  }

  const highRisk = assumptions.filter(a => a.risk === RISK_LEVELS.HIGH);
  const mediumRisk = assumptions.filter(a => a.risk === RISK_LEVELS.MEDIUM);
  const lowRisk = assumptions.filter(a => a.risk === RISK_LEVELS.LOW);

  let summary = '## 💭 Assumptions Made\n\n';
  summary += `This PR was implemented autonomously. The following assumptions were made:\n\n`;

  // High-risk assumptions
  if (highRisk.length > 0) {
    summary += `### High-Risk Assumptions ⚠️\n\n`;
    highRisk.forEach((assumption, index) => {
      summary += `${index + 1}. **${assumption.title}**\n`;
      summary += `   - **Decision**: ${assumption.decision}\n`;
      summary += `   - **Rationale**: ${assumption.rationale}\n`;
      if (assumption.mitigation) {
        summary += `   - **Mitigation**: ${assumption.mitigation}\n`;
      }
      if (assumption.actionRequired) {
        summary += `   - **Action Required**: ${assumption.actionRequired}\n`;
      }
      if (assumption.codeLocation) {
        summary += `   - **Location**: \`${assumption.codeLocation}\`\n`;
      }
      summary += `   - [ ] Validated\n\n`;
    });
  }

  // Medium-risk assumptions
  if (mediumRisk.length > 0) {
    summary += `### Medium-Risk Assumptions ℹ️\n\n`;
    mediumRisk.forEach((assumption, index) => {
      summary += `${index + 1}. **${assumption.title}**: ${assumption.decision}\n`;
      summary += `   - **Rationale**: ${assumption.rationale}\n`;
      if (assumption.actionRequired) {
        summary += `   - **Action Required**: ${assumption.actionRequired}\n`;
      }
      summary += `   - [ ] Reviewed\n\n`;
    });
  }

  // Low-risk assumptions (collapsible)
  if (lowRisk.length > 0) {
    summary += `### Low-Risk Assumptions ✓\n\n`;
    summary += `<details>\n<summary>View ${lowRisk.length} low-risk assumption(s)</summary>\n\n`;
    lowRisk.forEach((assumption, index) => {
      summary += `${index + 1}. **${assumption.title}**: ${assumption.decision}\n`;
    });
    summary += `\n</details>\n\n`;
  }

  // Action required section
  if (highRisk.length > 0 || mediumRisk.length > 0) {
    summary += `**⚠️ Action Required**: Review and validate assumptions marked with ⚠️ and ℹ️ before merging.\n\n`;
  }

  return summary;
}

/**
 * Validate assumptions (check if all required actions are completed)
 *
 * @param {string} ticketKey - Jira ticket key
 * @param {string} projectPath - Project root path
 * @returns {Object} Validation result
 */
function validateAssumptions(ticketKey, projectPath = process.cwd()) {
  const assumptions = getAssumptions(ticketKey, projectPath);

  const highRisk = assumptions.filter(a => a.risk === RISK_LEVELS.HIGH);
  const mediumRisk = assumptions.filter(a => a.risk === RISK_LEVELS.MEDIUM);

  const result = {
    total: assumptions.length,
    highRisk: highRisk.length,
    mediumRisk: mediumRisk.length,
    lowRisk: assumptions.filter(a => a.risk === RISK_LEVELS.LOW).length,
    requiresReview: highRisk.length + mediumRisk.length,
    readyToMerge: highRisk.length === 0 && mediumRisk.length === 0
  };

  return result;
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const assumption = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key === 'ticket') {
      assumption.ticketKey = value;
    } else if (key === 'title') {
      assumption.title = value;
    } else if (key === 'decision') {
      assumption.decision = value;
    } else if (key === 'rationale') {
      assumption.rationale = value;
    } else if (key === 'risk') {
      assumption.risk = value;
    } else if (key === 'mitigation') {
      assumption.mitigation = value;
    } else if (key === 'action') {
      assumption.actionRequired = value;
    } else if (key === 'location') {
      assumption.codeLocation = value;
    } else if (key === 'context') {
      assumption.context = value;
    }
  }

  // Validate required fields
  if (!assumption.ticketKey || !assumption.title || !assumption.decision || !assumption.rationale) {
    console.error('Usage: node log-assumption.js --ticket JIRA-123 --title "Title" --decision "Decision" --rationale "Rationale" --risk [high|medium|low] [--mitigation "..."] [--action "..."] [--location "file:line"]');
    process.exit(1);
  }

  logAssumption(assumption)
    .then(() => {
      console.log('\n✅ Assumption logged successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error logging assumption:', error);
      process.exit(1);
    });
}

module.exports = {
  logAssumption,
  getAssumptions,
  getAssumptionsByRisk,
  generateAssumptionSummary,
  validateAssumptions,
  RISK_LEVELS
};
