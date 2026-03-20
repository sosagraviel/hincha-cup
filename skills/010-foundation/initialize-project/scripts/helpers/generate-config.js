#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ConfigUpdater } = require('../../../../../utils/config/config-updater.js');

const tempDir = process.argv[2];
const projectPath = process.argv[3];
const frameworkPath = process.argv[4];

if (!tempDir || !projectPath || !frameworkPath) {
  console.error('Usage: node generate-config.js <temp-dir> <project-path> <framework-path>');
  process.exit(1);
}

/**
 * Convert filename format to schema property format
 * Examples:
 *   "01-structure-architecture.json" -> "structure_architecture"
 *   "02-tech-stack-dependencies.json" -> "tech_stack_dependencies"
 */
function filenameToSchemaKey(filename) {
  return filename
    .replace('.json', '')                  // Remove .json extension
    .replace(/^\d+-/, '')                  // Remove leading numeric prefix
    .replace(/-/g, '_');                   // Convert dashes to underscores
}

/**
 * Infer workspace type from name/path
 */
function inferWorkspaceType(workspace) {
  const name = (workspace.name || workspace.path || '').toLowerCase();

  if (name.includes('web') || name.includes('frontend') || name.includes('ui')) {
    return 'frontend';
  }
  if (name.includes('backend') || name.includes('api') || name.includes('server')) {
    return 'backend';
  }
  if (name.includes('mobile') || name.includes('ios') || name.includes('android')) {
    return 'mobile';
  }
  if (name.includes('function') || name.includes('lambda') || name.includes('service')) {
    return 'service';
  }
  if (name.includes('lib') || name.includes('package') || name.includes('shared')) {
    return 'library';
  }

  // Default based on frameworks
  if (workspace.frameworks?.frontend?.length > 0) {
    return 'frontend';
  }
  if (workspace.frameworks?.backend?.length > 0) {
    return 'backend';
  }

  return 'service';
}

/**
 * Transform stack-detection workspace format to schema format
 */
function transformWorkspaces(stackProfile) {
  const workspaces = stackProfile.workspaces || [];

  return workspaces.map(workspace => {
    return {
      path: workspace.path || '',
      language: workspace.primary_language || 'javascript',
      type: inferWorkspaceType(workspace),
      frameworks: [
        ...(workspace.frameworks?.frontend || []),
        ...(workspace.frameworks?.backend || [])
      ].filter(Boolean)
    };
  });
}

/**
 * Transform testing frameworks to schema format
 */
function transformTestingFrameworks(stackProfile) {
  const result = {};

  // If workspaces exist, collect testing frameworks from each
  if (stackProfile.workspaces && Array.isArray(stackProfile.workspaces)) {
    for (const workspace of stackProfile.workspaces) {
      const lang = workspace.primary_language;
      if (lang && workspace.testing && Array.isArray(workspace.testing)) {
        if (!result[lang]) {
          result[lang] = [];
        }
        for (const test of workspace.testing) {
          const testName = test.name || test;
          if (!result[lang].includes(testName)) {
            result[lang].push(testName);
          }
        }
      }
    }
  }

  // Also check top-level testing array
  if (stackProfile.testing && Array.isArray(stackProfile.testing)) {
    const lang = stackProfile.primary_language || 'javascript';
    if (!result[lang]) {
      result[lang] = [];
    }
    for (const test of stackProfile.testing) {
      const testName = test.name || test;
      if (!result[lang].includes(testName)) {
        result[lang].push(testName);
      }
    }
  }

  // Also check testing_frameworks if it's an array (from merged profile)
  if (stackProfile.testing_frameworks && Array.isArray(stackProfile.testing_frameworks)) {
    const lang = stackProfile.primary_language || 'javascript';
    if (!result[lang]) {
      result[lang] = [];
    }
    for (const testName of stackProfile.testing_frameworks) {
      if (typeof testName === 'string' && !result[lang].includes(testName)) {
        result[lang].push(testName);
      }
    }
  }

  return result;
}

