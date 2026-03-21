import type { InitializeProjectState } from '../../state/schemas/initialize-project.schema.js';
import { consolidateAnalyses } from '../../utils/consolidation.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { createAgentFromMarkdown } from '../../utils/agent-factory.js';
import { extractJSON, type ValidationResult } from '../../utils/validator.js';
import {
  retryWithEnhancedFeedback,
  DEFAULT_RETRY_CONFIG
} from '../../utils/enhanced-retry.js';

interface Gap {
  type: 'needs_verification' | 'sparse_findings' | 'missing_language_coverage';
  agent: string;
  item: string;
  question?: string;
  reason?: string;
  priority: 'high' | 'medium' | 'low';
}

interface ConsolidatedGap extends Gap {
  consolidated_from: string[];
  original_count: number;
}

interface QuestionConsolidationOutput {
  consolidated_gaps: ConsolidatedGap[];
  consolidation_metadata: {
    original_gap_count: number;
    consolidated_gap_count: number;
    reduction_percentage: number;
    consolidation_groups: Array<{
      group_id: number;
      topic: string;
      original_items: string[];
      consolidated_to: string;
      reason?: string;
    }>;
  };
}

/**
 * Consolidates outputs from all 4 Phase 1 analyzer agents
 * Includes gap question consolidation and interactive questioning
 */
