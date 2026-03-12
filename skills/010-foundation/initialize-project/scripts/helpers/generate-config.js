#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ConfigUpdater } = require('../../../../../utils/config-updater.js');

const tempDir = process.argv[2];
const projectPath = process.argv[3];
const frameworkPath = process.argv[4];

if (!tempDir || !projectPath || !frameworkPath) {
  console.error('Usage: node generate-config.js <temp-dir> <project-path> <framework-path>');
  process.exit(1);
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

    const phase1Files = fs.readdirSync(phase1Path).filter(f => f.endsWith('.md'));

    const phase1Analysis = {};
    for (const file of phase1Files) {
      const agentName = file.replace('.md', '');
      const content = fs.readFileSync(path.join(phase1Path, file), 'utf-8');

      phase1Analysis[agentName] = {
        agent_name: agentName,
        timestamp: new Date().toISOString(),
        findings: {
          raw_content: content
        },
        confidence: 'high'
      };
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
        languages: stackProfile.languages || [],
        primary_language: stackProfile.primary_language || null,
        frameworks: stackProfile.frameworks || { frontend: [], backend: [], mobile: [] },
        testing_frameworks: stackProfile.testing_frameworks || {},
        detected_workspaces: stackProfile.detected_workspaces || [],
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
