#!/usr/bin/env node

/**
 * Test script for stack detection improvements (P0-1, P0-2, and P0-4)
 * Tests workspace detection, multi-language arrays and dependency version extraction
 */

const { detectStack, detectWorkspaces } = require('./stack-detection.js');
const path = require('path');

async function runTest() {
  console.log('='.repeat(80));
  console.log('Testing Stack Detection (P0-2 & P0-4 Improvements)');
  console.log('='.repeat(80));
  console.log('');

  const projectPath = process.argv[2] || path.join(__dirname, '../..');

  console.log(`Project Path: ${projectPath}`);
  console.log('');

  try {
    // First, test workspace detection
    console.log('WORKSPACE DETECTION:');
    console.log('-'.repeat(80));
    const workspaces = await detectWorkspaces(projectPath);
    console.log(`Found ${workspaces.length} workspace(s):`);
    workspaces.forEach(ws => {
      console.log(`  - ${path.relative(projectPath, ws)}`);
    });
    console.log('');

    const profile = await detectStack(projectPath);

    console.log('DETECTION LOG:');
    console.log('-'.repeat(80));
    if (profile.is_monorepo && profile.detection_metadata.detection_logs) {
      // Monorepo: show logs per workspace
      profile.detection_metadata.detection_logs.forEach(wsLog => {
        console.log(`\n  Workspace: ${wsLog.workspace}`);
        wsLog.log.forEach(log => console.log(`    ${log}`));
      });
    } else if (profile.detection_metadata.detection_log) {
      // Single workspace: show logs directly
      profile.detection_metadata.detection_log.forEach(log => console.log(`  ${log}`));
    }
    console.log('');

    console.log('LANGUAGES DETECTED (Array):');
    console.log('-'.repeat(80));
    if (profile.languages && profile.languages.length > 0) {
      profile.languages.forEach(lang => {
        console.log(`  - ${lang.name} (confidence: ${lang.confidence})`);
        console.log(`    Detected by: ${lang.detectedBy}`);
      });
    } else {
      console.log('  None');
    }
    console.log('');

    console.log('BACKEND FRAMEWORKS (Array with Versions):');
    console.log('-'.repeat(80));
    if (profile.backend_frameworks && profile.backend_frameworks.length > 0) {
      profile.backend_frameworks.forEach(fw => {
        console.log(`  - ${fw.name} v${fw.version} (confidence: ${fw.confidence})`);
        console.log(`    Detected by: ${fw.detectedBy}`);
      });
    } else {
      console.log('  None');
    }
    console.log('');

    console.log('FRONTEND FRAMEWORKS (Array with Versions):');
    console.log('-'.repeat(80));
    if (profile.frontend_frameworks && profile.frontend_frameworks.length > 0) {
      profile.frontend_frameworks.forEach(fw => {
        console.log(`  - ${fw.name} v${fw.version} (confidence: ${fw.confidence})`);
        console.log(`    Detected by: ${fw.detectedBy}`);
      });
    } else {
      console.log('  None');
    }
    console.log('');

    console.log('KEY DEPENDENCY VERSIONS (Sample):');
    console.log('-'.repeat(80));
    if (profile.dependency_versions) {
      const keyDeps = [
        '@nestjs/core',
        'react',
        'typescript',
        'express',
        'fastapi',
        'django',
        'next',
        '@angular/core',
        'vue',
        'typeorm',
        'jest'
      ];

      const found = [];
      for (const dep of keyDeps) {
        if (profile.dependency_versions[dep]) {
          found.push(`  ${dep}: ${profile.dependency_versions[dep]}`);
        }
      }

      if (found.length > 0) {
        found.forEach(line => console.log(line));
      } else {
        console.log('  No key dependencies found');
      }

      const totalDeps = Object.keys(profile.dependency_versions).length;
      console.log('');
      console.log(`  Total dependencies tracked: ${totalDeps}`);
    }
    console.log('');

    console.log('BACKWARD COMPATIBILITY FIELDS:');
    console.log('-'.repeat(80));
    console.log(`  primary_language: ${profile.primary_language || 'null'}`);
    console.log(`  backend.framework: ${profile.backend?.framework || 'null'}`);
    console.log(`  backend.version: ${profile.backend?.version || 'null'}`);
    console.log(`  frontend.framework: ${profile.frontend?.framework || 'null'}`);
    console.log(`  frontend.version: ${profile.frontend?.version || 'null'}`);
    console.log('');

    console.log('OTHER DETECTIONS:');
    console.log('-'.repeat(80));
    console.log(`  Package Manager: ${profile.package_manager || 'none'}`);
    console.log(`  Monorepo: ${profile.is_monorepo || profile.monorepo ? 'yes' : 'no'}`);
    if (profile.is_monorepo) {
      console.log(`  Workspace Count: ${profile.detection_metadata.workspace_count}`);
    }
    console.log(`  Databases: ${(profile.databases?.map ? profile.databases.map(db => db.name || db) : profile.databases).join(', ') || 'none'}`);
    console.log(`  Testing: ${(profile.testing?.map ? profile.testing.map(t => t.name || t) : profile.testing_frameworks || []).join(', ') || 'none'}`);
    console.log(`  Cloud: ${(profile.cloud?.map ? profile.cloud.map(c => c.name || c) : profile.cloud_platforms || []).join(', ') || 'none'}`);
    console.log(`  Containers: ${(profile.containers?.map ? profile.containers.map(c => c.name || c) : []).join(', ') || 'none'}`);
    console.log('');

    // Show workspace-specific details if monorepo
    if (profile.is_monorepo && profile.workspaces) {
      console.log('WORKSPACE DETAILS:');
      console.log('-'.repeat(80));
      profile.workspaces.forEach(ws => {
        console.log(`\n  ${ws.name}:`);
        console.log(`    Language: ${ws.primary_language || 'unknown'}`);
        console.log(`    Backend: ${ws.backend?.framework || 'none'}`);
        console.log(`    Frontend: ${ws.frontend?.framework || 'none'}`);
        console.log(`    Databases: ${ws.databases?.map(db => db.name || db).join(', ') || 'none'}`);
        console.log(`    Testing: ${ws.testing?.map(t => t.name || t).join(', ') || 'none'}`);
      });
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('✓ Stack detection completed successfully');
    console.log('='.repeat(80));
    console.log('');

    // Validation checks
    console.log('VALIDATION CHECKS:');
    console.log('-'.repeat(80));
    let passed = 0;
    let failed = 0;

    // Check 1: Languages should be an array
    if (Array.isArray(profile.languages)) {
      console.log('✓ Languages is an array');
      passed++;
    } else {
      console.log('✗ Languages is NOT an array');
      failed++;
    }

    // Check 2: Backend frameworks should be an array
    if (Array.isArray(profile.backend_frameworks)) {
      console.log('✓ Backend frameworks is an array');
      passed++;
    } else {
      console.log('✗ Backend frameworks is NOT an array');
      failed++;
    }

    // Check 3: Frontend frameworks should be an array
    if (Array.isArray(profile.frontend_frameworks)) {
      console.log('✓ Frontend frameworks is an array');
      passed++;
    } else {
      console.log('✗ Frontend frameworks is NOT an array');
      failed++;
    }

    // Check 4: Dependency versions should be an object
    if (profile.dependency_versions && typeof profile.dependency_versions === 'object') {
      console.log('✓ Dependency versions is an object');
      passed++;
    } else {
      console.log('✗ Dependency versions is NOT an object');
      failed++;
    }

    // Check 5: Backend frameworks should have versions
    if (profile.backend_frameworks.length > 0) {
      const hasVersions = profile.backend_frameworks.every(fw => fw.version);
      if (hasVersions) {
        console.log('✓ All backend frameworks have versions');
        passed++;
      } else {
        console.log('✗ Some backend frameworks missing versions');
        failed++;
      }
    }

    // Check 6: Frontend frameworks should have versions
    if (profile.frontend_frameworks.length > 0) {
      const hasVersions = profile.frontend_frameworks.every(fw => fw.version);
      if (hasVersions) {
        console.log('✓ All frontend frameworks have versions');
        passed++;
      } else {
        console.log('✗ Some frontend frameworks missing versions');
        failed++;
      }
    }

    // Check 7: Backward compatibility
    if (profile.languages && profile.languages.length > 0 && profile.primary_language) {
      console.log('✓ Backward compatibility: primary_language is set');
      passed++;
    } else if (!profile.is_monorepo && profile.languages && profile.languages.length > 0) {
      // Single workspace should have primary_language
      console.log('✗ Backward compatibility: primary_language not set');
      failed++;
    }

    // Check 8: Workspace detection (if monorepo)
    if (profile.is_monorepo) {
      if (profile.workspaces && Array.isArray(profile.workspaces)) {
        console.log('✓ Monorepo: workspaces is an array');
        passed++;

        // Check for backend workspace in Gira
        const backendWs = profile.workspaces.find(ws => ws.name.includes('backend'));
        if (backendWs) {
          console.log(`✓ Backend workspace found: ${backendWs.name}`);
          passed++;

          if (backendWs.primary_language === 'typescript') {
            console.log('✓ Backend workspace language: TypeScript');
            passed++;
          } else {
            console.log(`✗ Backend workspace language: ${backendWs.primary_language || 'unknown'} (expected TypeScript)`);
            failed++;
          }

          if (backendWs.backend?.framework === 'nestjs') {
            console.log('✓ Backend workspace framework: NestJS');
            passed++;
          } else {
            console.log(`✗ Backend workspace framework: ${backendWs.backend?.framework || 'unknown'} (expected NestJS)`);
            failed++;
          }
        } else {
          console.log('✗ Backend workspace NOT found');
          failed++;
        }

        // Check for frontend workspace in Gira
        const frontendWs = profile.workspaces.find(ws => ws.name.includes('frontend'));
        if (frontendWs) {
          console.log(`✓ Frontend workspace found: ${frontendWs.name}`);
          passed++;

          if (frontendWs.primary_language === 'typescript') {
            console.log('✓ Frontend workspace language: TypeScript');
            passed++;
          } else {
            console.log(`✗ Frontend workspace language: ${frontendWs.primary_language || 'unknown'} (expected TypeScript)`);
            failed++;
          }

          if (frontendWs.frontend?.framework === 'react') {
            console.log('✓ Frontend workspace framework: React');
            passed++;
          } else {
            console.log(`✗ Frontend workspace framework: ${frontendWs.frontend?.framework || 'unknown'} (expected React)`);
            failed++;
          }
        } else {
          console.log('✗ Frontend workspace NOT found');
          failed++;
        }
      } else {
        console.log('✗ Monorepo: workspaces is NOT an array');
        failed++;
      }
    }

    console.log('');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(80));

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTest();