export async function consolidationNode(
  state: InitializeProjectState
): Promise<Partial<InitializeProjectState>> {
  console.log('\n[Phase 2: Consolidation] Starting...');

  // Read Phase 1 outputs from disk (not from state)
  const tempDir = state.temp_dir || join(state.project_path, '.claude-temp/initialize-project');
  const phase1Dir = join(tempDir, 'phase1-outputs');

  if (!existsSync(phase1Dir)) {
    throw new Error(`Phase 1 outputs directory not found: ${phase1Dir}`);
  }

  console.log('[Phase 2: Consolidation] Loading Phase 1 outputs from disk...');

  // Load all 4 analyzer outputs from disk
  const phase1Files = [
    '01-structure-architecture.json',
    '02-tech-stack-dependencies.json',
    '03-code-patterns-testing.json',
    '04-data-flows-integrations.json'
  ];

  const analyzers: any[] = [];

  for (const filename of phase1Files) {
    const filePath = join(phase1Dir, filename);
    if (!existsSync(filePath)) {
      throw new Error(`Phase 1 output file not found: ${filePath}`);
    }
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    analyzers.push(content);
    console.log(`  ✓ Loaded ${filename}`);
  }

  console.log('[Phase 2: Consolidation] ✓ All Phase 1 outputs loaded from disk');

  try {
    // ========================================================================
    // STEP 1: MERGE ANALYSES
    // ========================================================================
    console.log('[Phase 2: Consolidation] Step 1: Merging analyzer outputs...');

    // analyzers array is already populated from files

    const consolidated = consolidateAnalyses(analyzers);

    const tempDir = state.temp_dir!;
    const consolidatedPath = join(tempDir, 'phase2-consolidation.json');
    writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));

    console.log('[Phase 2: Consolidation] ✓ Consolidation complete');
    console.log('');

    // ========================================================================
    // STEP 2: GAP ANALYSIS
    // ========================================================================
    console.log('[Phase 2: Consolidation] Step 2: Analyzing gaps...');

    // Parse consolidation to extract structured gaps
    const consolidationData = JSON.parse(readFileSync(consolidatedPath, 'utf-8'));
    let gaps: Gap[] = [];

    // Extract gaps from identified_gaps array (which are strings)
    // We need to reconstruct Gap objects from the consolidated analysis
    if (consolidationData.identified_gaps && consolidationData.identified_gaps.length > 0) {
      // Re-run gap extraction to get structured data
      gaps = extractStructuredGaps(analyzers);
    }

    const conflictsCount = consolidationData.conflicting_findings?.length || 0;

    console.log(`  Gaps identified: ${gaps.length}`);
    console.log(`  Conflicts detected: ${conflictsCount}`);
    console.log('');

    // ========================================================================
    // STEP 3: QUESTION CONSOLIDATION (if > 1 gap)
    // ========================================================================
    if (gaps.length > 1) {
      console.log('[Phase 2: Consolidation] Step 3: Consolidating similar questions...');
      console.log('  Running AI-powered question consolidation agent...');
      console.log('');

      const consolidationResult = await consolidateQuestions(
        gaps,
        state.project_path,
        state.framework_path,
        tempDir
      );

      if (consolidationResult.success && consolidationResult.consolidated) {
        // Update consolidation.json with consolidated gaps
        consolidationData.gaps = consolidationResult.consolidated.consolidated_gaps;
        consolidationData.question_consolidation = consolidationResult.consolidated.consolidation_metadata;
        writeFileSync(consolidatedPath, JSON.stringify(consolidationData, null, 2));

        const newGapCount = consolidationResult.consolidated.consolidated_gaps.length;
        console.log(`  Questions after consolidation: ${newGapCount} (was ${gaps.length})`);
        gaps = consolidationResult.consolidated.consolidated_gaps;
      } else {
        console.log('  ⚠ WARNING: Question consolidation failed');
        console.log('  Proceeding with original unconsolidated gaps');
        // Store gaps as-is for interactive questioning
        consolidationData.gaps = gaps;
        writeFileSync(consolidatedPath, JSON.stringify(consolidationData, null, 2));
      }
      console.log('');
    } else if (gaps.length === 1) {
      console.log('[Phase 2: Consolidation] Step 3: Only 1 gap found - skipping consolidation');
      consolidationData.gaps = gaps;
      writeFileSync(consolidatedPath, JSON.stringify(consolidationData, null, 2));
      console.log('');
    } else {
      console.log('[Phase 2: Consolidation] Step 3: No gaps found - skipping consolidation');
      console.log('');
    }

    // ========================================================================
    // STEP 4: INTERACTIVE QUESTIONS (if needed)
    // ========================================================================
    const needsUserInput = gaps.length > 5 || conflictsCount > 0;

    if (needsUserInput) {
      console.log('⚠ Warning: Gaps or conflicts detected in analysis');
      console.log(`  Gaps: ${gaps.length}`);
      console.log(`  Conflicts: ${conflictsCount}`);
      console.log('');

      const skipQuestions = process.env.SKIP_GAP_QUESTIONS === 'true';

      if (skipQuestions) {
        console.log('ℹ SKIP_GAP_QUESTIONS=true - Continuing without user input');
        console.log('  (Synthesis will proceed with available data)');
        console.log('');
      } else {
        console.log('Launching interactive questionnaire...');
        console.log('');

        const askResult = await askGapQuestions(
          consolidatedPath,
          state.framework_path
        );

        if (!askResult.success) {
          console.log('');
          console.log('❌ Error during gap questionnaire');
          console.log('');
          console.log('You can:');
          console.log('  1. Set SKIP_GAP_QUESTIONS=true to skip questions');
          console.log(`  2. Manually edit: ${consolidatedPath}`);
          console.log('  3. Try again');
          console.log('');

          return {
            errors: [...state.errors, 'Gap questionnaire failed'],
            current_phase: 'failed'
          };
        }

        console.log('✓ Gap clarifications complete');
        console.log('');
      }
    } else {
      console.log('✓ No critical gaps requiring user input');
      console.log('');
    }

    // ========================================================================
    // STEP 5: FINALIZE CONSOLIDATION
    // ========================================================================
    console.log('[Phase 2: Consolidation] Step 4: Finalizing consolidation...');

    // Re-read consolidation file (may have user clarifications)
    const finalConsolidation = JSON.parse(readFileSync(consolidatedPath, 'utf-8'));

    console.log('✓ Consolidation ready for synthesis');
    console.log(`  File: ${consolidatedPath}`);
    console.log('');

    console.log('[Phase 2: Consolidation] ✓ Complete');
    console.log(`  - Gaps identified: ${gaps.length}`);

    return {
      // Mark Phase 1 as completed (Phase 6 validation checks this)
      phase1_analysis: {
        all_completed: true,
        completion_timestamp: new Date().toISOString()
      },
      phase2_consolidation: {
        ...consolidated,
        ...finalConsolidation,
        timestamp: new Date().toISOString()
      },
      current_phase: 'phase2_consolidation'
    };

  } catch (error) {
    const errorMessage = `Consolidation failed: ${(error as Error).message}`;
    console.error('[Phase 2: Consolidation] ✗ Error:', errorMessage);

    return {
      errors: [...state.errors, errorMessage],
      current_phase: 'failed'
    };
  }
}

/**
 * Extract structured gap objects from analyzer outputs
 */
function extractStructuredGaps(analyzers: any[]): Gap[] {
  const gaps: Gap[] = [];

  analyzers.forEach(analyzer => {
    if (analyzer.needs_verification && analyzer.needs_verification.length > 0) {
      analyzer.needs_verification.forEach((item: any) => {
        const isObject = typeof item === 'object' && item !== null;
        const itemText = isObject ? item.item || JSON.stringify(item) : String(item);
        const questionText = isObject ? item.question : String(item);
        const reasonText = isObject ? item.reason : undefined;

        gaps.push({
          type: 'needs_verification',
          agent: normalizeAgentName(analyzer.agent_name),
          item: itemText,
          question: questionText,
          reason: reasonText,
          priority: 'medium'
        });
      });
    }
  });

  return gaps;
}

/**
 * Normalize agent name for consistency
 */
