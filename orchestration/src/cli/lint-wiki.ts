#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { lintLlmWiki } from '../services/graph-wiki/wiki-lint.service.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('lint-wiki')
  .description('Run structural and semantic lint checks over docs/llm-wiki/wiki/')
  .version('1.0.0')
  .option('-p, --project-path <path>', 'Project root containing docs/llm-wiki/', process.cwd())
  .option('--graph-db <path>', 'Path to .code-graph.db (default: <project-path>/.code-graph.db)')
  .option(
    '--changed-pages <pages>',
    'Comma-separated list of changed wiki page paths for contradiction checks',
  )
  .option('--skip-semantic', 'Skip semantic (warn-only) checks', false)
  .option('--artifacts-dir <path>', 'Directory for lint report output')
  .option('--json-only', 'Suppress all output except the JSON summary line', false)
  .action(async (options) => {
    let isShuttingDown = false;

    const cleanup = (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.stopAllSpinners();
      logger.warn(`Received ${signal} — shutting down.`);
      process.exit(130);
    };

    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));

    try {
      const projectPath = path.resolve(options.projectPath as string);
      const graphDbPath = options.graphDb
        ? path.resolve(options.graphDb as string)
        : path.join(projectPath, '.code-graph.db');

      const changedPages = options.changedPages
        ? (options.changedPages as string)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : undefined;

      const artifactsDir = options.artifactsDir
        ? path.resolve(options.artifactsDir as string)
        : undefined;

      if (!options.jsonOnly) {
        logger.section('Wiki Lint');
        logger.table({
          'Project Path': projectPath,
          'Graph DB': graphDbPath,
          'Skip Semantic': String(options.skipSemantic),
        });
        logger.blank();
        logger.spinner('Running lint checks...', 'lint');
      }

      const report = await lintLlmWiki({
        projectPath,
        graphDbPath,
        changedPages,
        skipSemantic: Boolean(options.skipSemantic),
        artifactsDir,
      });

      if (!options.jsonOnly) {
        logger.succeedSpinner('lint', 'Lint complete');
        logger.blank();
      }

      const summary = `${report.structural.length} structural failures, ${report.semantic.length} semantic warnings, ${report.stats.pages_scanned} pages scanned`;
      console.log(summary);

      if (!options.jsonOnly) {
        if (report.structural.length > 0) {
          logger.blank();
          logger.error('Structural failures (must fix before merging):');
          logger.increaseIndent();
          for (const v of report.structural) {
            logger.error(`[${v.rule}] ${v.page}: ${v.message}`);
          }
          logger.decreaseIndent();
        }

        if (report.semantic.length > 0) {
          logger.blank();
          logger.warn('Semantic warnings (advisory only):');
          logger.increaseIndent();
          for (const v of report.semantic) {
            logger.warn(`[${v.rule}] ${v.page}: ${v.message}`);
          }
          logger.decreaseIndent();
        }

        if (report.structural.length === 0 && report.semantic.length === 0) {
          logger.blank();
          logger.success('Wiki is consistent. No violations found.');
        }
      }

      process.exit(report.structural.length > 0 ? 1 : 0);
    } catch (error) {
      logger.stopAllSpinners();
      if (
        isShuttingDown ||
        (error instanceof Error &&
          (error.message.includes('SIGINT') || error.message.includes('interrupted by user')))
      ) {
        process.exit(130);
      }
      logger.error('Wiki lint failed', error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  });

program.parse();