async function generateConfig() {
  try {
    const phase1Path = path.join(tempDir, 'phase1-outputs');
    const phase2ConsolidationPath = path.join(tempDir, 'consolidated.md');
    const phase3SynthesisPath = path.join(tempDir, 'synthesis-raw.md');
    const stackProfilePath = path.join(tempDir, 'stack-profile.json');

    if (!fs.existsSync(phase1Path)) {
      throw new Error(`Phase 1 outputs not found: ${phase1Path}`);
    }

    if (!fs.existsSync(stackProfilePath)) {
      throw new Error(`Stack profile not found: ${stackProfilePath}`);
    }

    const stackProfile = JSON.parse(fs.readFileSync(stackProfilePath, 'utf-8'));

    // Read phase1 outputs (they are .json files, not .md)
    const phase1Files = fs.readdirSync(phase1Path).filter(f =>
      f.endsWith('.json') && !f.includes('attempt') && !f.includes('validation')
    );

    const phase1Analysis = {};
    for (const file of phase1Files) {
      const schemaKey = filenameToSchemaKey(file);
      const agentName = file.replace('.json', '');
      const filePath = path.join(phase1Path, file);

      // Read and parse JSON
      const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      phase1Analysis[schemaKey] = {
        agent_name: agentName,
        timestamp: jsonData.timestamp || new Date().toISOString(),
        findings: jsonData.findings || {},
        confidence: jsonData.confidence || 'high'
      };

      // Preserve needs_verification if present
      if (jsonData.needs_verification) {
        phase1Analysis[schemaKey].needs_verification = jsonData.needs_verification;
      }
    }

    const phase2Consolidation = {
      gaps_identified: [],
      consolidation_timestamp: new Date().toISOString(),
      validation_status: 'valid'
    };

    if (fs.existsSync(phase2ConsolidationPath)) {
      const consolidationContent = fs.readFileSync(phase2ConsolidationPath, 'utf-8');
      phase2Consolidation.raw_content = consolidationContent;
    }

    const phase3Synthesis = {
      synthesis_timestamp: new Date().toISOString(),
      project_understanding: {},
      architectural_patterns: [],
      key_insights: []
    };

    if (fs.existsSync(phase3SynthesisPath)) {
      const synthesisContent = fs.readFileSync(phase3SynthesisPath, 'utf-8');
      phase3Synthesis.raw_content = synthesisContent;
    }

    const phase4Context = {
      context_generation_timestamp: new Date().toISOString(),
      files_generated: [
        '.claude/CLAUDE.md',
        '.claude/skills/project-context/SKILL.md'
      ]
    };

    const configUpdater = new ConfigUpdater(projectPath, frameworkPath);

    const packageJsonPath = path.join(frameworkPath, 'package.json');
    let frameworkVersion = '2.0.0';
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      frameworkVersion = packageJson.version || '2.0.0';
    }

    // Extract stack data from phase1-outputs (tech-stack-dependencies)
    // Phase1 agents have the real stack data; stack-profile.json is empty because
    // it tries to read from framework-config.json which doesn't exist yet
    const techStackData = phase1Analysis.tech_stack_dependencies?.findings || {};

    // Also extract from code_patterns_testing for better testing framework detection
    const codePatterns = phase1Analysis.code_patterns_testing?.findings || {};

    // Extract languages from phase1 workspaces
    const detectedLanguages = new Set();
    if (techStackData.multi_stack?.workspaces) {
      techStackData.multi_stack.workspaces.forEach(ws => {
        if (ws.language) {
          detectedLanguages.add(ws.language);
        }
      });
    }

    // Determine primary language (most common across workspaces)
    let primaryLanguage = undefined;
    if (detectedLanguages.size > 0) {
      const langCounts = {};
      techStackData.multi_stack?.workspaces?.forEach(ws => {
        if (ws.language) {
          langCounts[ws.language] = (langCounts[ws.language] || 0) + 1;
        }
      });

      if (Object.keys(langCounts).length > 0) {
        primaryLanguage = Object.entries(langCounts)
          .sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    // Extract frameworks from dependencies
    const frameworks = { frontend: [], backend: [], mobile: [] };
    const frontendSet = new Set(['react', 'vue', 'angular', 'next', 'nextjs', 'svelte']);
    const backendSet = new Set(['express', 'fastapi', 'django', 'nestjs', 'flask', 'firebase-functions']);

    if (techStackData.multi_stack?.workspaces) {
      techStackData.multi_stack.workspaces.forEach(ws => {
        if (ws.dependencies) {
          ws.dependencies.forEach(dep => {
            const depLower = dep.toLowerCase().replace(/[^a-z]/g, '');
            if (frontendSet.has(depLower) && !frameworks.frontend.includes(dep)) {
              frameworks.frontend.push(dep);
            } else if (backendSet.has(depLower) && !frameworks.backend.includes(dep)) {
              frameworks.backend.push(dep);
            }
          });
        }
      });
    }

    // Transform phase1 workspaces to schema format
    const detectedWorkspaces = techStackData.multi_stack?.workspaces?.map(ws => ({
      path: ws.path || '',
      language: ws.language || 'javascript',
      type: inferWorkspaceType(ws),
      frameworks: ws.dependencies || []
    })) || [];

    // Extract testing frameworks from dependencies
    const testingFrameworks = {};
    const testingSet = new Set(['jest', 'vitest', 'playwright', 'pytest', 'mocha', 'chai', '@playwright/test']);

    if (techStackData.multi_stack?.workspaces) {
      techStackData.multi_stack.workspaces.forEach(ws => {
        const lang = ws.language || 'javascript';
        if (!testingFrameworks[lang]) {
          testingFrameworks[lang] = [];
        }

        if (ws.dependencies) {
          ws.dependencies.forEach(dep => {
            const depLower = dep.toLowerCase().replace(/[^a-z]/g, '');
            if (testingSet.has(depLower) && !testingFrameworks[lang].includes(dep)) {
              testingFrameworks[lang].push(dep);
            }
          });
        }
      });
    }

    // Extract testing frameworks from code_patterns_testing (more accurate)
    if (codePatterns.multi_stack?.workspaces) {
      codePatterns.multi_stack.workspaces.forEach(ws => {
        if (ws.testing_framework) {
          const lang = (ws.language || 'javascript').toLowerCase();
          if (!testingFrameworks[lang]) {
            testingFrameworks[lang] = [];
          }
          if (!testingFrameworks[lang].includes(ws.testing_framework)) {
            testingFrameworks[lang].push(ws.testing_framework);
          }
        }
      });
    }

    const stackProfileData = {
      languages: Array.from(detectedLanguages),
      frameworks,
      testing_frameworks: testingFrameworks,
      detected_workspaces: detectedWorkspaces,
      file_counts: stackProfile.file_counts || {}
    };

    // Only add primary_language if we have one (schema says it's optional but must be string if present)
    if (primaryLanguage) {
      stackProfileData.primary_language = primaryLanguage;
    }

    const config = {
      schema_version: '1.0.0',
      framework_version: frameworkVersion,
      project_metadata: {
        project_path: path.resolve(projectPath),
        last_analysis: new Date().toISOString(),
        initialization_hash: configUpdater.generateProjectHash()
      },
      analysis_results: {
        phase1_analysis: phase1Analysis,
        phase2_consolidation: phase2Consolidation,
        phase3_synthesis: phase3Synthesis,
        phase4_context: phase4Context
      },
      stack_profile: stackProfileData,
      resource_state: {
        skills: {},
        agents: {},
        commands: {},
        last_sync: new Date().toISOString()
      }
    };

    const validation = await configUpdater.validateConfig(config);
    if (!validation.valid) {
      console.error('Config validation failed:', JSON.stringify(validation.errors, null, 2));
      throw new Error('Generated config does not match schema');
    }

    await configUpdater.writeConfig(config);

    console.log('✓ Framework configuration generated successfully');
    console.log(`  - Schema version: ${config.schema_version}`);
    console.log(`  - Framework version: ${config.framework_version}`);
    console.log(`  - Languages detected: ${config.stack_profile.languages.join(', ')}`);
    console.log(`  - Primary language: ${config.stack_profile.primary_language || 'none'}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating config:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateConfig();
