import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateFrameworkConfig, type StackProfile } from '../../utils/config-generator.js';

/**
 * Phase 4: Context Generation Node
 *
 * This node:
 * - Extracts CLAUDE.md and project-context content from Phase 3 synthesis using regex
 * - Runs stack detection using existing utilities
 * - Generates framework-config.json with all phase outputs
 * - Writes all files to project directory
 *
 * Features:
 * - Fast regex-based extraction (no LLM calls)
 * - Deterministic and reliable
 * - Matches bash flow implementation
 *
 * @param state - Current workflow state
 * @returns Updated state with context generation results
 */
export async function contextGenerationNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  console.log('\n[Phase 4: Context Generation] Starting file extraction...');

  // Read Phase 3 synthesis from disk (not from state)
  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  const synthesisPath = join(tempDir, 'synthesis-raw.md');

  if (!existsSync(synthesisPath)) {
    throw new Error(`Phase 3 synthesis file not found: ${synthesisPath}`);
  }

  console.log('[Phase 4: Context Generation] Loading Phase 3 synthesis from disk...');
  const synthesisContent = readFileSync(synthesisPath, 'utf-8');
  console.log('[Phase 4: Context Generation] ✓ Phase 3 synthesis loaded from disk');

  try {

    // Extract CLAUDE.md using regex (matches bash implementation)
    console.log('[Phase 4: Context Generation] Extracting CLAUDE.md...');
    const claudeMatch = synthesisContent.match(/# CLAUDE\.md Content\s*\n+([\s\S]*?)(?=\n+---\s*\n+# project-context)/);
    if (!claudeMatch) {
      throw new Error('Could not find CLAUDE.md Content section in synthesis');
    }
    const claudeMdContent = claudeMatch[1].trim();
    const claudeMdLines = claudeMdContent.split('\n').length;
    console.log(`[Phase 4: Context Generation] ✓ Extracted CLAUDE.md (${claudeMdLines} lines)`);

    // Extract project-context/SKILL.md using regex (matches bash implementation)
    console.log('[Phase 4: Context Generation] Extracting project-context/SKILL.md...');
    const contextMatch = synthesisContent.match(/# project-context\/SKILL\.md Content\s*\n+([\s\S]*$)/);
    if (!contextMatch) {
      throw new Error('Could not find project-context/SKILL.md Content section in synthesis');
    }
    const projectContextContent = contextMatch[1].trim();
    const projectContextLines = projectContextContent.split('\n').length;
    console.log(`[Phase 4: Context Generation] ✓ Extracted project-context/SKILL.md (${projectContextLines} lines)`);

    // Write CLAUDE.md
    const claudeMdPath = join(state.project_path, '.claude', 'CLAUDE.md');
    mkdirSync(join(state.project_path, '.claude'), { recursive: true });
    writeFileSync(claudeMdPath, claudeMdContent);
    console.log(`[Phase 4: Context Generation] ✓ Written: ${claudeMdPath}`);

    // Write project-context/SKILL.md
    const projectContextDir = join(state.project_path, '.claude', 'project-context');
    mkdirSync(projectContextDir, { recursive: true });
    const projectContextPath = join(projectContextDir, 'SKILL.md');
    writeFileSync(projectContextPath, projectContextContent);
    console.log(`[Phase 4: Context Generation] ✓ Written: ${projectContextPath}`);

    // Read Phase 1 analysis files from disk (not from state)
    console.log('[Phase 4: Context Generation] Loading Phase 1 analysis from disk...');

    const phase1Dir = join(tempDir, 'phase1-outputs');
    if (!existsSync(phase1Dir)) {
      throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
    }

    const structureArchPath = join(phase1Dir, '01-structure-architecture.json');
    const techStackPath = join(phase1Dir, '02-tech-stack-dependencies.json');

    if (!existsSync(structureArchPath) || !existsSync(techStackPath)) {
      throw new Error('Required Phase 1 analyzer outputs not found');
    }

    const structureArchData = JSON.parse(readFileSync(structureArchPath, 'utf-8'));
    const techStackData = JSON.parse(readFileSync(techStackPath, 'utf-8'));

    console.log('[Phase 4: Context Generation] ✓ Phase 1 analysis loaded from disk');
    console.log('[Phase 4: Context Generation] Extracting stack profile from Phase 1 analysis...');

    const structureFindings = structureArchData.findings as any;
    const techStackFindings = techStackData.findings as any;

    // Extract languages from structure analyzer
    const languagesFromPhase1 = Array.isArray(structureFindings?.languages)
      ? structureFindings.languages.map((l: string) => l.toLowerCase())
      : [];

    console.log(`[Phase 4: Context Generation] Languages from Phase 1: ${languagesFromPhase1.join(', ') || 'none'}`);

    // Extract frameworks from structure analyzer
    const frameworksObj = structureFindings?.frameworks || {};
    const frontendFrameworks: string[] = [];
    const backendFrameworks: string[] = [];

    // Parse frameworks object (it has main, orm, testing, ui fields)
    if (frameworksObj.main) {
      // Determine if it's frontend or backend based on name
      const mainFramework = frameworksObj.main.split(' ')[0].toLowerCase(); // "Next.js 15.5.10" -> "next.js"
      if (mainFramework.includes('next') || mainFramework.includes('react') || mainFramework.includes('vue') || mainFramework.includes('angular')) {
        frontendFrameworks.push(mainFramework);
      } else {
        backendFrameworks.push(mainFramework);
      }
    }

    if (frameworksObj.ui) {
      const uiFrameworks = frameworksObj.ui.split('+').map((f: string) => f.trim().split(' ')[0].toLowerCase());
      frontendFrameworks.push(...uiFrameworks);
    }

    // Also extract from workspace dependencies
    const workspaces = structureFindings?.multi_stack?.workspaces || [];
    workspaces.forEach((ws: any) => {
      if (Array.isArray(ws.dependencies)) {
        ws.dependencies.forEach((dep: string) => {
          const depLower = dep.toLowerCase();
          // Frontend frameworks
          if (depLower.includes('react') || depLower.includes('next') || depLower.includes('vue') || depLower.includes('angular') || depLower.includes('grommet')) {
            const frameworkName = dep.split(' ')[0].toLowerCase();
            if (!frontendFrameworks.includes(frameworkName)) {
              frontendFrameworks.push(frameworkName);
            }
          }
          // Backend frameworks
          if (depLower.includes('express') || depLower.includes('flask') || depLower.includes('django') || depLower.includes('fastapi')) {
            const frameworkName = dep.split(' ')[0].toLowerCase();
            if (!backendFrameworks.includes(frameworkName)) {
              backendFrameworks.push(frameworkName);
            }
          }
        });
      }
    });

    console.log(`[Phase 4: Context Generation] Frontend frameworks: ${frontendFrameworks.join(', ') || 'none'}`);
    console.log(`[Phase 4: Context Generation] Backend frameworks: ${backendFrameworks.join(', ') || 'none'}`);

    // Extract infrastructure from Phase 1 tech-stack-dependencies analyzer
    const infrastructureFromPhase1 = Array.isArray(techStackFindings?.infrastructure)
      ? techStackFindings.infrastructure as string[]
      : [];

    console.log(`[Phase 4: Context Generation] Infrastructure from Phase 1: ${infrastructureFromPhase1.join(', ') || 'none'}`);

    // Extract testing frameworks
    const testingFrameworks: Record<string, string[]> = {};
    workspaces.forEach((ws: any) => {
      if (ws.language && ws.testing_framework && ws.testing_framework !== 'none') {
        const lang = ws.language.toLowerCase();
        if (!testingFrameworks[lang]) {
          testingFrameworks[lang] = [];
        }
        if (!testingFrameworks[lang].includes(ws.testing_framework)) {
          testingFrameworks[lang].push(ws.testing_framework);
        }
      }
    });

    // Extract detected workspaces
    const detectedWorkspaces = Array.isArray(structureFindings?.multi_stack?.workspaces)
      ? structureFindings.multi_stack.workspaces
      : [];

    // Determine primary language (most common language in workspaces)
    const languageCounts: Record<string, number> = {};
    workspaces.forEach((ws: any) => {
      if (ws.language) {
        const lang = ws.language.toLowerCase();
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      }
    });
    const primaryLanguage = Object.keys(languageCounts).sort((a, b) => languageCounts[b] - languageCounts[a])[0] || undefined;

    // Build stack profile from Phase 1 extracted data
    const stackProfile: StackProfile = {
      languages: languagesFromPhase1.length > 0 ? languagesFromPhase1 : undefined,
      primary_language: primaryLanguage,
      frameworks: {
        frontend: frontendFrameworks.length > 0 ? frontendFrameworks : [],
        backend: backendFrameworks.length > 0 ? backendFrameworks : [],
        mobile: []
      },
      testing_frameworks: Object.keys(testingFrameworks).length > 0 ? testingFrameworks : undefined,
      infrastructure: infrastructureFromPhase1.length > 0 ? infrastructureFromPhase1 : undefined,
      detected_workspaces: detectedWorkspaces.length > 0 ? detectedWorkspaces : undefined,
      file_counts: undefined,
      workspaces: detectedWorkspaces.length > 0 ? detectedWorkspaces : undefined,
      package_manager: techStackFindings?.monorepo?.workspace_manager as string | undefined,
      workspace_type: structureFindings?.repository_type as string | undefined
    };

    // Save stack profile to temp dir for reference
    const stackProfilePath = join(state.temp_dir!, 'stack-profile.json');
    writeFileSync(stackProfilePath, JSON.stringify(stackProfile, null, 2));

    // Generate framework-config.json using TypeScript utility
    console.log('[Phase 4: Context Generation] Generating framework-config.json...');
    const frameworkConfig = generateFrameworkConfig(state, stackProfile, state.framework_path);

    const configPath = join(state.project_path, '.claude', 'framework-config.json');
    writeFileSync(configPath, JSON.stringify(frameworkConfig, null, 2));
    console.log(`[Phase 4: Context Generation] ✓ Written: ${configPath}`);

    return {
      phase3_synthesis: {
        synthesis_content: synthesisContent,
        timestamp: new Date().toISOString(),
        validation_passed: true,
        extracted_files: {
          claude_md: claudeMdContent,
          project_context_md: projectContextContent
        }
      },
      phase4_context: {
        claude_md_written: true,
        project_context_written: true,
        stack_profile: stackProfile,
        framework_config_generated: true,
        timestamp: new Date().toISOString()
      },
      framework_config_path: configPath,
      claude_md_path: claudeMdPath,
      project_context_path: projectContextPath,
      current_phase: 'phase4_context'
    };

  } catch (error) {
    const errorMessage = `Context generation failed: ${(error as Error).message}`;
    console.error(`[Phase 4: Context Generation] ✗ ${errorMessage}`);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed'
    };
  }
}

