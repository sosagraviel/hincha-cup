#!/usr/bin/env tsx
/**
 * Architecture Diagram Generator CLI
 *
 * Analyzes git diff and generates Mermaid architecture diagrams for PRs.
 * Migrated from utils/documentation/generate-architecture-diagram.js
 *
 * Usage:
 *   npm run generate-architecture-diagram -- [base-commit] [head-commit]
 *   npm run generate-architecture-diagram -- --ticket JIRA-KEY
 */

import { generateArchitectureDiagram } from '../services/documentation/architecture-diagram.service.js';
import { logger } from '../utils/logger.js';

async function main() {
  const args = process.argv.slice(2);

  let baseCommit = 'HEAD~1';
  let headCommit = 'HEAD';
  let jiraKey: string | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticket' && args[i + 1]) {
      jiraKey = args[i + 1];
      i++;
    } else if (args[i] === '--base' && args[i + 1]) {
      baseCommit = args[i + 1];
      i++;
    } else if (args[i] === '--head' && args[i + 1]) {
      headCommit = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      if (i === 0) baseCommit = args[i];
      if (i === 1) headCommit = args[i];
    }
  }

  logger.info('Architecture Diagram Generator');
  logger.info('================================\n');

  try {
    logger.info(`Analyzing changes: ${baseCommit}...${headCommit}`);

    const report = await generateArchitectureDiagram(baseCommit, headCommit, jiraKey);

    if (report.diffAnalysis) {
      logger.info(`   Files changed: ${report.diffAnalysis.filesChanged.length}`);
      logger.info(`   Additions: +${report.diffAnalysis.additions} lines`);
      logger.info(`   Deletions: -${report.diffAnalysis.deletions} lines`);
    }

    logger.success(`\nGenerated ${report.diagrams.length} diagrams in ${report.analysisTime}ms\n`);

    logger.info('Summary:');
    logger.info(`   Diagrams generated: ${report.diagrams.length}`);
    report.diagrams.forEach((d) => {
      logger.success(`   ✓ Generated ${d.type} diagram: ${d.path}`);
    });

    process.exit(0);
  } catch (error) {
    logger.error(`Failed to generate diagrams: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
