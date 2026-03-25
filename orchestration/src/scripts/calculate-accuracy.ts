#!/usr/bin/env tsx
/**
 * Accuracy Calculator CLI
 *
 * Calculates implementation accuracy by comparing acceptance criteria from the ticket
 * with test results and implementation artifacts.
 * Migrated from utils/artifacts/calculate-accuracy.js
 *
 * Usage:
 *   npm run calculate-accuracy -- --ticket JIRA-KEY
 *   npm run calculate-accuracy -- --ticket JIRA-KEY --test-results test-results.json
 */

import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import {
  calculateAccuracy,
  generateAccuracyReport,
} from '../services/testing/accuracy-calculator.service.js';
import { logger } from '../utils/logger.js';

async function main() {
  const args = process.argv.slice(2);

  let jiraKey: string | null = null;
  let testResultsPath: string | undefined = undefined;
  let outputPath: string | undefined = undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticket' && args[i + 1]) {
      jiraKey = args[i + 1];
      i++;
    } else if (args[i] === '--test-results' && args[i + 1]) {
      testResultsPath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    }
  }

  if (!jiraKey) {
    logger.error('Error: --ticket JIRA-KEY is required\n');
    logger.error('Usage: npm run calculate-accuracy -- --ticket JIRA-KEY [--test-results path] [--output path]');
    process.exit(1);
  }

  logger.info('Accuracy Calculator');
  logger.info('====================\n');

  try {
    logger.info(`Loading ticket context: ${jiraKey}`);

    const report = await calculateAccuracy(jiraKey, { testResultsPath });

    logger.info(`Found ${report.totalRequirements} requirements\n`);

    logger.info('Checking requirement fulfillment...');
    report.details.forEach((detail) => {
      const statusIcon =
        detail.status === 'fulfilled' ? '✓' : detail.status === 'partial' ? '◐' : '✗';
      const truncatedDesc = detail.description.slice(0, 60);
      logger.info(`   ${statusIcon} [${detail.type}] ${truncatedDesc}${detail.description.length > 60 ? '...' : ''}`);
    });

    logger.info('\nAccuracy Summary');
    logger.info('==================');
    logger.info(`Total Requirements: ${report.totalRequirements}`);
    logger.info(
      `Fulfilled: ${report.fulfilledRequirements} (${Math.round((report.fulfilledRequirements / report.totalRequirements) * 100)}%)`
    );
    if (report.partiallyFulfilled > 0) {
      logger.info(
        `Partially Fulfilled: ${report.partiallyFulfilled} (${Math.round((report.partiallyFulfilled / report.totalRequirements) * 100)}%)`
      );
    }
    if (report.unfulfilled > 0) {
      logger.info(
        `Unfulfilled: ${report.unfulfilled} (${Math.round((report.unfulfilled / report.totalRequirements) * 100)}%)`
      );
    }
    logger.success(`\nACCURACY: ${report.accuracyPercentage}%\n`);

    logger.info('Breakdown by Type:');
    Object.entries(report.breakdown).forEach(([type, stats]) => {
      if (stats.total > 0) {
        const pct = Math.round((stats.fulfilled / stats.total) * 100);
        logger.info(`  ${type}: ${stats.fulfilled}/${stats.total} (${pct}%)`);
      }
    });

    // Save report to file if output path specified
    if (outputPath) {
      const markdown = generateAccuracyReport(report);
      await writeFile(outputPath, markdown, 'utf-8');
      logger.success(`\nReport saved: ${outputPath}`);
    }

    // Save JSON report
    const jsonPath = `.claude/artifacts/${jiraKey}/accuracy-report.json`;
    const dir = dirname(jsonPath);
    await mkdir(dir, { recursive: true });
    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    logger.success(`JSON report saved: ${jsonPath}\n`);

    process.exit(report.accuracyPercentage >= 80 ? 0 : 1);
  } catch (error) {
    logger.error(`Accuracy calculation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
