#!/usr/bin/env npx tsx

/**
 * Test script to verify skill detection with prefix matching and workspace extraction
 * Tests the enhanced skill detection logic for Firebase, Google Cloud, and infrastructure tools
 */

import { resolveSkills } from './src/utils/skill-resolver.js';
import type { StackProfile } from './src/utils/config-generator.js';
import { join } from 'path';

// Mock stack profile for stride-origin project (TypeScript + React + Next.js + Firebase + Google Cloud)
const strideOriginStackProfile: StackProfile = {
  project_name: 'stride-origin',
  languages: ['typescript', 'javascript', 'python'],
  frameworks: {
    frontend: ['react', 'next'],
    backend: ['express', 'Flask'],
    mobile: []
  },
  testing_frameworks: {
    unit: ['jest'],
    e2e: ['playwright'],
    python: ['pytest', 'unittest']
  },
  infrastructure: ['docker'], // Docker infrastructure
  detected_workspaces: [
    {
      path: 'firebase',
      language: 'typescript',
      type: 'service',
      frameworks: [
        'firebase',
        'firebase-functions',
        'firebase-admin',
        '@google-cloud/firestore',
        '@google-cloud/kms',
        'ts-node',
        'eslint'
      ]
    },
    {
      path: 'packages/stride-lib',
      language: 'typescript',
      type: 'library',
      frameworks: [
        '@google-cloud/firestore',
        '@google-cloud/kms',
        '@google-cloud/storage',
        'firebase-admin',
        'firebase-functions',
        'googleapis'
      ]
    }
  ],
  file_counts: {
    typescript: 250,
    javascript: 50,
    python: 30
  },
  primary_language: 'typescript'
};

const frameworkPath = '/Users/ignaciobarreto/itIsHere/projects/ai-agentic-framework';

console.log('━━━ Testing Enhanced Skill Detection Logic ━━━\n');

// Step 1: Resolve skills based on stack detection
console.log('Step 1: Resolving skills for stride-origin stack profile...');
const resolvedSkills = resolveSkills(strideOriginStackProfile, frameworkPath);

console.log(`✓ Resolved ${resolvedSkills.length} skills\n`);

// Step 2: Categorize resolved skills
const firebaseSkills = resolvedSkills.filter(s => s.name.includes('firebase'));
const gcloudSkills = resolvedSkills.filter(s => s.name.includes('gcloud') || s.name.includes('google'));
const dockerSkills = resolvedSkills.filter(s => s.name.includes('docker'));
const languageSkills = resolvedSkills.filter(s =>
  ['mastering-typescript', 'mastering-python-skill', 'mastering-javascript'].includes(s.name)
);
const frameworkSkills = resolvedSkills.filter(s =>
  ['react-frontend', 'mastering-nextjs', 'atomic-design-react'].includes(s.name)
);

console.log('Skill Categories:');
console.log(`  - Firebase skills: ${firebaseSkills.length}`);
console.log(`  - Google Cloud skills: ${gcloudSkills.length}`);
console.log(`  - Docker skills: ${dockerSkills.length}`);
console.log(`  - Language skills: ${languageSkills.length}`);
console.log(`  - Framework skills: ${frameworkSkills.length}\n`);

// Step 3: Display detected skills
console.log('━━━ Detected Skills ━━━\n');

if (firebaseSkills.length > 0) {
  console.log('Firebase Skills:');
  firebaseSkills.forEach(s => console.log(`  - ${s.name}: ${s.reason}`));
  console.log('');
}

if (gcloudSkills.length > 0) {
  console.log('Google Cloud Skills:');
  gcloudSkills.forEach(s => console.log(`  - ${s.name}: ${s.reason}`));
  console.log('');
}

if (dockerSkills.length > 0) {
  console.log('Docker Skills:');
  dockerSkills.forEach(s => console.log(`  - ${s.name}: ${s.reason}`));
  console.log('');
}

// Step 4: Validate expectations
console.log('━━━ Validation ━━━\n');

const checks = [
  {
    name: 'Firebase skill should be detected from workspace packages',
    pass: firebaseSkills.length > 0,
    expected: 'using-firebase skill detected'
  },
  {
    name: 'Firebase skill should match exact "firebase" package',
    pass: firebaseSkills.some(s => s.reason.includes('firebase')),
    expected: 'Triggered by firebase package'
  },
  {
    name: 'Google Cloud skill should be detected from scoped packages',
    pass: gcloudSkills.length > 0,
    expected: 'mastering-gcloud-commands skill detected'
  },
  {
    name: 'Google Cloud skill should match via prefix matching',
    pass: gcloudSkills.some(s =>
      s.reason.toLowerCase().includes('google-cloud') || s.reason.toLowerCase().includes('googleapis')
    ),
    expected: 'Triggered by @google-cloud/* or googleapis packages'
  },
  {
    name: 'Docker skill should be detected from infrastructure field',
    pass: dockerSkills.length > 0,
    expected: 'developing-with-docker skill detected'
  },
  {
    name: 'Docker skill should be triggered by infrastructure',
    pass: dockerSkills.some(s => s.reason.includes('docker')),
    expected: 'Triggered by docker infrastructure'
  },
  {
    name: 'TypeScript language skill should be detected',
    pass: languageSkills.some(s => s.name === 'mastering-typescript'),
    expected: 'mastering-typescript skill detected'
  },
  {
    name: 'Python language skill should be detected',
    pass: languageSkills.some(s => s.name === 'mastering-python-skill'),
    expected: 'mastering-python-skill skill detected'
  },
  {
    name: 'React framework skills should be detected',
    pass: frameworkSkills.some(s => s.name === 'react-frontend'),
    expected: 'react-frontend skill detected'
  },
  {
    name: 'Next.js framework skill should be detected',
    pass: frameworkSkills.some(s => s.name === 'mastering-nextjs'),
    expected: 'mastering-nextjs skill detected'
  }
];

let passedCount = 0;
for (const check of checks) {
  const status = check.pass ? '✓' : '✗';
  const color = check.pass ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${status}\x1b[0m ${check.name}`);
  if (!check.pass) {
    console.log(`   Expected: ${check.expected}`);
    console.log(`   Hint: Check if skill exists in skills.config.json and has correct triggers`);
  }
  if (check.pass) passedCount++;
}

console.log(`\n━━━ Results: ${passedCount}/${checks.length} checks passed ━━━\n`);

if (passedCount === checks.length) {
  console.log('✅ All validation checks passed! Enhanced skill detection is working correctly.\n');
  process.exit(0);
} else {
  console.log('❌ Some validation checks failed. Review the skill detection logic.\n');
  console.log('Detected skills summary:');
  console.log(`  - Total skills: ${resolvedSkills.length}`);
  console.log(`  - Firebase: ${firebaseSkills.length}`);
  console.log(`  - Google Cloud: ${gcloudSkills.length}`);
  console.log(`  - Docker: ${dockerSkills.length}\n`);
  process.exit(1);
}
