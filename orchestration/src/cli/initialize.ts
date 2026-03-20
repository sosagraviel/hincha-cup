#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { createInitializeProjectGraph } from '../graphs/initialize-project.graph.js';
import { devCheckpointer, initializeDevCheckpointer } from '../state/checkpointers/sqlite.checkpointer.js';
import { getLLMFactory } from '../llm/llm-factory.js';
import { logger } from '../utils/logger.js';
import { HybridAgentFactory } from '../agents/agent-factory-hybrid.js';

const program = new Command();

program
  .name('orchestrate:initialize')
  .description('Initialize AI Agentic Framework for a project using TypeScript DeepAgents orchestration')
  .version('1.0.0')
  .option('-p, --project-path <path>', 'Project path to initialize', process.cwd())
  .option('-f, --framework-path <path>', 'Framework path', process.env.FRAMEWORK_PATH || path.join(process.cwd(), '../..'))
  .option('--model-tier <tier>', 'Set model tier: fast, standard, advanced, openai, or gemini (default: standard)')
  .option('--list-models', 'List available model aliases and exit')
  .option('--list-tiers', 'List available tiers and exit')
  .option('--resume <thread-id>', 'Resume from checkpoint using thread ID')
  .option('--stream', 'Stream real-time progress (not yet implemented)', false)
  .action(async (options) => {
    // Handle CTRL+C gracefully
    let isShuttingDown = false;

    const cleanup = (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      // Stop all spinners immediately
      logger.stopAllSpinners();

      console.log('\n');
      logger.warn(`Received ${signal} - Shutting down gracefully...`);

      // CRITICAL: Kill all active Claude CLI processes FIRST (synchronous)
      // This must happen before anything else to prevent orphaned processes
      HybridAgentFactory.killAllActiveProcesses();

      logger.info('Cleanup complete');
      logger.blank();
      logger.info('You can resume this workflow later using:');
      logger.info(`  npm run initialize -- --resume <thread-id>`);
      logger.blank();

      // Exit immediately with standard interrupted code (128 + 2 for SIGINT)
      process.exit(signal === 'SIGINT' ? 130 : 143);
    };

    // First CTRL+C: graceful shutdown
    // Second CTRL+C: force quit immediately
    let sigintCount = 0;
    process.on('SIGINT', () => {
      sigintCount++;
      if (sigintCount === 1) {
        cleanup('SIGINT');
      } else {
        // Second CTRL+C: force quit immediately
        console.log('\n');
        logger.error('Force quitting...');
        HybridAgentFactory.killAllActiveProcesses();
        process.exit(130);
      }
    });

    process.on('SIGTERM', () => cleanup('SIGTERM'));

    try {
      const llmFactory = getLLMFactory();

      // List available models
      if (options.listModels) {
        logger.section('Available Model Aliases');
        llmFactory.listAliases().forEach(alias => {
          const info = llmFactory.getModelInfo(alias);
          logger.keyValue(alias.padEnd(20), `${info.modelId.padEnd(40)} (${info.provider})`);
        });
        process.exit(0);
      }

      // List available tiers
      if (options.listTiers) {
        logger.section('Available Model Tiers');
        llmFactory.listTiers().forEach(tier => {
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

      // Apply tier via environment variable
      if (options.modelTier) {
        process.env.MODEL_TIER = options.modelTier;
      }

      // Resolve paths
      const projectPath = path.resolve(options.projectPath);
      const frameworkPath = path.resolve(options.frameworkPath);

      // Validate paths exist
      const fs = await import('fs');
      if (!fs.existsSync(projectPath)) {
        logger.error(`Project path does not exist: ${projectPath}`);
        process.exit(1);
      }
      if (!fs.existsSync(frameworkPath)) {
        logger.error(`Framework path does not exist: ${frameworkPath}`);
        logger.increaseIndent();
        logger.info('Set FRAMEWORK_PATH environment variable or use --framework-path flag');
        logger.decreaseIndent();
        process.exit(1);
      }

      // Initialize workflow
      const initSpinner = logger.spinner('Initializing workflow...', 'init');

      // Initialize checkpointer
      await initializeDevCheckpointer();

      // Create graph
      const graph = await createInitializeProjectGraph(devCheckpointer);
      logger.succeedSpinner('init', 'Workflow graph compiled');

      // Display configuration
      const currentTier = llmFactory.getCurrentTier();
      const effectiveProvider = llmFactory.getEffectiveProvider();
      const tierMapping = llmFactory.getTierMapping();

      logger.section('Configuration');
      logger.table({
        'Tier': currentTier,
        'Provider': effectiveProvider,
        'Project Path': projectPath,
        'Framework Path': frameworkPath
      });

      logger.blank();
      logger.info('Agent Model Mapping:');
      logger.increaseIndent();
      Object.entries(tierMapping).slice(0, 5).forEach(([agent, model]) => {
        logger.keyValue(agent, model, 'blue');
      });
      if (Object.keys(tierMapping).length > 5) {
        logger.info(`... and ${Object.keys(tierMapping).length - 5} more agents`);
      }
      logger.decreaseIndent();
      logger.blank();

      // Prepare initial state
      const tempDir = path.join(projectPath, '.claude-temp/initialize-project');
      const initialState = {
        project_path: projectPath,
        framework_path: frameworkPath,
        temp_dir: tempDir,
        current_phase: 'init' as const,
        errors: [],
        warnings: []
      };

      // Prepare config for execution
      const threadId = options.resume || `init-${path.basename(projectPath)}-${Date.now()}`;
      const config = {
        configurable: { thread_id: threadId }
      };

      logger.keyValue('Thread ID', threadId, 'gray');
      if (options.resume) {
        logger.info('Resuming from checkpoint...');
      } else {
        logger.info('Starting new workflow...');
      }
      logger.blank();

      // Execute workflow
      const executionSpinner = logger.spinner('Executing 6-phase workflow...', 'execution');

      if (options.stream) {
        // TODO: Implement streaming
        logger.warnSpinner('execution', 'Streaming not yet implemented, falling back to non-streaming execution');
        logger.spinner('Executing 6-phase workflow...', 'execution');
      }

      const result = await graph.invoke(initialState, config);

      logger.succeedSpinner('execution', 'Workflow completed successfully!');
      logger.blank();

      // Display results
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

      logger.error('Workflow failed', error instanceof Error ? error : new Error(String(error)));
      logger.blank();
      process.exit(1);
    }
  });

program.parse();
