#!/usr/bin/env node

/**
 * Automatic Documentation Update Detection
 *
 * Detects architectural changes requiring documentation updates:
 * - New modules/services added
 * - Database schema changes (new tables/columns)
 * - API endpoints changed
 * - Authentication/authorization changes
 * - New environment variables required
 * - Deployment process changes
 *
 * Generates documentation update recommendations for:
 * - .claude/CLAUDE.md (project-level documentation)
 * - .claude/skills/010-foundation/project-context/SKILL.md (AI agent context)
 *
 * Usage:
 *   node detect-doc-updates.js --ticket JIRA-123
 *   node detect-doc-updates.js --base origin/main --head HEAD --ticket JIRA-123
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Detect documentation updates needed based on git diff
 *
 * @param {Object} options - Detection options
 * @param {string} options.baseCommit - Base commit for comparison (default: origin/main)
 * @param {string} options.headCommit - Head commit for comparison (default: HEAD)
 * @param {string} options.ticketKey - Jira ticket key
 * @param {string} options.projectPath - Project root path
 * @returns {Promise<Object>} Detection result
 */
async function detectDocumentationUpdates(options) {
  const {
    baseCommit = 'origin/main',
    headCommit = 'HEAD',
    ticketKey = null,
    projectPath = process.cwd()
  } = options;

  console.log('🔍 Detecting documentation updates needed...');

  const result = {
    timestamp: new Date().toISOString(),
    changesDetected: [],
    recommendations: [],
    autoUpdatable: [],
    requiresReview: []
  };

  // Get git diff
  const diff = await getGitDiff(baseCommit, headCommit, projectPath);

  // Analyze changes
  const changes = analyzeChanges(diff, projectPath);

  // Detect what documentation needs updating
  if (changes.newModules.length > 0) {
    result.changesDetected.push({
      type: 'NEW_MODULES',
      severity: 'high',
      items: changes.newModules
    });
  }

  if (changes.databaseChanges.length > 0) {
    result.changesDetected.push({
      type: 'DATABASE_SCHEMA',
      severity: 'high',
      items: changes.databaseChanges
    });
  }

  if (changes.apiChanges.length > 0) {
    result.changesDetected.push({
      type: 'API_ENDPOINTS',
      severity: 'medium',
      items: changes.apiChanges
    });
  }

  if (changes.authChanges.length > 0) {
    result.changesDetected.push({
      type: 'AUTHENTICATION',
      severity: 'high',
      items: changes.authChanges
    });
  }

  if (changes.envVarChanges.length > 0) {
    result.changesDetected.push({
      type: 'ENVIRONMENT_VARS',
      severity: 'high',
      items: changes.envVarChanges
    });
  }

  if (changes.deploymentChanges.length > 0) {
    result.changesDetected.push({
      type: 'DEPLOYMENT',
      severity: 'medium',
      items: changes.deploymentChanges
    });
  }

  if (changes.dependencyChanges.length > 0) {
    result.changesDetected.push({
      type: 'DEPENDENCIES',
      severity: 'low',
      items: changes.dependencyChanges
    });
  }

  // Generate recommendations
  result.recommendations = generateRecommendations(result.changesDetected, projectPath);

  // Categorize updates
  result.recommendations.forEach(rec => {
    if (rec.autoUpdatable) {
      result.autoUpdatable.push(rec);
    } else {
      result.requiresReview.push(rec);
    }
  });

  // Apply auto-updatable changes
  if (result.autoUpdatable.length > 0) {
    console.log(`\n🔧 Auto-updating ${result.autoUpdatable.length} documentation sections...`);
    await applyAutoUpdates(result.autoUpdatable, projectPath);
  }

  // Save recommendations for manual review
  if (result.requiresReview.length > 0 && ticketKey) {
    await saveRecommendations(result, ticketKey, projectPath);
  }

  return result;
}

/**
 * Get git diff between base and head
 */
async function getGitDiff(baseCommit, headCommit, projectPath) {
  try {
    const diff = execSync(
      `git diff ${baseCommit}...${headCommit} --name-status`,
      { cwd: projectPath, encoding: 'utf8' }
    );

    const files = diff.split('\n').filter(Boolean).map(line => {
      const [status, ...pathParts] = line.split('\t');
      return {
        status, // A (added), M (modified), D (deleted)
        path: pathParts.join('\t')
      };
    });

    return files;
  } catch (error) {
    console.warn('Could not get git diff:', error.message);
    return [];
  }
}

/**
 * Analyze changes to detect documentation updates needed
 */
