#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInitializeProjectGraph } from '../graphs/initialize-project.graph.js';
import {
  devCheckpointer,
  initializeDevCheckpointer,
} from '../state/checkpointers/sqlite.checkpointer.js';
import { getLLMFactory } from '../llm/llm-factory.js';
import { logger } from '../utils/logger.js';
import { AgentFactory } from '../utils/shared/agent-factory/index.js';
import { runPreflightChecks } from '../utils/preflight-checks.js';
import { Provider } from '../providers/types.js';
import { setActiveProvider, resolveTempPath } from '../utils/provider-paths.js';
import { resetLLMFactory } from '../llm/llm-factory.js';
import { DebugStore, setActiveDebugStore } from '../services/framework/debug-store/index.js';
import { renderRunIndexHtml } from '../services/framework/transcripts/index.js';
import { loadClaudeSettingsEnv } from '../auth/claude-settings-loader.js';

// Get the directory where this CLI script is located
// This file is at: <framework>/orchestration/dist/cli/initialize.js
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Framework root is 3 levels up from dist/cli/initialize.js
const DEFAULT_FRAMEWORK_PATH = path.resolve(__dirname, '../../..');

const program = new Command();

program
  .name('orchestrate:initialize')
  .description('Initialize AI Agentic Framework for a project using TypeScript CLI orchestration')
  .version('1.0.0')
  .option('-p, --project-path <path>', 'Project path to initialize', process.cwd())
  .option(
    '-f, --framework-path <path>',
    'Framework path',
    process.env.FRAMEWORK_PATH || DEFAULT_FRAMEWORK_PATH,
  )
  .option(
    '--model-tier <tier>',
    'Set model tier: fast, standard, advanced, openai, or gemini (default: standard)',
  )
  .option('--list-models', 'List available model aliases and exit')
  .option('--list-tiers', 'List available tiers and exit')
  .option('--provider <provider>', 'Target provider: claude or codex (auto-detected if omitted)')
  .option('--resume <thread-id>', 'Resume from checkpoint using thread ID')
  .option('--start-phase <number>', 'Start from specific phase (1-6)', '1')
  .option('--stream', 'Stream real-time progress (not yet implemented)', false)
  .option(
    '--debug',
    'Enable verbose debug capture. Per-attempt transcripts/prompts/outputs are ALWAYS saved under .<provider>-temp/<workflow>/debug/runs/<run-id>/; this flag is kept as a verbosity knob for downstream tooling.',
    false,
  )
  .option(
    '--keep-runs <n>',
    'How many debug run folders to keep under .<provider>-temp/<workflow>/debug/runs/ (default: 10)',
    '10',
  )
  .action(async (options) => {
    if (options.debug) {
      process.env.FRAMEWORK_DEBUG = '1';
    }

    // Apply ~/.claude/settings.json env block to process.env BEFORE any auth detection.
    // The Claude CLI reads this file natively, but the framework's parent process does not —
    // running this here keeps settings.json as the single source of truth for both layers.
    const settingsResult = loadClaudeSettingsEnv();
    if (settingsResult.warning) {
      logger.warn(`Claude settings: ${settingsResult.warning}`);
    } else if (settingsResult.appliedKeys.length > 0) {
      logger.info(
        `Loaded ${settingsResult.appliedKeys.length} env var(s) from ${settingsResult.settingsPath}: ${settingsResult.appliedKeys.join(', ')}`,
      );
    }

    let isShuttingDown = false;

    const cleanup = (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.stopAllSpinners();
      console.log('\n');
      logger.warn(`Received ${signal} - Shutting down gracefully...`);

      AgentFactory.abortAllInvocations();
      AgentFactory.killAllActiveProcesses();

      logger.info('Cleanup complete');
      logger.blank();
      logger.info('You can resume this workflow later using:');
      logger.info(`  npm run initialize -- --resume <thread-id>`);
      logger.blank();

      process.exit(130);
    };

    let sigintCount = 0;
    process.on('SIGINT', () => {
      sigintCount++;
      if (sigintCount === 1) {
        cleanup('SIGINT');
      } else {
        console.log('\n');
        logger.error('Force quitting...');
        AgentFactory.abortAllInvocations();
        AgentFactory.killAllActiveProcesses();
        process.exit(130);
      }
    });

    process.on('SIGTERM', () => {
      cleanup('SIGTERM');
    });

    try {
      // ================================================================
      // PROVIDER & TIER SETUP (must happen BEFORE getLLMFactory singleton)
      // ================================================================
      if (options.modelTier) {
        process.env.MODEL_TIER = options.modelTier;
      }

      if (options.provider) {
        const providerLower = options.provider.toLowerCase();
        if (providerLower === 'codex' || providerLower === 'openai') {
          setActiveProvider(Provider.CODEX);
          process.env.PROVIDER = 'codex';
          if (!options.modelTier) {
            process.env.MODEL_TIER = 'openai';
          }
        } else if (providerLower === 'claude' || providerLower === 'anthropic') {
          setActiveProvider(Provider.CLAUDE);
          process.env.PROVIDER = 'claude';
        } else {
          logger.error(`Unknown provider: ${options.provider}. Use 'claude' or 'codex'.`);
          process.exit(1);
        }
      }

      // Reset factory in case it was created with wrong tier before
      resetLLMFactory();
      let llmFactory = getLLMFactory();

      if (options.listModels) {
        logger.section('Available Model Aliases');
        llmFactory.listAliases().forEach((alias) => {
          const info = llmFactory.getModelInfo(alias);
          logger.keyValue(alias.padEnd(20), `${info.modelId.padEnd(40)} (${info.provider})`);
        });
        process.exit(0);
      }

      if (options.listTiers) {
        logger.section('Available Model Tiers');
        llmFactory.listTiers().forEach((tier) => {
          const tierConfig = llmFactory.getTierMapping();
          logger.keyValue(tier, `${Object.keys(tierConfig).length} agents configured`);
        });
        logger.blank();
        logger.info('Set MODEL_TIER to switch tiers:');
        logger.increaseIndent();
        logger.keyValue('Example', 'export MODEL_TIER=fast', 'gray');
        logger.keyValue('Usage', 'npm run initialize -- --model-tier fast', 'gray');
        logger.decreaseIndent();
        process.exit(0);
      }

      const projectPath = path.resolve(options.projectPath);
      const frameworkPath = path.resolve(options.frameworkPath);

      const startPhase = parseInt(options.startPhase || '1', 10);
      if (isNaN(startPhase) || startPhase < 1 || startPhase > 6) {
        logger.error(`Invalid start-phase: ${options.startPhase}. Must be between 1 and 6.`);
        process.exit(1);
      }

      /**
       * Derive schema key from agent name
       * Pattern: "structure-architecture-analyzer" → "structure_architecture"
       * 1. Remove "-analyzer" suffix
       * 2. Replace hyphens with underscores
       */
      const getSchemaKeyFromAgentName = (agentName: string): string => {
        return agentName
          .replace(/-analyzer$/, '') // Remove -analyzer suffix
          .replace(/-/g, '_'); // Replace hyphens with underscores
      };

      // Import fs for phase data loading (when using --start-phase)
      const fs = await import('fs');

      // ========================================================================
      // PREFLIGHT CHECKS - SINGLE SOURCE OF TRUTH
      // ========================================================================
      logger.section('Preflight Checks');

      const preflightResult = await runPreflightChecks(projectPath, frameworkPath);

      // Display warnings (non-blocking)
      if (preflightResult.warnings.length > 0) {
        logger.blank();
        preflightResult.warnings.forEach((warning) => {
          logger.warn(warning);
        });
        logger.blank();
      }

      // Display errors and exit if any
      if (!preflightResult.success) {
        logger.blank();
        logger.error('Preflight checks failed:');
        logger.blank();
        preflightResult.errors.forEach((error) => {
          logger.error(error);
          logger.blank();
        });
        process.exit(1);
      }

      // Display success
      logger.success(`✓ Node.js ${preflightResult.nodeVersion}`);
      logger.success(`✓ npm ${preflightResult.npmVersion}`);
      if (preflightResult.claudeVersion) {
        logger.success(`✓ Claude CLI ${preflightResult.claudeVersion}`);
      }
      if (preflightResult.codexVersion) {
        logger.success(`✓ Codex CLI ${preflightResult.codexVersion}`);
      }

      // Auto-detect provider from preflight if not explicitly set
      if (!options.provider) {
        if (preflightResult.authMode === 'claude_cli') {
          setActiveProvider(Provider.CLAUDE);
          process.env.PROVIDER = 'claude';
        } else if (preflightResult.authMode === 'codex_cli') {
          setActiveProvider(Provider.CODEX);
          process.env.PROVIDER = 'codex';
          if (!options.modelTier) {
            process.env.MODEL_TIER = 'openai';
            resetLLMFactory(); // Tier changed, need to re-create factory
            llmFactory = getLLMFactory();
          }
        }
        // claude is already the default
      }

      // Show auth mode
      if (preflightResult.authMode === 'claude_cli') {
        if (process.env.ANTHROPIC_API_KEY) {
          logger.success('✓ Authentication: Anthropic API key');
        } else {
          logger.success('✓ Authentication: Claude CLI (subscription)');
        }
      } else if (preflightResult.authMode === 'codex_cli') {
        if (process.env.OPENAI_API_KEY) {
          logger.success('✓ Authentication: OpenAI API key');
        } else {
          logger.success('✓ Authentication: Codex CLI (subscription)');
        }
      }

      if (preflightResult.gitignoreUpdated) {
        logger.success('✓ .gitignore updated with framework entries');
      } else {
        logger.success('✓ .gitignore contains required entries');
      }
      logger.blank();

      // // Copy initialization agent files and hooks to target project BEFORE Phase 1
      // // Store in .claude/agents/initialization/ subdirectory to separate from implementer/planner agents
      // // This ensures Claude CLI can find them by name when invoked with --agent flag
      // const targetInitAgentsDir = path.join(projectPath, ".claude", "agents", "initialization");
      // const sourceAgentsDir = path.join(frameworkPath, "orchestration", "agents");

      // // Create target .claude/agents/initialization directory
      // fs.mkdirSync(targetInitAgentsDir, { recursive: true });

      // // Copy all initialization agent markdown files and hooks directory
      // // This includes: 01-04 (analyzers), 05 (synthesizer), 06 (consolidator), hooks/
      // if (fs.existsSync(sourceAgentsDir)) {
      //   fs.cpSync(sourceAgentsDir, targetInitAgentsDir, {
      //     recursive: true,
      //     filter: (src) => {
      //       // Copy all .md files and the hooks directory
      //       return src.endsWith(".md") || src.includes("hooks") || src === sourceAgentsDir;
      //     },
      //   });
      // }

      logger.spinner('Initializing workflow...', 'init');
      await initializeDevCheckpointer();
      const graph = await createInitializeProjectGraph(devCheckpointer);
      logger.succeedSpinner('init', 'Workflow graph compiled');

      const currentTier = llmFactory.getCurrentTier();
      const effectiveProvider = llmFactory.getEffectiveProvider();
      const tierMapping = llmFactory.getTierMapping();

      logger.section('Configuration');
      logger.table({
        Tier: currentTier,
        Provider: effectiveProvider,
        'Project Path': projectPath,
        'Framework Path': frameworkPath,
      });

      logger.blank();
      logger.info('Agent Model Mapping:');
      logger.increaseIndent();
      Object.entries(tierMapping)
        .slice(0, 5)
        .forEach(([agent, model]) => {
          logger.keyValue(agent, model, 'blue');
        });
      if (Object.keys(tierMapping).length > 5) {
        logger.info(`... and ${Object.keys(tierMapping).length - 5} more agents`);
      }
      logger.decreaseIndent();
      logger.blank();

      const tempDir = resolveTempPath(projectPath, 'initialize-project');

      // ================================================================
      // DEBUG STORE — always-on per-run artifact capture
      // ================================================================
      const runStartedAt = new Date();
      const debugStore = await DebugStore.create({
        projectPath,
        workflow: 'initialize-project',
        startedAt: runStartedAt,
      });
      setActiveDebugStore(debugStore);
      await debugStore.updateRunManifest({
        runId: debugStore.getRunContext().runId,
        workflow: 'initialize-project',
        projectPath,
        frameworkPath,
        provider: debugStore.getRunContext().provider,
        model: llmFactory.getModelInfo('structure-architecture-analyzer').alias,
        modelTier: llmFactory.getCurrentTier(),
        debug: Boolean(options.debug),
        startedAt: runStartedAt.toISOString(),
      });
      logger.info(
        `🗂  Debug run: ${debugStore.getRunContext().runId} — artifacts at ${debugStore.getRunContext().runDir}`,
      );

      const keepRuns = parseInt(options.keepRuns ?? '10', 10) || 10;
      // Prune oldest runs in the background so we don't delay the workflow.
      DebugStore.pruneRuns(projectPath, 'initialize-project', keepRuns)
        .then((deleted) => {
          if (deleted.length > 0) {
            logger.info(
              `🧹 Pruned ${deleted.length} old debug run(s): ${deleted.slice(0, 3).join(', ')}${deleted.length > 3 ? ' …' : ''}`,
            );
          }
        })
        .catch(() => undefined);

      let previousPhaseData = {};
      if (startPhase > 1) {
        logger.info(`Starting from Phase ${startPhase} - loading previous phase outputs...`);

        if (!fs.existsSync(tempDir)) {
          logger.error(`Cannot start from Phase ${startPhase}: temp directory not found`);
          logger.increaseIndent();
          logger.info(`Expected: ${tempDir}`);
          logger.info('Run Phase 1 first or remove --start-phase flag');
          logger.decreaseIndent();
          process.exit(1);
        }

        try {
          if (startPhase >= 2) {
            const phase1Dir = path.join(tempDir, 'phase1-outputs');
            if (!fs.existsSync(phase1Dir)) {
              logger.error(`Cannot start from Phase ${startPhase}: Phase 1 outputs not found`);
              logger.increaseIndent();
              logger.info(`Expected: ${phase1Dir}`);
              logger.info('Run from Phase 1 first or use a lower --start-phase value');
              logger.decreaseIndent();
              process.exit(1);
            }

            const phase1Files = fs.readdirSync(phase1Dir);
            const phase1Analysis: any = {};

            for (const file of phase1Files) {
              if (file.endsWith('.json')) {
                const content = JSON.parse(fs.readFileSync(path.join(phase1Dir, file), 'utf-8'));
                const agentName = content.agent_name;

                const schemaKey = getSchemaKeyFromAgentName(agentName);
                phase1Analysis[schemaKey] = content;
              }
            }

            const requiredAgentNames = [
              'structure-architecture-analyzer',
              'tech-stack-dependencies-analyzer',
              'code-patterns-testing-analyzer',
              'data-flows-integrations-analyzer',
            ];
            const requiredSchemaKeys = requiredAgentNames.map(getSchemaKeyFromAgentName);
            const missingAnalyzers = requiredSchemaKeys.filter((key) => !phase1Analysis[key]);
            if (missingAnalyzers.length > 0) {
              logger.error(
                `Cannot start from Phase ${startPhase}: Missing Phase 1 analyzer outputs`,
              );
              logger.increaseIndent();
              logger.info(`Missing: ${missingAnalyzers.join(', ')}`);
              logger.info('Run from Phase 1 first or use a lower --start-phase value');
              logger.decreaseIndent();
              process.exit(1);
            }

            phase1Analysis.all_completed = true;
            phase1Analysis.completion_timestamp = new Date().toISOString();

            previousPhaseData = {
              ...previousPhaseData,
              phase1_analysis: phase1Analysis,
            };
            logger.info(
              `  ✓ Loaded Phase 1 outputs (${Object.keys(phase1Analysis).length} analyzers)`,
            );
          }

          if (startPhase >= 3) {
            const consolidationPath = path.join(tempDir, 'phase2-consolidation.json');
            if (fs.existsSync(consolidationPath)) {
              const consolidation = JSON.parse(fs.readFileSync(consolidationPath, 'utf-8'));
              previousPhaseData = {
                ...previousPhaseData,
                phase2_consolidation: consolidation,
              };
              logger.info(`  ✓ Loaded Phase 2 consolidation`);
            } else {
              logger.error(
                `Cannot start from Phase ${startPhase}: Phase 2 consolidation not found`,
              );
              logger.increaseIndent();
              logger.info(`Expected: ${consolidationPath}`);
              logger.info('Run from Phase 1 first or use a lower --start-phase value');
              logger.decreaseIndent();
              process.exit(1);
            }
          }

          if (startPhase >= 4) {
            const synthesisPath = path.join(tempDir, 'synthesis-raw.md');
            if (fs.existsSync(synthesisPath)) {
              const synthesisContent = fs.readFileSync(synthesisPath, 'utf-8');
              previousPhaseData = {
                ...previousPhaseData,
                phase3_synthesis: { synthesis_content: synthesisContent },
              };
              logger.info(`  ✓ Loaded Phase 3 synthesis`);
            } else {
              logger.error(`Cannot start from Phase ${startPhase}: Phase 3 synthesis not found`);
              logger.increaseIndent();
              logger.info(`Expected: ${synthesisPath}`);
              logger.info('Run from Phase 1 first or use a lower --start-phase value');
              logger.decreaseIndent();
              process.exit(1);
            }
          }

          logger.blank();
        } catch (error) {
          logger.error(`Failed to load previous phase data: ${(error as Error).message}`);
          process.exit(1);
        }
      }

      const initialState = {
        project_path: projectPath,
        framework_path: frameworkPath,
        temp_dir: tempDir,
        current_phase: 'init' as const,
        errors: [],
        warnings: [],
        start_phase: startPhase,
        ...previousPhaseData,
      };

      const threadId = options.resume || `init-${path.basename(projectPath)}-${Date.now()}`;
      const config = {
        configurable: { thread_id: threadId },
      };

      logger.keyValue('Thread ID', threadId, 'gray');
      if (options.resume) {
        logger.info('Resuming from checkpoint...');
      } else {
        logger.info('Starting new workflow...');
      }
      logger.blank();

      if (options.stream) {
        logger.warn('Streaming not yet implemented, falling back to non-streaming execution');
      }

      const result = await graph.invoke(initialState, config);

      logger.blank();

      // Finalize debug run — update manifest with end time, render index.html.
      try {
        const endedAt = new Date();
        await debugStore.updateRunManifest({
          endedAt: endedAt.toISOString(),
          durationMs: endedAt.getTime() - runStartedAt.getTime(),
        });
        const indexHtml = await buildRunIndexHtml(debugStore);
        const fs = await import('fs/promises');
        const indexPath = `${debugStore.getRunContext().runDir}/index.html`;
        await fs.writeFile(indexPath, indexHtml, 'utf-8');
        logger.info(`🗂  Debug run index: ${indexPath}`);
        await debugStore.updateLatestPointer().catch(() => undefined);
      } catch (err) {
        logger.warn(
          `Failed to finalize debug run index: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      logger.section('Initialization Complete');

      logger.info('Generated Files:');
      logger.increaseIndent();
      if (result.claude_md_path) {
        logger.keyValue('CLAUDE.md', result.claude_md_path, 'green');
      }
      if (result.project_context_path) {
        logger.keyValue('project-context/SKILL.md', result.project_context_path, 'green');
      }
      if (result.framework_config_path) {
        logger.keyValue('framework-config.json', result.framework_config_path, 'green');
      }
      logger.decreaseIndent();
      logger.blank();

      if (result.phase3_synthesis?.synthesis_content) {
        logger.info('Project Analysis Summary:');
        logger.increaseIndent();
        const summary = result.phase3_synthesis.synthesis_content.substring(0, 300) + '...';
        logger.info(summary);
        logger.decreaseIndent();
        logger.blank();
      }

      if (result.warnings && result.warnings.length > 0) {
        logger.warn('Warnings encountered:');
        logger.increaseIndent();
        result.warnings.forEach((warning: string) => logger.warn(warning));
        logger.decreaseIndent();
        logger.blank();
      }

      if (result.errors && result.errors.length > 0) {
        logger.error('Errors encountered:');
        logger.increaseIndent();
        result.errors.forEach((error: string) => logger.error(error));
        logger.decreaseIndent();
        process.exit(1);
      }

      logger.section('Next Steps');
      logger.info('1. Review CLAUDE.md for project context');
      logger.info('2. Check framework-config.json for configuration');
      logger.info('3. Explore project-context/SKILL.md for project-specific guidance');
      logger.blank();

      process.exit(0);
    } catch (error) {
      logger.stopAllSpinners();
      logger.blank();

      if (
        isShuttingDown ||
        (error instanceof Error &&
          (error.message.includes('SIGINT') || error.message.includes('interrupted by user')))
      ) {
        logger.info('Cleanup complete');
        logger.blank();
        logger.info('You can resume this workflow later using:');
        logger.info(`  npm run initialize -- --resume <thread-id>`);
        logger.blank();
        process.exit(130); // Standard SIGINT exit code (128 + 2)
      }

      logger.error('Workflow failed', error instanceof Error ? error : new Error(String(error)));
      logger.blank();
      process.exit(1);
    }
  });

/**
 * Crawl the run folder for every meta.json and assemble a run-wide index HTML.
 * Only looks at files that the debug store itself wrote, so the output is
 * internally consistent with the per-attempt HTML pages.
 */
async function buildRunIndexHtml(debugStore: DebugStore): Promise<string> {
  const fs = await import('fs/promises');
  const pathMod = await import('path');
  const runDir = debugStore.getRunContext().runDir;

  type AttemptEntry = {
    metaPath: string;
    attemptDir: string;
  };
  const entries: AttemptEntry[] = [];

  async function walk(dir: string): Promise<void> {
    let dirents: import('fs').Dirent[] = [];
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const full = pathMod.join(dir, d.name);
      if (d.isDirectory()) {
        await walk(full);
      } else if (d.isFile() && d.name === 'meta.json') {
        entries.push({ metaPath: full, attemptDir: dir });
      }
    }
  }
  await walk(runDir);

  const rows = await Promise.all(
    entries.map(async (entry) => {
      try {
        const content = await fs.readFile(entry.metaPath, 'utf-8');
        const meta = JSON.parse(content);
        const htmlRel = pathMod.relative(runDir, entry.attemptDir) + '/transcript.html';
        const htmlAbs = pathMod.join(entry.attemptDir, 'transcript.html');
        let exists = true;
        try {
          await fs.access(htmlAbs);
        } catch {
          exists = false;
        }
        return { meta, htmlHref: exists ? htmlRel : null };
      } catch {
        return null;
      }
    }),
  );
  const filtered = rows.filter((r): r is { meta: any; htmlHref: string | null } => r !== null);

  const manifest = (await debugStore.readRunManifest()) ?? {
    runId: debugStore.getRunContext().runId,
    workflow: debugStore.getRunContext().workflow,
    projectPath: debugStore.getRunContext().projectPath,
    provider: debugStore.getRunContext().provider,
    debug: false,
    startedAt: debugStore.getRunContext().startedAt,
  };
  return renderRunIndexHtml({ manifest, attempts: filtered });
}

program.parse();
