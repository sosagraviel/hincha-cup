/**
 * Integration Tests for Phase 1 Automation Detection
 *
 * Tests end-to-end automation detection on different project types:
 * 1. Makefile-based project
 * 2. npm scripts only project
 * 3. Mixed automation project
 *
 * Verifies correct command priority in synthesis output and graceful degradation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve, join } from 'path';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { createInitializeProjectGraph } from '../../src/graphs/initialize-project.graph.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { InitializeProjectState } from '../../src/state/schemas/initialize-project.schema.js';

describe('Phase 1 Automation Detection Integration Tests', () => {
  const testBaseDir = resolve(process.cwd(), 'test', 'fixtures', 'automation-projects');
  const testFrameworkPath = process.env.FRAMEWORK_PATH || resolve(process.cwd(), '..', '..');
  let checkpointer: SqliteSaver;

  beforeAll(async () => {
    // Create checkpointer
    const checkpointDbPath = resolve(process.cwd(), 'test', 'automation-checkpoints-test.db');
    if (existsSync(checkpointDbPath)) {
      rmSync(checkpointDbPath);
    }
    checkpointer = SqliteSaver.fromConnString(checkpointDbPath);

    // Create base test directory
    if (!existsSync(testBaseDir)) {
      mkdirSync(testBaseDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // Clean up all test projects
    if (existsSync(testBaseDir)) {
      rmSync(testBaseDir, { recursive: true, force: true });
    }

    // Clean up checkpoint database
    const checkpointDbPath = resolve(process.cwd(), 'test', 'automation-checkpoints-test.db');
    if (existsSync(checkpointDbPath)) {
      rmSync(checkpointDbPath);
    }
  });

  describe('Makefile-based project', () => {
    let projectPath: string;

    beforeEach(() => {
      projectPath = join(testBaseDir, 'makefile-project');

      // Clean up and recreate project
      if (existsSync(projectPath)) {
        rmSync(projectPath, { recursive: true, force: true });
      }
      mkdirSync(projectPath, { recursive: true });
      mkdirSync(join(projectPath, 'src'), { recursive: true });

      // Create Makefile with targets
      writeFileSync(
        join(projectPath, 'Makefile'),
        `
.PHONY: build test clean deploy dev

dev:
\tpython -m uvicorn app:app --reload

build:
\tdocker build -t myapp .

test:
\tpytest tests/ -v

clean:
\trm -rf dist/ __pycache__/

deploy: build
\tdocker push myapp:latest
`,
      );

      // Create package.json for service detection
      writeFileSync(
        join(projectPath, 'package.json'),
        JSON.stringify(
          {
            name: 'makefile-project',
            version: '1.0.0',
            scripts: {
              start: 'node dist/index.js',
              dev: 'nodemon src/index.ts',
            },
            dependencies: {
              express: '^4.18.0',
            },
          },
          null,
          2,
        ),
      );

      // Create basic TypeScript files
      writeFileSync(
        join(projectPath, 'src', 'index.ts'),
        `
import express from 'express';
const app = express();
app.listen(3000);
`,
      );

      // Create README with documented commands
      writeFileSync(
        join(projectPath, 'README.md'),
        `
# Makefile Project

## Getting Started

\`\`\`bash
make dev
\`\`\`

## Building

\`\`\`bash
make build
\`\`\`

## Testing

\`\`\`bash
make test
\`\`\`
`,
      );
    });

    it('should detect Makefile targets and prioritize documented commands correctly', async () => {
      const graph = await createInitializeProjectGraph(checkpointer);

      const initialState: InitializeProjectState = {
        project_path: projectPath,
        framework_path: testFrameworkPath,
        current_phase: 'phase1_analysis',
        temp_dir: join(projectPath, '.claude-temp'),
        phase1_analysis: { all_completed: false },
        phase1_retry_tracking: {},
        errors: [],
        warnings: [],
      };

      // Run through Phase 1 only (analysis phase)
      const config = { configurable: { thread_id: 'test-makefile-automation' } };
      let finalState: InitializeProjectState = initialState;

      for await (const chunk of await graph.stream(initialState, {
        ...config,
        streamMode: 'updates',
      })) {
        const [nodeName, nodeState] = Object.entries(chunk)[0];
        finalState = nodeState as InitializeProjectState;

        // Stop after Phase 1 completes
        if (finalState.current_phase === 'phase2_consolidation') {
          break;
        }
      }

      // Verify automation was detected
      expect(finalState.current_phase).toBe('phase2_consolidation');

      // Check that Phase 1 outputs exist
      const structureOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '01-structure-architecture.json',
      );
      const techStackOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '02-tech-stack-dependencies.json',
      );

      expect(existsSync(structureOutputPath)).toBe(true);
      expect(existsSync(techStackOutputPath)).toBe(true);

      // Read and verify structure analyzer found automation
      const structureOutput = JSON.parse(require('fs').readFileSync(structureOutputPath, 'utf8'));
      expect(structureOutput.findings.automation).toBeDefined();
      expect(structureOutput.findings.automation.makefiles).toHaveLength(1);
      expect(structureOutput.findings.automation.makefiles[0].targets).toContain('dev');
      expect(structureOutput.findings.automation.makefiles[0].targets).toContain('build');
      expect(structureOutput.findings.automation.makefiles[0].targets).toContain('test');

      // Read and verify tech stack analyzer found documented commands
      const techStackOutput = JSON.parse(require('fs').readFileSync(techStackOutputPath, 'utf8'));
      expect(techStackOutput.findings.documented_commands).toBeDefined();
      expect(techStackOutput.findings.documented_commands.by_task.dev).toContain('make dev');
      expect(techStackOutput.findings.documented_commands.source).toBe('documented');
    }, 180000); // 3 minute timeout for integration test
  });

  describe('npm scripts only project', () => {
    let projectPath: string;

    beforeEach(() => {
      projectPath = join(testBaseDir, 'npm-project');

      // Clean up and recreate project
      if (existsSync(projectPath)) {
        rmSync(projectPath, { recursive: true, force: true });
      }
      mkdirSync(projectPath, { recursive: true });
      mkdirSync(join(projectPath, 'src'), { recursive: true });

      // Create package.json with scripts
      writeFileSync(
        join(projectPath, 'package.json'),
        JSON.stringify(
          {
            name: 'npm-project',
            version: '1.0.0',
            scripts: {
              dev: 'next dev',
              build: 'next build',
              test: 'jest',
              lint: 'eslint . --ext ts,tsx',
              typecheck: 'tsc --noEmit',
            },
            dependencies: {
              next: '^14.0.0',
              react: '^18.0.0',
            },
            devDependencies: {
              jest: '^29.0.0',
              eslint: '^8.0.0',
              typescript: '^5.0.0',
            },
          },
          null,
          2,
        ),
      );

      // Create basic React component
      writeFileSync(
        join(projectPath, 'src', 'page.tsx'),
        `
export default function Page() {
  return <div>Hello World</div>;
}
`,
      );

      // No README or Makefile - should fall back to package.json scripts
    });

    it('should fall back to package.json scripts when no other automation exists', async () => {
      const graph = await createInitializeProjectGraph(checkpointer);

      const initialState: InitializeProjectState = {
        project_path: projectPath,
        framework_path: testFrameworkPath,
        current_phase: 'phase1_analysis',
        temp_dir: join(projectPath, '.claude-temp'),
        phase1_analysis: { all_completed: false },
        phase1_retry_tracking: {},
        errors: [],
        warnings: [],
      };

      // Run through Phase 1 only
      const config = { configurable: { thread_id: 'test-npm-automation' } };
      let finalState: InitializeProjectState = initialState;

      for await (const chunk of await graph.stream(initialState, {
        ...config,
        streamMode: 'updates',
      })) {
        const [nodeName, nodeState] = Object.entries(chunk)[0];
        finalState = nodeState as InitializeProjectState;

        if (finalState.current_phase === 'phase2_consolidation') {
          break;
        }
      }

      expect(finalState.current_phase).toBe('phase2_consolidation');

      const structureOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '01-structure-architecture.json',
      );
      const techStackOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '02-tech-stack-dependencies.json',
      );

      expect(existsSync(structureOutputPath)).toBe(true);
      expect(existsSync(techStackOutputPath)).toBe(true);

      // Structure analyzer should find no automation files
      const structureOutput = JSON.parse(require('fs').readFileSync(structureOutputPath, 'utf8'));
      expect(structureOutput.findings.automation?.makefiles).toBeUndefined();
      expect(structureOutput.findings.automation?.shell_scripts).toBeUndefined();

      // Tech stack analyzer should have commands with package_json source
      const techStackOutput = JSON.parse(require('fs').readFileSync(techStackOutputPath, 'utf8'));
      expect(techStackOutput.findings.documented_commands?.by_task.dev).toBeTruthy();
      expect(techStackOutput.findings.documented_commands?.source).toBe('package_json');
    }, 180000);
  });

  describe('mixed automation project', () => {
    let projectPath: string;

    beforeEach(() => {
      projectPath = join(testBaseDir, 'mixed-project');

      // Clean up and recreate project
      if (existsSync(projectPath)) {
        rmSync(projectPath, { recursive: true, force: true });
      }
      mkdirSync(projectPath, { recursive: true });
      mkdirSync(join(projectPath, 'scripts'), { recursive: true });

      // Create Makefile
      writeFileSync(
        join(projectPath, 'Makefile'),
        `
dev:
\tnpm run dev

build:
\tnpm run build

test:
\tmake test-unit
\tmake test-e2e
`,
      );

      // Create shell scripts
      writeFileSync(
        join(projectPath, 'scripts', 'setup.sh'),
        `#!/bin/bash
# Project setup script
# Installs dependencies and sets up the development environment

npm install
cp .env.example .env
echo "Setup complete!"
`,
      );

      // Make shell script executable
      require('fs').chmodSync(join(projectPath, 'scripts', 'setup.sh'), 0o755);

      // Create package.json
      writeFileSync(
        join(projectPath, 'package.json'),
        JSON.stringify(
          {
            name: 'mixed-project',
            version: '1.0.0',
            scripts: {
              dev: 'vite dev',
              build: 'vite build',
              test: 'vitest',
              setup: './scripts/setup.sh',
            },
            dependencies: {
              vite: '^5.0.0',
            },
          },
          null,
          2,
        ),
      );

      // Create conflicting README
      writeFileSync(
        join(projectPath, 'README.md'),
        `
# Mixed Project

## Development

Use our custom make targets:

\`\`\`bash
make dev    # Start development server
make build  # Build for production
\`\`\`

## Setup

\`\`\`bash
./scripts/setup.sh
\`\`\`
`,
      );
    });

    it('should detect all automation types and handle command priority correctly', async () => {
      const graph = await createInitializeProjectGraph(checkpointer);

      const initialState: InitializeProjectState = {
        project_path: projectPath,
        framework_path: testFrameworkPath,
        current_phase: 'phase1_analysis',
        temp_dir: join(projectPath, '.claude-temp'),
        phase1_analysis: { all_completed: false },
        phase1_retry_tracking: {},
        errors: [],
        warnings: [],
      };

      const config = { configurable: { thread_id: 'test-mixed-automation' } };
      let finalState: InitializeProjectState = initialState;

      for await (const chunk of await graph.stream(initialState, {
        ...config,
        streamMode: 'updates',
      })) {
        const [nodeName, nodeState] = Object.entries(chunk)[0];
        finalState = nodeState as InitializeProjectState;

        if (finalState.current_phase === 'phase2_consolidation') {
          break;
        }
      }

      expect(finalState.current_phase).toBe('phase2_consolidation');

      const structureOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '01-structure-architecture.json',
      );
      const techStackOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '02-tech-stack-dependencies.json',
      );

      expect(existsSync(structureOutputPath)).toBe(true);
      expect(existsSync(techStackOutputPath)).toBe(true);

      // Verify all automation types detected
      const structureOutput = JSON.parse(require('fs').readFileSync(structureOutputPath, 'utf8'));
      expect(structureOutput.findings.automation).toBeDefined();
      expect(structureOutput.findings.automation.makefiles).toHaveLength(1);
      expect(structureOutput.findings.automation.makefiles[0].targets).toContain('dev');
      expect(structureOutput.findings.automation.shell_scripts).toHaveLength(1);
      expect(structureOutput.findings.automation.shell_scripts[0].name).toBe('setup.sh');
      expect(structureOutput.findings.automation.shell_scripts[0].purpose).toContain('setup');

      // Verify documented commands have correct priority
      const techStackOutput = JSON.parse(require('fs').readFileSync(techStackOutputPath, 'utf8'));
      expect(techStackOutput.findings.documented_commands).toBeDefined();
      expect(techStackOutput.findings.documented_commands.by_task.dev).toContain('make dev');
      expect(techStackOutput.findings.documented_commands.source).toBe('documented');

      // Should detect conflicts between documented and discovered commands
      const conflicts = techStackOutput.findings.documented_commands.conflicts;
      if (conflicts && conflicts.length > 0) {
        expect(
          conflicts.some((c: any) => c.documented.includes('make') && c.discovered.includes('npm')),
        ).toBe(true);
      }
    }, 180000);
  });

  describe('graceful degradation', () => {
    let projectPath: string;

    beforeEach(() => {
      projectPath = join(testBaseDir, 'minimal-project');

      // Clean up and recreate project
      if (existsSync(projectPath)) {
        rmSync(projectPath, { recursive: true, force: true });
      }
      mkdirSync(projectPath, { recursive: true });
      mkdirSync(join(projectPath, 'src'), { recursive: true });

      // Create minimal project with just a TypeScript file
      writeFileSync(
        join(projectPath, 'src', 'index.ts'),
        `
console.log('Hello World');
`,
      );

      // No package.json, no automation files
    });

    it('should gracefully handle projects with no automation', async () => {
      const graph = await createInitializeProjectGraph(checkpointer);

      const initialState: InitializeProjectState = {
        project_path: projectPath,
        framework_path: testFrameworkPath,
        current_phase: 'phase1_analysis',
        temp_dir: join(projectPath, '.claude-temp'),
        phase1_analysis: { all_completed: false },
        phase1_retry_tracking: {},
        errors: [],
        warnings: [],
      };

      const config = { configurable: { thread_id: 'test-minimal-automation' } };
      let finalState: InitializeProjectState = initialState;

      for await (const chunk of await graph.stream(initialState, {
        ...config,
        streamMode: 'updates',
      })) {
        const [nodeName, nodeState] = Object.entries(chunk)[0];
        finalState = nodeState as InitializeProjectState;

        if (finalState.current_phase === 'phase2_consolidation') {
          break;
        }
      }

      expect(finalState.current_phase).toBe('phase2_consolidation');
      expect(finalState.errors.length).toBe(0); // Should not error out

      const structureOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '01-structure-architecture.json',
      );
      const techStackOutputPath = join(
        finalState.temp_dir!,
        'phase1-outputs',
        '02-tech-stack-dependencies.json',
      );

      expect(existsSync(structureOutputPath)).toBe(true);
      expect(existsSync(techStackOutputPath)).toBe(true);

      // Should work without automation fields
      const structureOutput = JSON.parse(require('fs').readFileSync(structureOutputPath, 'utf8'));
      expect(structureOutput.findings.services).toHaveLength(1);
      expect(structureOutput.findings.automation).toBeUndefined();

      const techStackOutput = JSON.parse(require('fs').readFileSync(techStackOutputPath, 'utf8'));
      expect(techStackOutput.findings.documented_commands).toBeUndefined();
    }, 180000);
  });
});