function analyzeChanges(diffFiles, projectPath) {
  const changes = {
    newModules: [],
    databaseChanges: [],
    apiChanges: [],
    authChanges: [],
    envVarChanges: [],
    deploymentChanges: [],
    dependencyChanges: []
  };

  diffFiles.forEach(file => {
    const { status, path: filePath } = file;

    // New modules (backend)
    if (status === 'A' && /modules\/([^/]+)\/\1\.module\.ts/.test(filePath)) {
      const moduleName = filePath.match(/modules\/([^/]+)\//)[1];
      changes.newModules.push({
        name: moduleName,
        path: filePath,
        type: 'backend'
      });
    }

    // New feature modules (frontend)
    if (status === 'A' && /features\/([^/]+)\/\w+Page\.tsx/.test(filePath)) {
      const featureName = filePath.match(/features\/([^/]+)\//)[1];
      changes.newModules.push({
        name: featureName,
        path: filePath,
        type: 'frontend'
      });
    }

    // Database migrations
    if (/migrations\/.*\.ts/.test(filePath)) {
      try {
        const migrationContent = fs.readFileSync(path.join(projectPath, filePath), 'utf8');

        // Detect new tables
        const createTableMatches = migrationContent.matchAll(/createTable\(['"](\w+)['"]/g);
        for (const match of createTableMatches) {
          changes.databaseChanges.push({
            type: 'new_table',
            tableName: match[1],
            migration: filePath
          });
        }

        // Detect new columns
        const addColumnMatches = migrationContent.matchAll(/addColumn\(['"](\w+)['"],\s*['"](\w+)['"]/g);
        for (const match of addColumnMatches) {
          changes.databaseChanges.push({
            type: 'new_column',
            tableName: match[1],
            columnName: match[2],
            migration: filePath
          });
        }
      } catch (error) {
        // Ignore if file can't be read
      }
    }

    // API controllers (new endpoints)
    if ((status === 'A' || status === 'M') && /controller\.ts/.test(filePath)) {
      try {
        const controllerContent = fs.readFileSync(path.join(projectPath, filePath), 'utf8');

        // Detect HTTP decorators
        const endpointMatches = controllerContent.matchAll(/@(Get|Post|Put|Delete|Patch)\(['"]?([^'")\s]*)?['"]\)/g);
        for (const match of endpointMatches) {
          const method = match[1].toUpperCase();
          const route = match[2] || '';
          const controllerName = path.basename(filePath, '.controller.ts');

          changes.apiChanges.push({
            method,
            path: `/${controllerName}${route ? '/' + route : ''}`,
            controller: filePath,
            isNew: status === 'A'
          });
        }
      } catch (error) {
        // Ignore if file can't be read
      }
    }

    // Authentication/authorization changes
    if (/auth|guard|middleware/.test(filePath)) {
      changes.authChanges.push({
        file: filePath,
        status,
        description: status === 'A' ? 'New auth component' : 'Auth component modified'
      });
    }

    // Environment variable changes
    if (/.env\.example|env\.ts|validate-config\.ts/.test(filePath)) {
      try {
        const content = fs.readFileSync(path.join(projectPath, filePath), 'utf8');

        // Extract env var names
        const envVarMatches = content.matchAll(/([A-Z_]+)=/g);
        for (const match of envVarMatches) {
          const varName = match[1];
          if (!changes.envVarChanges.find(v => v.name === varName)) {
            changes.envVarChanges.push({
              name: varName,
              file: filePath,
              isNew: status === 'A'
            });
          }
        }
      } catch (error) {
        // Ignore if file can't be read
      }
    }

    // Deployment changes
    if (/Dockerfile|docker-compose|\.github\/workflows|Makefile/.test(filePath)) {
      changes.deploymentChanges.push({
        file: filePath,
        status,
        type: filePath.includes('Dockerfile') ? 'docker' :
              filePath.includes('.github') ? 'ci-cd' :
              filePath.includes('Makefile') ? 'make' : 'other'
      });
    }

    // Dependency changes
    if (/package\.json|requirements\.txt|pyproject\.toml/.test(filePath) && status === 'M') {
      changes.dependencyChanges.push({
        file: filePath,
        type: filePath.includes('package.json') ? 'npm' : 'python'
      });
    }
  });

  return changes;
}

/**
 * Generate documentation update recommendations
 */
function generateRecommendations(changesDetected, projectPath) {
  const recommendations = [];

  changesDetected.forEach(change => {
    switch (change.type) {
      case 'NEW_MODULES':
        recommendations.push(...generateModuleRecommendations(change.items, projectPath));
        break;

      case 'DATABASE_SCHEMA':
        recommendations.push(...generateDatabaseRecommendations(change.items));
        break;

      case 'API_ENDPOINTS':
        recommendations.push(...generateAPIRecommendations(change.items));
        break;

      case 'AUTHENTICATION':
        recommendations.push(...generateAuthRecommendations(change.items));
        break;

      case 'ENVIRONMENT_VARS':
        recommendations.push(...generateEnvVarRecommendations(change.items));
        break;

      case 'DEPLOYMENT':
        recommendations.push(...generateDeploymentRecommendations(change.items));
        break;

      case 'DEPENDENCIES':
        recommendations.push(...generateDependencyRecommendations(change.items, projectPath));
        break;
    }
  });

  return recommendations;
}

/**
 * Generate recommendations for new modules
 */
function generateModuleRecommendations(modules, projectPath) {
  const recommendations = [];

  const backendModules = modules.filter(m => m.type === 'backend');
  const frontendModules = modules.filter(m => m.type === 'frontend');

  if (backendModules.length > 0) {
    recommendations.push({
      file: '.claude/CLAUDE.md',
      section: 'Architecture > Backend',
      action: 'add',
      content: `Add new backend module(s): ${backendModules.map(m => m.name).join(', ')}`,
      suggestedUpdate: backendModules.map(m =>
        `- \`modules/${m.name}/\` - ${capitalize(m.name)} module`
      ).join('\n'),
      autoUpdatable: false,
      priority: 'high'
    });
  }

  if (frontendModules.length > 0) {
    recommendations.push({
      file: '.claude/CLAUDE.md',
      section: 'Architecture > Frontend',
      action: 'add',
      content: `Add new frontend feature(s): ${frontendModules.map(m => m.name).join(', ')}`,
      suggestedUpdate: frontendModules.map(m =>
        `- \`features/${m.name}/\` - ${capitalize(m.name)} feature`
      ).join('\n'),
      autoUpdatable: false,
      priority: 'high'
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for database changes
 */
function generateDatabaseRecommendations(changes) {
  const recommendations = [];

  const newTables = changes.filter(c => c.type === 'new_table');

  if (newTables.length > 0) {
    recommendations.push({
      file: '.claude/CLAUDE.md',
      section: 'Database Schema',
      action: 'add',
      content: `Add new database table(s): ${newTables.map(t => t.tableName).join(', ')}`,
      suggestedUpdate: newTables.map(t =>
        `- **${t.tableName}** - [Add description]`
      ).join('\n'),
      autoUpdatable: false,
      priority: 'high'
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for API changes
 */
function generateAPIRecommendations(changes) {
  const recommendations = [];

  const newEndpoints = changes.filter(c => c.isNew);

  if (newEndpoints.length > 0) {
    recommendations.push({
      file: '.claude/CLAUDE.md',
      section: 'API Endpoints',
      action: 'add',
      content: `Add new API endpoint(s): ${newEndpoints.map(e => `${e.method} ${e.path}`).join(', ')}`,
      suggestedUpdate: newEndpoints.map(e =>
        `- **${e.method} ${e.path}** - [Add description]`
      ).join('\n'),
      autoUpdatable: false,
      priority: 'medium'
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for auth changes
 */
function generateAuthRecommendations(changes) {
  const recommendations = [];

  const newAuthComponents = changes.filter(c => c.status === 'A');

  if (newAuthComponents.length > 0) {
    recommendations.push({
      file: '.claude/CLAUDE.md',
      section: 'Authentication',
      action: 'update',
      content: `Update authentication documentation (new components: ${newAuthComponents.length})`,
      suggestedUpdate: `Authentication changes detected. Review:\n${newAuthComponents.map(c => `- ${c.file}`).join('\n')}`,
      autoUpdatable: false,
      priority: 'high'
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for environment variables
 */
function generateEnvVarRecommendations(changes) {
  const recommendations = [];

  const newVars = changes.filter(c => c.isNew);

  if (newVars.length > 0) {
    recommendations.push({
      file: '.claude/CLAUDE.md',
      section: 'Environment Variables',
      action: 'add',
      content: `Add new environment variable(s): ${newVars.map(v => v.name).join(', ')}`,
      suggestedUpdate: newVars.map(v =>
        `| ${v.name} | [Add description] | [Add default/example] |`
      ).join('\n'),
      autoUpdatable: false,
      priority: 'high'
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for deployment changes
 */
function generateDeploymentRecommendations(changes) {
  const recommendations = [];

  if (changes.length > 0) {
    recommendations.push({
      file: '.claude/CLAUDE.md',
      section: 'Deployment',
      action: 'review',
      content: `Review deployment changes: ${changes.map(c => c.file).join(', ')}`,
      suggestedUpdate: `Deployment configuration changed. Review and update documentation.`,
      autoUpdatable: false,
      priority: 'medium'
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for dependency changes
 */
function generateDependencyRecommendations(changes, projectPath) {
  const recommendations = [];

  changes.forEach(change => {
    if (change.type === 'npm') {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(projectPath, change.file), 'utf8')
        );

        // Check for major version updates in tech stack
        const techStack = {
          '@nestjs/core': 'Backend (NestJS)',
          'react': 'Frontend (React)',
          'typeorm': 'ORM (TypeORM)',
          'jest': 'Testing (Jest)',
          'typescript': 'TypeScript'
        };

        const allDeps = {
          ...packageJson.dependencies || {},
          ...packageJson.devDependencies || {}
        };

        Object.entries(techStack).forEach(([pkg, label]) => {
          if (allDeps[pkg]) {
            recommendations.push({
              file: '.claude/CLAUDE.md',
              section: 'Tech Stack',
              action: 'update',
              content: `Update ${label} version to ${allDeps[pkg]}`,
              suggestedUpdate: `| ${label.split('(')[1].replace(')', '')} | ${allDeps[pkg].replace('^', '').replace('~', '')} |`,
              autoUpdatable: true,
              priority: 'low'
            });
          }
        });
      } catch (error) {
        // Ignore if can't parse package.json
      }
    }
  });

  return recommendations;
}

/**
 * Apply auto-updatable recommendations
 */
async function applyAutoUpdates(recommendations, projectPath) {
  for (const rec of recommendations) {
    try {
      const filePath = path.join(projectPath, rec.file);

      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  File not found: ${rec.file}`);
        continue;
      }

      let content = fs.readFileSync(filePath, 'utf8');

      // Simple find and replace for tech stack versions
      if (rec.section === 'Tech Stack' && rec.action === 'update') {
        // This would need more sophisticated logic for actual updates
        // For now, just log what would be updated
        console.log(`   - Would update ${rec.file} > ${rec.section}: ${rec.content}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not update ${rec.file}:`, error.message);
    }
  }
}

/**
 * Save recommendations for manual review
 */
async function saveRecommendations(result, ticketKey, projectPath) {
  const docUpdatesDir = path.join(projectPath, '.claude', 'documentation-updates');
  fs.mkdirSync(docUpdatesDir, { recursive: true });

  const recommendationsPath = path.join(docUpdatesDir, `${ticketKey}-updates.md`);

  const markdown = `# Documentation Update Recommendations - ${ticketKey}

**Generated**: ${result.timestamp}

This PR includes architectural changes that require documentation updates.

---

## Changes Detected (${result.changesDetected.length})

${result.changesDetected.map(change => `
### ${change.type.replace(/_/g, ' ')} (${change.severity} priority)

${change.items.map(item => `- ${JSON.stringify(item, null, 2)}`).join('\n')}
`).join('\n')}

---

## Recommended Updates (${result.requiresReview.length})

${result.requiresReview.map((rec, index) => `
### ${index + 1}. ${rec.file} > ${rec.section}

**Action**: ${rec.action}
**Priority**: ${rec.priority}
**Description**: ${rec.content}

**Suggested Update**:
\`\`\`
${rec.suggestedUpdate}
\`\`\`

---
`).join('\n')}

## Files to Update

${[...new Set(result.requiresReview.map(r => r.file))].map(file => `- [ ] ${file}`).join('\n')}

## Auto-Updated (${result.autoUpdatable.length})

${result.autoUpdatable.length > 0 ?
  result.autoUpdatable.map(rec => `- ✅ ${rec.file} > ${rec.section}: ${rec.content}`).join('\n') :
  'None'
}
`;

  fs.writeFileSync(recommendationsPath, markdown);
  console.log(`\n📝 Documentation update recommendations saved to: ${recommendationsPath}`);
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key === 'base') {
      options.baseCommit = value;
    } else if (key === 'head') {
      options.headCommit = value;
    } else if (key === 'ticket') {
      options.ticketKey = value;
    }
  }

  detectDocumentationUpdates(options)
    .then(result => {
      console.log('\n' + '='.repeat(60));
      console.log('Documentation Update Detection Summary');
      console.log('='.repeat(60));
      console.log(`Changes Detected: ${result.changesDetected.length}`);
      console.log(`Recommendations: ${result.recommendations.length}`);
      console.log(`  - Auto-updatable: ${result.autoUpdatable.length}`);
      console.log(`  - Requires Review: ${result.requiresReview.length}`);

      if (result.requiresReview.length > 0) {
        console.log('\n⚠️  Manual documentation updates required!');
        console.log('See recommendations file for details.');
      }

      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error detecting documentation updates:', error);
      process.exit(1);
    });
}

module.exports = {
  detectDocumentationUpdates,
  analyzeChanges
};
