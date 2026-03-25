#!/usr/bin/env npx tsx

/**
 * Test script to verify agent skill assignment logic
 * Tests the configuration-driven assignment without running full workflow
 */

import { resolveSkills } from './src/utils/skill-resolver.js';
import type { StackProfile } from './src/utils/config-generator.js';
import { join } from 'path';

// Mock stack profile for gira project (TypeScript + React + Next.js)
const giraStackProfile: StackProfile = {
  project_name: 'gira',
  languages: ['typescript'],
  frameworks: {
    frontend: ['react', 'next'],
    backend: [],
    mobile: []
  },
  testing_frameworks: {
    unit: ['jest'],
    e2e: ['playwright']
  },
  file_counts: {
    typescript: 150
  },
  infrastructure: [],
  databases: [],
  project_type: 'web-application',
  monorepo: false,
  detection_summary: '',
  confidence_score: 0.95,
  schema_hash: ''
};

const frameworkPath = '/Users/ignaciobarreto/itIsHere/projects/ai-agentic-framework';

console.log('━━━ Testing Agent Skill Assignment Logic ━━━\n');

// Step 1: Resolve skills based on stack detection
console.log('Step 1: Resolving skills for gira stack profile...');
const resolvedSkills = resolveSkills(giraStackProfile, frameworkPath);

console.log(`✓ Resolved ${resolvedSkills.length} skills\n`);

// Categorize resolved skills by trigger_mode
const alwaysSkills = resolvedSkills.filter(s => s.trigger_mode === 'always');
const triggeredSkills = resolvedSkills.filter(s => s.trigger_mode === 'triggered');
const nonLinkableSkills = resolvedSkills.filter(s => s.is_linkable_to_agents === false);

console.log('Skill Categories:');
console.log(`  - "always" skills (should NOT be linked): ${alwaysSkills.length}`);
console.log(`  - "triggered" skills: ${triggeredSkills.length}`);
console.log(`  - Non-linkable skills (external resources): ${nonLinkableSkills.length}\n`);

// Step 2: Manually implement assignment logic (from agent-generator.ts)
console.log('Step 2: Assigning skills to agents using configuration-driven logic...\n');

interface AgentSkillAssignments {
  planner: string[];
  [agentName: string]: string[];
}

const assignments: AgentSkillAssignments = {
  planner: [],
  'implementer-generic': []
};

// Initialize for each detected language
for (const lang of giraStackProfile.languages) {
  assignments[`implementer-${lang}`] = [];
}

// Process resolved skills
for (const skill of resolvedSkills) {
  // "always" skills are copied but NOT linked
  if (skill.trigger_mode === 'always') {
    continue;
  }

  // Skip non-linkable skills (external resources)
  if (skill.is_linkable_to_agents === false) {
    continue;
  }

  // Only "triggered" skills get linked
  if (skill.trigger_mode === 'triggered') {
    if (skill.compatible_languages && skill.compatible_languages.length > 0) {
      // Language/framework skill - add to planner + matching implementers
      assignments.planner.push(skill.name);

      for (const compatLang of skill.compatible_languages) {
        const agentName = `implementer-${compatLang}`;
        if (assignments[agentName]) {
          assignments[agentName].push(skill.name);
        }
      }
    }
    else {
      // Infrastructure skill - ONLY to generic + planner
      assignments.planner.push(skill.name);
      assignments['implementer-generic'].push(skill.name);
    }
  }
}

// Add project-context to all agents
const projectContextName = 'project-context';
assignments.planner.push(projectContextName);
assignments['implementer-generic'].push(projectContextName);
for (const lang of giraStackProfile.languages) {
  assignments[`implementer-${lang}`].push(projectContextName);
}

// Step 3: Display results
console.log('━━━ Agent Skill Assignments ━━━\n');

for (const [agentName, skills] of Object.entries(assignments)) {
  console.log(`${agentName}:`);
  console.log(`  Skills (${skills.length}):`);
  for (const skill of skills) {
    console.log(`    - ${skill}`);
  }
  console.log('');
}

// Step 4: Validate expectations
console.log('━━━ Validation ━━━\n');

const checks = [
  {
    name: 'Planner should have language skills',
    pass: assignments.planner.includes('mastering-typescript'),
    expected: 'mastering-typescript in planner'
  },
  {
    name: 'Planner should have framework skills',
    pass: assignments.planner.includes('react-frontend') && assignments.planner.includes('mastering-nextjs'),
    expected: 'react-frontend and mastering-nextjs in planner'
  },
  {
    name: 'Planner should have project-context',
    pass: assignments.planner.includes('project-context'),
    expected: 'project-context in planner'
  },
  {
    name: 'TypeScript implementer should have TS skill',
    pass: assignments['implementer-typescript']?.includes('mastering-typescript'),
    expected: 'mastering-typescript in implementer-typescript'
  },
  {
    name: 'TypeScript implementer should have React skills',
    pass: assignments['implementer-typescript']?.includes('react-frontend') &&
          assignments['implementer-typescript']?.includes('atomic-design-react'),
    expected: 'react-frontend and atomic-design-react in implementer-typescript'
  },
  {
    name: 'TypeScript implementer should have testing skills',
    pass: assignments['implementer-typescript']?.includes('jest-coverage-automation') &&
          assignments['implementer-typescript']?.includes('playwright-e2e-automation'),
    expected: 'jest-coverage-automation and playwright-e2e-automation in implementer-typescript'
  },
  {
    name: 'TypeScript implementer should have project-context',
    pass: assignments['implementer-typescript']?.includes('project-context'),
    expected: 'project-context in implementer-typescript'
  },
  {
    name: 'Generic implementer should have project-context',
    pass: assignments['implementer-generic']?.includes('project-context'),
    expected: 'project-context in implementer-generic'
  },
  {
    name: '"always" skills should NOT be in planner',
    pass: !assignments.planner.some(s => alwaysSkills.map(as => as.name).includes(s)),
    expected: 'No "always" skills in planner'
  },
  {
    name: 'Non-linkable skills should NOT be in any agent',
    pass: !assignments.planner.some(s => nonLinkableSkills.map(ns => ns.name).includes(s)) &&
          !assignments['implementer-typescript']?.some(s => nonLinkableSkills.map(ns => ns.name).includes(s)),
    expected: 'No non-linkable skills in any agent'
  }
];

let passedCount = 0;
for (const check of checks) {
  const status = check.pass ? '✓' : '✗';
  const color = check.pass ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${status}\x1b[0m ${check.name}`);
  if (!check.pass) {
    console.log(`   Expected: ${check.expected}`);
  }
  if (check.pass) passedCount++;
}

console.log(`\n━━━ Results: ${passedCount}/${checks.length} checks passed ━━━\n`);

if (passedCount === checks.length) {
  console.log('✅ All validation checks passed! Configuration-driven logic is working correctly.\n');
  process.exit(0);
} else {
  console.log('❌ Some validation checks failed. Review the agent assignments above.\n');
  process.exit(1);
}