function normalizeAgentName(agentName: string): string {
  const name = agentName.toLowerCase();

  if (name.includes('structure') || name.includes('architecture')) {
    return '01-structure-architecture';
  }
  if (name.includes('stack') || name.includes('dependencies')) {
    return '02-tech-stack-dependencies';
  }
  if (name.includes('patterns') || name.includes('testing')) {
    return '03-code-patterns-testing';
  }
  if (name.includes('flow') || name.includes('integration')) {
    return '04-data-flows-integrations';
  }

  return agentName;
}

/**
 * Consolidate similar questions using question-consolidator agent
 */
async function consolidateQuestions(
  gaps: Gap[],
  projectPath: string,
  frameworkPath: string,
  tempDir: string
): Promise<{ success: boolean; consolidated?: QuestionConsolidationOutput; error?: string }> {
  try {
    // Build prompt with gaps
    const gapsJson = JSON.stringify(gaps, null, 2);

    // Define agent invocation function with feedback support
    const agentInvoke = async (feedbackPrompt: string): Promise<string> => {
      const additionalContext = `
CRITICAL: Follow ALL instructions in the agent file below.
Output ONLY valid JSON starting with { and ending with }
Do NOT wrap in markdown code blocks or add ANY text before/after the JSON

CRITICAL VALIDATION REQUIREMENTS:
1. Every 'question' field MUST end with a question mark (?)
   - WRONG: "What are the requirements. Please specify details."
   - WRONG: "What tools are used? (e.g., eslint, prettier)"
   - RIGHT: "What are the requirements and details?"
   - RIGHT: "What tools and configurations are used for linting?"

2. Remove clarifying examples or follow-up instructions from questions
   - If you need to add context, put it in the 'reason' field instead

3. When populating 'consolidated_from' array, use these EXACT agent names:
   - 01-structure-architecture
   - 02-tech-stack-dependencies
   - 03-code-patterns-testing
   - 04-data-flows-integrations
   - consolidation

   Do NOT use descriptive names like 'tech-stack-dependencies-analyzer'.
   Use the file name format shown above (with numeric prefixes, no -analyzer suffix).

=== INPUT DATA ===
Current gaps that need consolidation:
${gapsJson}

${feedbackPrompt}
`;

      const agent = await createAgentFromMarkdown({
        agentName: 'question-consolidator',
        agentFile: '06-question-consolidator.md',
        projectPath,
        frameworkPath,
        additionalContext,
        timeout: 120000 // 2 minutes
      });

      const result = await agent.invoke({
        input: 'Consolidate the questions provided in the context above.'
      });

      return result.output || result.content || JSON.stringify(result);
    };

    // Define validator function
    const validator = (output: string): ValidationResult => {
      try {
        // Extract and parse JSON
        const jsonOutput = extractJSON(output);
        const parsed: QuestionConsolidationOutput = JSON.parse(jsonOutput);

        // Basic validation
        if (!parsed.consolidated_gaps || !Array.isArray(parsed.consolidated_gaps)) {
          return {
            valid: false,
            errors: ['Invalid output: missing consolidated_gaps array'],
            data: null
          };
        }

        if (!parsed.consolidation_metadata) {
          return {
            valid: false,
            errors: ['Invalid output: missing consolidation_metadata'],
            data: null
          };
        }

        // Validate question format (must end with ?)
        for (const gap of parsed.consolidated_gaps) {
          if (!gap.question || !gap.question.endsWith('?')) {
            return {
              valid: false,
              errors: [`Invalid question format: "${gap.question}" must end with ?`],
              data: null
            };
          }
        }

        return {
          valid: true,
          errors: [],
          data: parsed
        };
      } catch (error) {
        return {
          valid: false,
          errors: [(error as Error).message],
          data: null
        };
      }
    };

    // Use enhanced retry with progressive feedback
    const parsed = await retryWithEnhancedFeedback<QuestionConsolidationOutput>(
      agentInvoke,
      validator,
      DEFAULT_RETRY_CONFIG
    );

    console.log('  ✓ Consolidation successful and validated');
    return { success: true, consolidated: parsed };

  } catch (error) {
    const errMsg = (error as Error).message;
    console.log(`  ✗ Consolidation failed: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

/**
 * Ask gap questions interactively using Node.js helper script
 */
async function askGapQuestions(
  consolidationPath: string,
  frameworkPath: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const askScript = join(frameworkPath, 'skills/010-foundation/initialize-project/scripts/helpers/ask-gap-questions.js');

    if (!existsSync(askScript)) {
      resolve({ success: false, error: `Script not found: ${askScript}` });
      return;
    }

    const child = spawn('node', [askScript, consolidationPath], {
      stdio: 'inherit', // Allow terminal interaction
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `Script exited with code ${code}` });
      }
    });

    child.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}
