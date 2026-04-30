import { describe, it, expect } from 'vitest';
import { assignSkillsToAgents } from '../../../../../../src/nodes/initialize-project/phase5/helpers/skill-assigner.js';
import type {
  AgentRole,
  ResolvedSkill,
} from '../../../../../../src/nodes/initialize-project/phase5/types.js';
import type { StackProfile } from '../../../../../../src/schemas/index.js';

/**
 * Skill assigner tests.
 *
 * The load-bearing contract: skills with `agent_roles: ["implementer"]`
 * must NOT land on the planner. The planner produces plans — it does not
 * run jest, drive playwright, or shell out to docker. Bloating its
 * preloaded context with tooling skill bodies wastes ~50–80 KB per
 * planner spawn × every ticket × 600 projects × 6000 developers.
 *
 * The user's exact spec for a TS+React project (plan.md §B):
 *
 *   YES on planner:
 *     figma-design-fetcher, mastering-typescript, react-frontend,
 *     atomic-design-react, code-conventions, multi-file-workflows,
 *     testing-conventions
 *
 *   NO on planner:
 *     jest-coverage-automation, playwright-e2e-automation, ui-testing,
 *     ui-visual-testing, developing-with-docker
 *
 * The implementer-typescript agent should still inherit those tooling
 * skills — they just don't belong on the planner.
 */

function skill(
  name: string,
  opts: {
    compatible_languages?: string[];
    agent_roles?: AgentRole[];
    is_linkable_to_agents?: boolean;
  } = {},
): ResolvedSkill {
  return {
    name,
    path: `/framework/skills/${name}`,
    relative_path: name,
    reason: `Triggered by: ${name}`,
    description: name,
    trigger_mode: 'triggered',
    compatible_languages: opts.compatible_languages,
    is_linkable_to_agents: opts.is_linkable_to_agents,
    agent_roles: opts.agent_roles,
  };
}

const TS_REACT_STACK: StackProfile = {
  is_monorepo: true,
  services: [
    {
      id: 'web',
      path: 'apps/web',
      type: 'frontend',
      language: 'typescript',
      frameworks: { main: 'React' },
    },
    {
      id: 'api',
      path: 'apps/api',
      type: 'backend',
      language: 'typescript',
      frameworks: { main: 'NestJS' },
    },
  ],
};

describe('assignSkillsToAgents — agent_roles filtering', () => {
  it('keeps tooling-only skills off the planner for a TS+React project (plan §B regression)', () => {
    const resolved: ResolvedSkill[] = [
      // Should land on BOTH (no agent_roles → default both)
      skill('mastering-typescript', { compatible_languages: ['typescript'] }),
      skill('react-frontend', { compatible_languages: ['typescript', 'javascript'] }),
      skill('atomic-design-react', { compatible_languages: ['typescript', 'javascript'] }),
      skill('figma-design-fetcher', { compatible_languages: ['typescript', 'javascript'] }),
      // Should land on implementer only
      skill('jest-coverage-automation', {
        compatible_languages: ['typescript', 'javascript'],
        agent_roles: ['implementer'],
      }),
      skill('playwright-e2e-automation', {
        compatible_languages: ['typescript', 'javascript'],
        agent_roles: ['implementer'],
      }),
      skill('ui-testing', {
        compatible_languages: ['typescript', 'javascript'],
        is_linkable_to_agents: true,
        agent_roles: ['implementer'],
      }),
      skill('ui-visual-testing', {
        compatible_languages: ['typescript', 'javascript'],
        is_linkable_to_agents: true,
        agent_roles: ['implementer'],
      }),
      skill('developing-with-docker', {
        is_linkable_to_agents: true,
        agent_roles: ['implementer'],
      }),
    ];

    const assignments = assignSkillsToAgents(resolved, TS_REACT_STACK, '/framework');

    const plannerNames = assignments.planner.map((s) => s.name).sort();

    // YES list — every name must be on the planner.
    for (const expected of [
      'figma-design-fetcher',
      'mastering-typescript',
      'react-frontend',
      'atomic-design-react',
      'code-conventions',
      'multi-file-workflows',
      'testing-conventions',
    ]) {
      expect(plannerNames).toContain(expected);
    }

    // NO list — none of these may be on the planner.
    for (const forbidden of [
      'jest-coverage-automation',
      'playwright-e2e-automation',
      'ui-testing',
      'ui-visual-testing',
      'developing-with-docker',
    ]) {
      expect(plannerNames).not.toContain(forbidden);
    }
  });

  it('still attaches implementer-only skills to implementer-typescript', () => {
    const resolved: ResolvedSkill[] = [
      skill('jest-coverage-automation', {
        compatible_languages: ['typescript', 'javascript'],
        agent_roles: ['implementer'],
      }),
      skill('developing-with-docker', {
        is_linkable_to_agents: true,
        agent_roles: ['implementer'],
      }),
    ];

    const assignments = assignSkillsToAgents(resolved, TS_REACT_STACK, '/framework');

    const tsImplementer = assignments['implementer-typescript'].map((s) => s.name);
    const genericImplementer = assignments['implementer-generic'].map((s) => s.name);

    expect(tsImplementer).toContain('jest-coverage-automation');
    // developing-with-docker has no compatible_languages → goes to implementer-generic.
    expect(genericImplementer).toContain('developing-with-docker');
  });

  it('a skill without agent_roles defaults to BOTH (backwards compatible)', () => {
    const resolved: ResolvedSkill[] = [
      skill('mastering-typescript', { compatible_languages: ['typescript'] }),
    ];

    const assignments = assignSkillsToAgents(resolved, TS_REACT_STACK, '/framework');

    expect(assignments.planner.map((s) => s.name)).toContain('mastering-typescript');
    expect(assignments['implementer-typescript'].map((s) => s.name)).toContain(
      'mastering-typescript',
    );
  });

  it('agent_roles: ["planner"] keeps a skill off implementers', () => {
    // Hypothetical planner-only skill — used to verify the symmetry of the
    // filter, not because such a skill exists in the registry today.
    const resolved: ResolvedSkill[] = [
      skill('plan-only-skill', {
        compatible_languages: ['typescript'],
        agent_roles: ['planner'],
      }),
    ];

    const assignments = assignSkillsToAgents(resolved, TS_REACT_STACK, '/framework');

    expect(assignments.planner.map((s) => s.name)).toContain('plan-only-skill');
    expect(assignments['implementer-typescript'].map((s) => s.name)).not.toContain(
      'plan-only-skill',
    );
  });

  it('the three generated convention skills go to BOTH planner and every implementer regardless of agent_roles annotation on triggered skills', () => {
    // No triggered skills at all — only the unconditionally-attached
    // generated convention skills should land on every agent.
    const assignments = assignSkillsToAgents([], TS_REACT_STACK, '/framework');

    const generatedNames = ['code-conventions', 'multi-file-workflows', 'testing-conventions'];
    for (const name of generatedNames) {
      expect(assignments.planner.map((s) => s.name)).toContain(name);
      expect(assignments['implementer-typescript'].map((s) => s.name)).toContain(name);
      expect(assignments['implementer-generic'].map((s) => s.name)).toContain(name);
    }
  });
});
