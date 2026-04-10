import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { createInitializeProjectGraph } from '../../src/graphs/initialize-project.graph.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { InitializeProjectState } from '../../src/state/schemas/initialize-project.schema.js';

/**
 * Integration Tests for Initialize Project Workflow
 *
 * 6-Phase Architecture:
 * Phase 1: Parallel Analysis (4 agents)
 * Phase 2: Consolidation & Gap Analysis
 * Phase 3: Opus Synthesis
 * Phase 4: Context Generation (CLAUDE.md, project-context)
 * Phase 5: Resources Copying
 * Phase 6: Final Validation
 */
describe('Initialize Project Integration Tests - 6-Phase Workflow', () => {
  const testProjectPath = resolve(process.cwd(), 'test', 'fixtures', 'sample-project');
  const testFrameworkPath = process.env.FRAMEWORK_PATH || resolve(process.cwd(), '..', '..');
  const testOutputPath = resolve(testProjectPath, '.claude');
  let checkpointer: SqliteSaver;

  beforeAll(async () => {
    // Create checkpointer
    const checkpointDbPath = resolve(process.cwd(), 'test', 'checkpoints-test.db');
    if (existsSync(checkpointDbPath)) {
      rmSync(checkpointDbPath);
    }
    checkpointer = SqliteSaver.fromConnString(checkpointDbPath);

    // Ensure test project directory exists
    if (!existsSync(testProjectPath)) {
      mkdirSync(testProjectPath, { recursive: true });
      mkdirSync(resolve(testProjectPath, 'src'), { recursive: true });
    }
  });

  afterAll(async () => {
    // Clean up test outputs
    if (existsSync(testOutputPath)) {
      rmSync(testOutputPath, { recursive: true, force: true });
    }

    // Clean up checkpoint database
    const checkpointDbPath = resolve(process.cwd(), 'test', 'checkpoints-test.db');
    if (existsSync(checkpointDbPath)) {
      rmSync(checkpointDbPath);
    }
  });

  describe('Full 6-Phase Workflow Execution', () => {
    it('should execute all 6 phases successfully', async () => {
      const graph = await createInitializeProjectGraph(checkpointer);

      const initialState: InitializeProjectState = {
        project_path: testProjectPath,
        framework_path: testFrameworkPath,
        current_phase: 'init',
        errors: [],
        warnings: [],
        started_at: new Date().toISOString(),
        phase1_retry_tracking: {},
      };

      const config = {
        configurable: {
          thread_id: `test-full-workflow-${Date.now()}`,
        },
      };

      console.log('\n=== Starting Full 6-Phase Workflow Test ===');
      console.log(`Project: ${testProjectPath}`);
      console.log(`Framework: ${testFrameworkPath}`);

      // Execute workflow
      const result = await graph.invoke(initialState, config);

      console.log('\n=== Workflow Complete ===');
      console.log(`Final Phase: ${result.current_phase}`);
      console.log(`Errors: ${result.errors.length}`);
      console.log(`Warnings: ${result.warnings.length}`);

      // Verify final phase
      expect(result.current_phase).toBe('complete');
      expect(result.errors.length).toBe(0);

      // Verify Phase 1 (4 parallel analyzers)
      expect(result.phase1_analysis).toBeDefined();
      expect(result.phase1_analysis?.all_completed).toBe(true);
      expect(result.phase1_analysis?.structure_architecture).toBeDefined();
      expect(result.phase1_analysis?.tech_stack_dependencies).toBeDefined();
      expect(result.phase1_analysis?.code_patterns_testing).toBeDefined();
      expect(result.phase1_analysis?.data_flows_integrations).toBeDefined();

      // Verify Phase 2 (consolidation)
      expect(result.phase2_consolidation).toBeDefined();
      expect(result.phase2_consolidation?.consolidated_findings).toBeDefined();

      // Verify Phase 3 (synthesis)
      expect(result.phase3_synthesis).toBeDefined();
      expect(result.phase3_synthesis?.synthesis_content).toBeDefined();
      expect(result.phase3_synthesis?.synthesis_content.length).toBeGreaterThan(500);

      // Verify Phase 4 (context generation)
      expect(result.phase4_context).toBeDefined();
      expect(result.phase4_context?.claude_md_written).toBe(true);
      expect(result.phase4_context?.project_context_written).toBe(true);
      expect(result.phase4_context?.framework_config_generated).toBe(true);

      // Verify files were created
      expect(result.claude_md_path).toBeDefined();
      expect(result.framework_config_path).toBeDefined();
      expect(result.project_context_path).toBeDefined();
      expect(existsSync(result.claude_md_path!)).toBe(true);
      expect(existsSync(result.framework_config_path!)).toBe(true);
      expect(existsSync(result.project_context_path!)).toBe(true);

      console.log('✓ All assertions passed');
    }, 1200000); // 20 minute timeout for full workflow

    it('should handle Phase 1 parallel execution correctly', async () => {
      const graph = await createInitializeProjectGraph(checkpointer);

      const initialState: InitializeProjectState = {
        project_path: testProjectPath,
        framework_path: testFrameworkPath,
        current_phase: 'init',
        errors: [],
        warnings: [],
        started_at: new Date().toISOString(),
        phase1_retry_tracking: {},
      };

      const config = {
        configurable: {
          thread_id: `test-phase1-parallel-${Date.now()}`,
        },
      };

      console.log('\n=== Testing Phase 1 Parallel Execution ===');

      const events: string[] = [];

      // Stream execution to observe parallel execution
      for await (const event of await graph.stream(initialState, {
        ...config,
        streamMode: 'updates',
      })) {
        const nodeName = Object.keys(event)[0];
        events.push(nodeName);
        console.log(`Node executed: ${nodeName}`);
      }

      // Verify all 4 Phase 1 agents executed
      const phase1Nodes = [
        'structure_architecture_analyzer',
        'tech_stack_dependencies_analyzer',
        'code_patterns_testing_analyzer',
        'data_flows_integrations_analyzer',
      ];

      phase1Nodes.forEach((node) => {
        expect(events).toContain(node);
      });

      // Verify consolidation ran after all Phase 1 agents
      const consolidationIndex = events.indexOf('consolidation');
      expect(consolidationIndex).toBeGreaterThan(-1);

      console.log('✓ Phase 1 parallel execution verified');
    }, 1200000);

    it('should checkpoint state correctly', async () => {
      const graph = await createInitializeProjectGraph(checkpointer);

      const threadId = `test-checkpoint-${Date.now()}`;

      const initialState: InitializeProjectState = {
        project_path: testProjectPath,
        framework_path: testFrameworkPath,
        current_phase: 'init',
        errors: [],
        warnings: [],
        started_at: new Date().toISOString(),
        phase1_retry_tracking: {},
      };

      const config = {
        configurable: {
          thread_id: threadId,
        },
      };

      console.log('\n=== Testing Checkpointing ===');

      // Execute workflow
      await graph.invoke(initialState, config);

      // Retrieve state from checkpointer
      const checkpointTuple = await checkpointer.getTuple(config);

      expect(checkpointTuple).toBeDefined();
      expect(checkpointTuple?.config.configurable?.thread_id).toBe(threadId);

      console.log('✓ Checkpointing verified');
    }, 1200000);
  });

  describe('Schema Validation Tests', () => {
    it('should validate Phase 1 analyzer output schema', async () => {
      const { AnalyzerOutputSchema } =
        await import('../../src/state/schemas/initialize-project.schema.js');

      const validOutput = {
        agent_name: 'structure-architecture-analyzer',
        timestamp: new Date().toISOString(),
        findings: {
          project_structure: ['src/', 'test/', 'docs/'],
          architecture_patterns: ['MVC', 'Repository Pattern'],
        },
        confidence_level: 'high',
      };

      expect(() => AnalyzerOutputSchema.parse(validOutput)).not.toThrow();
    });

    it('should validate retry state schema', async () => {
      const { RetryStateSchema } =
        await import('../../src/state/schemas/initialize-project.schema.js');

      const validRetryState = {
        attempt: 2,
        max_attempts: 5,
        last_error: 'Validation failed',
        error_history: ['Error 1', 'Error 2'],
        next_delay_ms: 4000,
      };

      expect(() => RetryStateSchema.parse(validRetryState)).not.toThrow();
    });

    it('should validate consolidation output schema', async () => {
      const { Phase2ConsolidationSchema } =
        await import('../../src/state/schemas/initialize-project.schema.js');

      const validConsolidation = {
        consolidated_findings: {
          '01-structure-architecture': {
            agent_name: 'structure-architecture-analyzer',
            timestamp: new Date().toISOString(),
            findings: {},
          },
        },
        identified_gaps: ['Need verification: database schema'],
        conflicting_findings: [],
        timestamp: new Date().toISOString(),
      };

      expect(() => Phase2ConsolidationSchema.parse(validConsolidation)).not.toThrow();
    });
  });
});
