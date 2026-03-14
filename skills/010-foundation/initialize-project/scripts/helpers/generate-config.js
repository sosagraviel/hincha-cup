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
      stack_profile: {
        // Transform languages from objects to simple string array
        languages: Array.isArray(stackProfile.languages)
          ? stackProfile.languages.map(lang => typeof lang === 'string' ? lang : lang.name)
          : [],
        primary_language: stackProfile.primary_language || null,
        // Frameworks already in expected format from stack-detection
        frameworks: stackProfile.frameworks || {
          frontend: [],
          backend: [],
          mobile: []
        },
        // Transform testing frameworks to object with language keys
        testing_frameworks: transformTestingFrameworks(stackProfile),
        // Transform workspaces to schema format
        detected_workspaces: transformWorkspaces(stackProfile),
        file_counts: stackProfile.file_counts || {}
      },
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
