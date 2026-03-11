#!/usr/bin/env node

/**
 * Test script for workspace-specific stack detection
 * Tests detection on backend and frontend workspaces separately
 */

const { detectStack } = require('./stack-detection.js');
const path = require('path');

async function testWorkspace(workspaceName, workspacePath) {
  console.log('');
  console.log('='.repeat(80));
  console.log(`Testing: ${workspaceName}`);
  console.log('='.repeat(80));
  console.log(`Path: ${workspacePath}`);
  console.log('');

  try {
    const profile = await detectStack(workspacePath);

    console.log('Languages:', profile.languages.map(l => `${l.name} (${l.confidence})`).join(', '));
    console.log('Backend Frameworks:', profile.backend_frameworks.map(f => `${f.name} v${f.version}`).join(', ') || 'none');
    console.log('Frontend Frameworks:', profile.frontend_frameworks.map(f => `${f.name} v${f.version}`).join(', ') || 'none');
    console.log('');

    console.log('Key Dependencies:');
    const keyDeps = ['@nestjs/core', 'react', 'typescript', 'express', 'typeorm', 'jest', '@tanstack/react-query'];
    keyDeps.forEach(dep => {
      if (profile.dependency_versions[dep]) {
        console.log(`  ${dep}: ${profile.dependency_versions[dep]}`);
      }
    });

    return profile;
  } catch (error) {
    console.error('ERROR:', error.message);
    return null;
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Workspace-Specific Stack Detection Test');
  console.log('='.repeat(80));

  const projectRoot = path.join(__dirname, '../..');

  // Test backend workspace
  const backendPath = path.join(projectRoot, 'services/backend');
  const backendProfile = await testWorkspace('Backend Service', backendPath);

  // Test frontend workspace
  const frontendPath = path.join(projectRoot, 'services/web-frontend');
  const frontendProfile = await testWorkspace('Frontend Service', frontendPath);

  // Test root (should detect TypeScript but not frameworks)
  const rootProfile = await testWorkspace('Root Project', projectRoot);

  console.log('');
  console.log('='.repeat(80));
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  if (backendProfile) {
    console.log('Backend:');
    console.log(`  - ${backendProfile.languages.length} language(s)`);
    console.log(`  - ${backendProfile.backend_frameworks.length} backend framework(s)`);
    console.log(`  - ${backendProfile.frontend_frameworks.length} frontend framework(s)`);
    console.log(`  - ${Object.keys(backendProfile.dependency_versions).length} dependencies tracked`);
  }

  console.log('');

  if (frontendProfile) {
    console.log('Frontend:');
    console.log(`  - ${frontendProfile.languages.length} language(s)`);
    console.log(`  - ${frontendProfile.backend_frameworks.length} backend framework(s)`);
    console.log(`  - ${frontendProfile.frontend_frameworks.length} frontend framework(s)`);
    console.log(`  - ${Object.keys(frontendProfile.dependency_versions).length} dependencies tracked`);
  }

  console.log('');

  if (rootProfile) {
    console.log('Root:');
    console.log(`  - ${rootProfile.languages.length} language(s)`);
    console.log(`  - ${rootProfile.backend_frameworks.length} backend framework(s)`);
    console.log(`  - ${rootProfile.frontend_frameworks.length} frontend framework(s)`);
    console.log(`  - ${Object.keys(rootProfile.dependency_versions).length} dependencies tracked`);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('✓ Workspace detection test completed');
  console.log('='.repeat(80));
}

runTests();
