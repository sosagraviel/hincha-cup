#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { MemorySaver } from '@langchain/langgraph';
import { createWikiRefreshGraph } from '../graphs/wiki-refresh.graph.js';
import { logger } from '../utils/logger.js';
import { Provider } from '../providers/types.js';
import { readWikiDeltaHintsFile } from '../services/graph-wiki/wiki-delta-hints.js';
import type { WikiDeltaHint } from '../services/graph-wiki/wiki-delta-hints.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Framework root is 3 levels up from dist/cli/refresh-wiki.js
const DEFAULT_FRAMEWORK_PATH = path.resolve(__dirname, '../../..');

const program = new Command();

program
  .name('refresh-wiki')
  .description('Incrementally refresh the LLM wiki at docs/llm-wiki/ after code changes')
  .version('1.0.0')
  .option('-p, --project-path <path>', 'Project path containing the wiki', process.cwd())
  .option(
    '-f, --framework-path <path>',
    'Framework path',
    process.env.FRAMEWORK_PATH || DEFAULT_FRAMEWORK_PATH,
  )
  .option('--provider <claude|codex>', 'AI provider (auto-detected from config if omitted)')
  .option('--since <sha>', 'Refresh only pages affected since this git commit')
  .option('--force', 'Force full regeneration even when .state.json exists', false)
  .option('--pages <globs>', 'Comma-separated glob patterns to restrict which pages are refreshed')
  .option('--dry-run', 'Show the planned refresh set without writing any files', false)
  .option(
    '--hints <path>',
    'Path to a JSONL file of Wiki Delta Hints emitted by the implementer; seeds the refresh set in addition to the git diff',
  )
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
      const projectPath = path.resolve(options.projectPath);
      const frameworkPath = path.resolve(options.frameworkPath);
      const provider = resolveProvider(options.provider, projectPath);
      const pagesFilter = options.pages
        ? (options.pages as string)
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean)
        : undefined;

      let hints: WikiDeltaHint[] = [];
      if (options.hints) {
        const hintsPath = path.resolve(options.hints as string);
        if (!existsSync(hintsPath)) {
          logger.error(`--hints path does not exist: ${hintsPath}`);
          process.exit(1);
        }
        try {
          hints = readWikiDeltaHintsFile(hintsPath);
        } catch (err) {
          logger.error(
            `Failed to parse hints file: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      }

      logger.section('Wiki Refresh');
      logger.table({
        'Project Path': projectPath,
        'Framework Path': frameworkPath,
        Provider: provider,
        'Since commit': options.since ?? '(from .state.json)',
        Force: String(options.force),
        'Dry run': String(options.dryRun),
        Hints: hints.length > 0 ? `${hints.length} hint(s) from ${options.hints}` : '(none)',
      });
      logger.blank();

      const checkpointer = new MemorySaver();
      const graph = await createWikiRefreshGraph(checkpointer);

      const initialState = {
        project_path: projectPath,
        framework_path: frameworkPath,
        provider,
        since_commit: options.since,
        force: Boolean(options.force),
        pages_filter: pagesFilter,
        dry_run: Boolean(options.dryRun),
        changed_files: [],
        refresh_set: [],
        generated_pages: [],
        errors: [],
        current_phase: 'init',
        hints,
      };

      const threadId = `wiki-refresh-${path.basename(projectPath)}-${Date.now()}`;
      const config = { configurable: { thread_id: threadId } };

      if (options.dryRun) {
        logger.info('Running in dry-run mode — no files will be written.');
        logger.blank();
      }

      logger.spinner('Running wiki-refresh workflow...', 'refresh');
      const result = await graph.invoke(initialState, config);
      logger.succeedSpinner('refresh', 'Workflow complete');

      logger.blank();
      logger.section('Results');

      if (result.current_phase === 'no_changes') {
        logger.success('No changes detected. Wiki is already up to date.');
      } else {
        logger.keyValue('Changed files', String(result.changed_files?.length ?? 0));
        logger.keyValue('Pages in refresh set', String(result.refresh_set?.length ?? 0));
        logger.keyValue('Pages generated', String(result.generated_pages?.length ?? 0));

        if (options.dryRun && result.refresh_set?.length > 0) {
          logger.blank();
          logger.info('Planned refresh set:');
          logger.increaseIndent();
          for (const page of result.refresh_set) {
            logger.info(page);
          }
          logger.decreaseIndent();
        }
      }

      if (result.lint_report) {
        logger.blank();
        logger.section('Lint Report');
        const structural = result.lint_report.structural ?? [];
        const semantic = result.lint_report.semantic ?? [];

        if (structural.length === 0 && semantic.length === 0) {
          logger.success('No lint violations found.');
        } else {
          if (structural.length > 0) {
            logger.error(`Structural failures (${structural.length}):`);
            logger.increaseIndent();
            for (const v of structural) {
              logger.error(`[${v.rule}] ${v.page}: ${v.message}`);
            }
            logger.decreaseIndent();
          }
          if (semantic.length > 0) {
            logger.warn(`Semantic warnings (${semantic.length}):`);
            logger.increaseIndent();
            for (const v of semantic) {
              logger.warn(`[${v.rule}] ${v.page}: ${v.message}`);
            }
            logger.decreaseIndent();
          }
        }
      }

      if (result.errors && result.errors.length > 0) {
        logger.blank();
        logger.error('Errors:');
        logger.increaseIndent();
        for (const err of result.errors) {
          logger.error(err);
        }
        logger.decreaseIndent();
        process.exit(1);
      }

      const hasStructuralFailures = (result.lint_report?.structural?.length ?? 0) > 0;
      if (hasStructuralFailures) {
        logger.blank();
        logger.error(
          'Structural lint failures detected. Fix the violations and re-run /wiki-refresh.',
        );
        process.exit(1);
      }

      logger.blank();
      if (!options.dryRun) {
        logger.success(
          'Wiki refresh complete. Files are left uncommitted — review and commit manually.',
        );
      }

      process.exit(0);
    } catch (error) {
      logger.stopAllSpinners();
      if (
        isShuttingDown ||
        (error instanceof Error &&
          (error.message.includes('SIGINT') || error.message.includes('interrupted by user')))
      ) {
        process.exit(130);
      }
      logger.error(
        'Wiki refresh failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      process.exit(1);
    }
  });

/**
 * Infers the active provider from the project config directory when the
 * --provider flag is not passed. Defaults to 'claude' when neither config
 * dir is detected.
 */
function resolveProvider(explicitProvider: string | undefined, projectPath: string): Provider {
  if (explicitProvider) {
    const lower = explicitProvider.toLowerCase();
    if (lower === 'codex' || lower === 'openai') {
      return Provider.CODEX;
    }
    return Provider.CLAUDE;
  }

  const claudeConfig = path.join(projectPath, '.claude', 'framework-config.json');
  const codexConfig = path.join(projectPath, '.codex', 'framework-config.json');

  if (existsSync(codexConfig) && !existsSync(claudeConfig)) {
    return Provider.CODEX;
  }
  return Provider.CLAUDE;
}

program.parse();
