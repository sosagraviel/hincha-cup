import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { createInitializeProjectGraph } from '../../src/graphs/initialize-project.graph.js';
import type { InitializeProjectState } from '../../src/state/schemas/initialize-project.schema.js';

describe.skip('End-to-End: Orchestration Self-Test', () => {
  const orchestrationPath = resolve(process.cwd());
  const frameworkPath = process.env.FRAMEWORK_PATH || resolve(orchestrationPath, '..', '..');

  it.skip('should successfully analyze the orchestration project itself', async () => {
    const graph = await createInitializeProjectGraph(undefined);

    const initialState: InitializeProjectState = {
      project_path: orchestrationPath,
      framework_path: frameworkPath,
      current_phase: 'detect_stack',
      errors: [],
      warnings: []
    };

    const result = await graph.invoke(initialState);

    // Verify TypeScript detection
    const languageNames = result.stack_profile!.languages.map(l =>
      typeof l === 'string' ? l : l.name
    );
    expect(languageNames).toContain('typescript');

    // Verify pnpm detection
    expect(result.stack_profile?.package_manager).toBe('pnpm');

    // Verify skills resolved
    expect(result.skills).toBeDefined();
    expect(result.skills!.length).toBeGreaterThan(0);

    // Verify TypeScript skills included
    const tsSkills = result.skills!.filter(s =>
      s.compatible_languages?.includes('typescript')
    );
    expect(tsSkills.length).toBeGreaterThan(0);

    // Verify agents generated
    expect(result.agents_generated).toBeDefined();
    const plannerAgent = result.agents_generated!.find(a => a.name === 'planner');
    expect(plannerAgent).toBeDefined();

    const tsImplementer = result.agents_generated!.find(a => a.name === 'implementer-typescript');
    expect(tsImplementer).toBeDefined();

    // Verify config created
    expect(result.framework_config).toBeDefined();
    expect(result.framework_config?.project_metadata.project_name).toBe('orchestration');

    console.log('\n✅ Self-test completed successfully!');
    console.log(`  Detected languages: ${languageNames.join(', ')}`);
    console.log(`  Skills resolved: ${result.skills!.length}`);
    console.log(`  Agents generated: ${result.agents_generated!.length}`);
  }, 60000); // 60 second timeout for full workflow
});
