/**
 * COMPREHENSIVE SYNTHESIS VALIDATOR
 *
 * This validator is the main quality gate for the AI Agentic Framework synthesis output.
 * Used by 600+ projects and 6000+ developers.
 *
 * MUST be identical in BOTH:
 * - agents/hooks/validate-synthesis.ts (stop hook)
 * - src/nodes/initialize-project/phase3/synthesis.node.ts (external validator)
 *
 * @module synthesis-validator
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SynthesisValidationResult {
  valid: boolean;
  errors: string[];           // Specific, actionable error messages
  warnings?: string[];        // Non-blocking issues
  extracted?: {
    claudemd: string;
    projectContext: string;
  };
}

interface LineCountResult {
  valid: boolean;
  lineCount: number;
  minRequired: number;
  maxAllowed: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LIMITS = {
  CLAUDE_MD: {
    MIN_LINES: 30,
    MAX_LINES: 250,
  },
  PROJECT_CONTEXT: {
    MIN_LINES: 50,
    MAX_LINES: 600,
  },
  TOTAL_MIN_CHARS: 500,
} as const;

const SECTION_MARKERS = {
  CLAUDE_MD_HEADER: '# CLAUDE.md Content',
  PROJECT_CONTEXT_HEADER: '# project-context/SKILL.md Content',
  SEPARATOR: '---',
} as const;

// Patterns that indicate the agent is describing what it did instead of outputting content
const PREAMBLE_PATTERNS = [
  /^(let me|i('ll| will)|here('s| is)|now i|allowing me to)/i,
  /^(based on|according to|as requested|following your)/i,
  /^(i have (generated|created|produced|written))/i,
  /^(the (following|output|content|result) (is|contains|shows))/i,
  /^(here are the|below (is|are))/i,
  /^outputting/i,
  /^generating/i,
];

// Patterns that indicate Write tool usage or file operations
const WRITE_TOOL_PATTERNS = [
  /wrote\s+(to|file|content)/i,
  /created\s+(file|directory)/i,
  /saved.{0,20}(to|file|as)/i, // Allow up to 20 chars between "saved" and "to/file/as"
  /write\s+tool/i,
  /writefilesync/i,
  /fs\.write/i,
  /using\s+write/i,
];

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Comprehensive validator for synthesis agent output.
 *
 * Validates that the output:
 * 1. Is NOT JSON format
 * 2. Has the required section structure
 * 3. Contains valid markdown content
 * 4. Meets line count requirements
 * 5. Has proper YAML frontmatter in project-context
 * 6. Does not contain preamble or meta-descriptions
 *
 * @param output - Raw output from synthesis agent
 * @returns Validation result with specific, actionable errors
 */
export function validateSynthesisOutput(output: string): SynthesisValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ========================================================================
  // CHECK 1: Reject empty or near-empty output immediately
  // ========================================================================
  if (!output || output.trim().length === 0) {
    return {
      valid: false,
      errors: [
        'OUTPUT IS EMPTY',
        '',
        '🔴 WHAT WENT WRONG:',
        '   Your response contains no content.',
        '',
        '🟢 HOW TO FIX:',
        '   Output the complete markdown content starting with "# CLAUDE.md Content"',
        '',
        '📋 REQUIRED FORMAT:',
        '   # CLAUDE.md Content',
        '   ',
        '   [Your CLAUDE.md markdown here - 30-250 lines]',
        '   ',
        '   ---',
        '   ',
        '   # project-context/SKILL.md Content',
        '   ',
        '   ---',
        '   name: project-context',
        '   ---',
        '   ',
        '   [Your project-context markdown here - 50-600 lines]',
      ],
    };
  }

  // ========================================================================
  // CHECK 2: Detect JSON format (most common error)
  // ========================================================================
  const trimmedOutput = output.trim();
  const jsonError = detectJSONFormat(trimmedOutput);
  if (jsonError) {
    errors.push(jsonError);
    // Don't return early - collect all errors for comprehensive feedback
  }

  // ========================================================================
  // CHECK 3: Detect preamble text (agent describing what it will do)
  // ========================================================================
  const preambleError = detectPreambleText(trimmedOutput);
  if (preambleError) {
    errors.push(preambleError);
  }

  // ========================================================================
  // CHECK 4: Detect Write tool usage
  // ========================================================================
  const writeToolError = detectWriteToolUsage(trimmedOutput);
  if (writeToolError) {
    errors.push(writeToolError);
  }

  // ========================================================================
  // CHECK 5: Minimum total length
  // ========================================================================
  if (output.length < LIMITS.TOTAL_MIN_CHARS) {
    errors.push(
      `OUTPUT TOO SHORT (${output.length} characters, minimum ${LIMITS.TOTAL_MIN_CHARS})`,
      '',
      '🔴 WHAT WENT WRONG:',
      '   Your output is significantly shorter than expected.',
      '   A proper synthesis should have substantial content for both files.',
      '',
      '🟢 HOW TO FIX:',
      '   - CLAUDE.md should be 30-250 lines with tech stack, file placement, commands',
      '   - project-context should be 50-600 lines with architecture, workflows, gotchas',
    );
  }

  // ========================================================================
  // CHECK 6: Extract and validate sections
  // ========================================================================
  const extracted = extractSynthesisMarkdownRobust(output);

  if (!extracted) {
    errors.push(
      'CANNOT FIND REQUIRED SECTIONS',
      '',
      '🔴 WHAT WENT WRONG:',
      '   Could not locate the required section markers in your output.',
      '',
      '🟡 REQUIRED MARKERS (in order):',
      '   1. "# CLAUDE.md Content" - Section header for CLAUDE.md',
      '   2. "---" - Separator (three dashes on its own line)',
      '   3. "# project-context/SKILL.md Content" - Section header for project-context',
      '',
      '🟢 HOW TO FIX:',
      '   Your ENTIRE response must use this EXACT structure:',
      '',
      '   # CLAUDE.md Content',
      '',
      '   # ProjectName',
      '   ',
      '   ## Tech Stack',
      '   - TypeScript 5.3',
      '   ... (more content, 30-250 lines total)',
      '   ',
      '   ---',
      '   ',
      '   # project-context/SKILL.md Content',
      '   ',
      '   ---',
      '   name: project-context',
      '   description: Deep architectural knowledge',
      '   ---',
      '   ',
      '   # Project Context: ProjectName',
      '   ... (more content, 50-600 lines total)',
    );

    // Can't validate further without sections
    return { valid: false, errors: formatErrorsForAgent(errors) };
  }

  // ========================================================================
  // CHECK 7: Validate CLAUDE.md content
  // ========================================================================
  const claudeErrors = validateClaudeMdContent(extracted.claudemd);
  errors.push(...claudeErrors);

  // ========================================================================
  // CHECK 8: Validate project-context content
  // ========================================================================
  const contextErrors = validateProjectContextContent(extracted.projectContext);
  errors.push(...contextErrors);

  // ========================================================================
  // CHECK 9: Validate line counts
  // ========================================================================
  const claudeLineResult = validateLineCount(
    extracted.claudemd,
    LIMITS.CLAUDE_MD.MIN_LINES,
    LIMITS.CLAUDE_MD.MAX_LINES,
    'CLAUDE.md'
  );
  if (!claudeLineResult.valid) {
    if (claudeLineResult.lineCount < claudeLineResult.minRequired) {
      errors.push(
        `CLAUDE.md CONTENT TOO SHORT (${claudeLineResult.lineCount} lines, minimum ${claudeLineResult.minRequired})`,
        '',
        '🔴 WHAT WENT WRONG:',
        `   CLAUDE.md has only ${claudeLineResult.lineCount} lines but needs at least ${claudeLineResult.minRequired}.`,
        '',
        '🟢 HOW TO FIX:',
        '   CLAUDE.md must include these sections with sufficient detail:',
        '   - # ProjectName (1 line)',
        '   - ## Tech Stack (5-10 lines with exact versions)',
        '   - ## File Placement Guide (10-15 rows in table format)',
        '   - ## Directory Structure (5-10 lines with annotations)',
        '   - ## Essential Commands (5-10 rows in table format)',
        '   - ## Services & Ports (if applicable)',
        '   - ## Path Aliases (if applicable)',
      );
    } else {
      errors.push(
        `CLAUDE.md CONTENT TOO LONG (${claudeLineResult.lineCount} lines, maximum ${claudeLineResult.maxAllowed})`,
        '',
        '🔴 WHAT WENT WRONG:',
        `   CLAUDE.md has ${claudeLineResult.lineCount} lines but maximum is ${claudeLineResult.maxAllowed}.`,
        '',
        '🟢 HOW TO FIX:',
        '   CLAUDE.md should be a QUICK REFERENCE only. Remove:',
        '   - Architecture explanations (put in project-context)',
        '   - Request lifecycle details (put in project-context)',
        '   - Code examples (put in project-context)',
        '   - Any "why" explanations (put in project-context)',
        '   - Reduce File Placement Guide to 15-20 most common types',
      );
    }
  }

  const contextLineResult = validateLineCount(
    extracted.projectContext,
    LIMITS.PROJECT_CONTEXT.MIN_LINES,
    LIMITS.PROJECT_CONTEXT.MAX_LINES,
    'project-context'
  );
  if (!contextLineResult.valid) {
    if (contextLineResult.lineCount < contextLineResult.minRequired) {
      errors.push(
        `PROJECT-CONTEXT CONTENT TOO SHORT (${contextLineResult.lineCount} lines, minimum ${contextLineResult.minRequired})`,
        '',
        '🔴 WHAT WENT WRONG:',
        `   project-context has only ${contextLineResult.lineCount} lines but needs at least ${contextLineResult.minRequired}.`,
        '',
        '🟢 HOW TO FIX:',
        '   project-context must include these sections:',
        '   - YAML frontmatter (name: project-context)',
        '   - # Project Context: ProjectName',
        '   - ## When to Use This Skill',
        '   - ## Architecture Deep Dive',
        '   - ## Request Lifecycle (for backends)',
        '   - ## Authentication & Authorization (if applicable)',
        '   - ## Critical Workflows (with ALL files to modify)',
        '   - ## Gotchas & Non-Obvious Patterns (with code examples)',
        '   - ## Testing Strategy (with example code)',
        '   - ## Multi-File Change Checklists',
      );
    } else {
      errors.push(
        `PROJECT-CONTEXT CONTENT TOO LONG (${contextLineResult.lineCount} lines, maximum ${contextLineResult.maxAllowed})`,
        '',
        '🔴 WHAT WENT WRONG:',
        `   project-context has ${contextLineResult.lineCount} lines but maximum is ${contextLineResult.maxAllowed}.`,
        '',
        '🟢 HOW TO FIX:',
        '   Focus on what is HARD TO DISCOVER. Remove:',
        '   - Full endpoint lists (AI can grep these)',
        '   - Entity field listings (AI can read the code)',
        '   - Module directory inventories (AI can ls)',
        '   - Environment variable tables (AI can read .env.example)',
        '   Keep only: non-obvious patterns, multi-step flows, gotchas',
      );
    }
  }

  // ========================================================================
  // FINAL RESULT
  // ========================================================================
  if (errors.length > 0) {
    return {
      valid: false,
      errors: formatErrorsForAgent(errors),
      warnings,
      extracted,
    };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    extracted,
  };
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect if output is JSON format instead of markdown
 */
function detectJSONFormat(output: string): string | null {
  // Quick check: starts with { and contains agent_name
  if (output.startsWith('{') && output.includes('"agent_name"')) {
    return [
      'OUTPUT IS JSON FORMAT - MUST BE MARKDOWN',
      '',
      '🔴 WHAT WENT WRONG:',
      '   You output JSON like: { "agent_name": "...", "findings": {...} }',
      '   This is the WRONG format for the synthesis agent.',
      '',
      '🟢 HOW TO FIX:',
      '   Output RAW MARKDOWN TEXT, not JSON.',
      '   Your response should START with: # CLAUDE.md Content',
      '',
      '❌ WRONG:',
      '   {',
      '     "agent_name": "architect-synthesizer",',
      '     "findings": { "claude_md": "..." }',
      '   }',
      '',
      '✅ CORRECT:',
      '   # CLAUDE.md Content',
      '   ',
      '   # ProjectName',
      '   ',
      '   ## Tech Stack',
      '   ...',
    ].join('\n');
  }

  // Check for JSON object anywhere in output (handles preamble + JSON)
  const jsonObjectMatch = output.match(/\{[^{}]*"agent_name"[^{}]*\}/s);
  if (jsonObjectMatch) {
    return [
      'OUTPUT CONTAINS JSON FORMAT - MUST BE MARKDOWN',
      '',
      '🔴 WHAT WENT WRONG:',
      '   Your output includes a JSON object.',
      '   This is the WRONG format for the synthesis agent.',
      '',
      '🟢 HOW TO FIX:',
      '   Output RAW MARKDOWN TEXT only, not JSON.',
      '   Your response should START with: # CLAUDE.md Content',
      '',
      '❌ WRONG:',
      '   Let me create the output:',
      '   {',
      '     "agent_name": "architect-synthesizer",',
      '     "findings": { ... }',
      '   }',
      '',
      '✅ CORRECT:',
      '   # CLAUDE.md Content',
      '   ',
      '   # ProjectName',
      '   ',
      '   ## Tech Stack',
      '   ...',
    ].join('\n');
  }

  // Additional check: valid JSON object
  if (output.startsWith('{') && output.endsWith('}')) {
    try {
      const parsed = JSON.parse(output);
      if (typeof parsed === 'object' && parsed !== null) {
        return [
          'OUTPUT APPEARS TO BE JSON - MUST BE MARKDOWN',
          '',
          '🔴 WHAT WENT WRONG:',
          '   Your output is a valid JSON object, but synthesis requires MARKDOWN.',
          '',
          '🟢 HOW TO FIX:',
          '   Output the markdown content directly, starting with "# CLAUDE.md Content"',
        ].join('\n');
      }
    } catch {
      // Not valid JSON, that's fine
    }
  }

  return null;
}

/**
 * Detect if output starts with preamble text instead of section header
 */
function detectPreambleText(output: string): string | null {
  const firstLine = output.split('\n')[0].trim();

  // Check if first line matches preamble patterns
  for (const pattern of PREAMBLE_PATTERNS) {
    if (pattern.test(firstLine)) {
      return [
        'OUTPUT STARTS WITH PREAMBLE - MUST START WITH "# CLAUDE.md Content"',
        '',
        '🔴 WHAT WENT WRONG:',
        `   Your response begins with: "${firstLine.substring(0, 60)}..."`,
        '   This is descriptive text, not the required content.',
        '',
        '🟢 HOW TO FIX:',
        '   - Do NOT explain what you are doing',
        '   - Do NOT say "Here is..." or "Let me..."',
        '   - Do NOT describe your process',
        '   - START DIRECTLY with: # CLAUDE.md Content',
        '',
        '❌ WRONG (examples):',
        '   "Let me output the markdown content..."',
        '   "Here is the generated CLAUDE.md..."',
        '   "Based on my analysis, I will produce..."',
        '',
        '✅ CORRECT:',
        '   # CLAUDE.md Content',
        '   ',
        '   # ProjectName',
        '   ...',
      ].join('\n');
    }
  }

  // Check if first non-empty line is NOT the header
  const firstNonEmpty = output.split('\n').find(line => line.trim().length > 0)?.trim();
  if (firstNonEmpty && firstNonEmpty !== SECTION_MARKERS.CLAUDE_MD_HEADER) {
    // Only warn if it's clearly not close to the header
    if (!firstNonEmpty.includes('CLAUDE') && !firstNonEmpty.startsWith('#')) {
      return [
        'OUTPUT DOES NOT START WITH CORRECT HEADER',
        '',
        '🔴 WHAT WENT WRONG:',
        `   First line is: "${firstNonEmpty.substring(0, 60)}..."`,
        `   Expected: "# CLAUDE.md Content"`,
        '',
        '🟢 HOW TO FIX:',
        '   Your response must BEGIN with EXACTLY:',
        '   # CLAUDE.md Content',
      ].join('\n');
    }
  }

  return null;
}

/**
 * Detect if agent mentioned using Write tool
 */
function detectWriteToolUsage(output: string): string | null {
  const lowerOutput = output.toLowerCase();

  for (const pattern of WRITE_TOOL_PATTERNS) {
    if (pattern.test(lowerOutput)) {
      return [
        'OUTPUT REFERENCES FILE WRITING - DO NOT USE WRITE TOOL',
        '',
        '🔴 WHAT WENT WRONG:',
        '   You mentioned writing files or using the Write tool.',
        '   The synthesis agent must NOT write files directly.',
        '',
        '🟢 HOW TO FIX:',
        '   - Do NOT use the Write tool',
        '   - Do NOT use bash commands to create files',
        '   - Do NOT say "I wrote..." or "I created file..."',
        '   - ONLY output the markdown content in your response',
        '   - Phase 4 will handle writing the files',
      ].join('\n');
    }
  }

  return null;
}

// ============================================================================
// CONTENT VALIDATION
// ============================================================================

/**
 * Validate CLAUDE.md content structure and quality
 */
function validateClaudeMdContent(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split('\n');

  // Check for project name heading
  const hasProjectHeading = lines.some(line => /^# [A-Z]/.test(line.trim()));
  if (!hasProjectHeading) {
    errors.push(
      'CLAUDE.md MISSING PROJECT NAME HEADING',
      '',
      '🔴 WHAT WENT WRONG:',
      '   CLAUDE.md should start with "# ProjectName" (level-1 heading).',
      '',
      '🟢 HOW TO FIX:',
      '   Add a project name heading as the first content line:',
      '   # MyProject',
    );
  }

  // Check for required sections (## headings)
  const requiredSections = ['Tech Stack', 'File Placement', 'Essential Commands'];
  const sectionHeadings = lines
    .filter(line => /^## /.test(line.trim()))
    .map(line => line.trim().replace(/^## /, ''));

  const missingSections = requiredSections.filter(
    section => !sectionHeadings.some(h => h.toLowerCase().includes(section.toLowerCase()))
  );

  if (missingSections.length > 0) {
    errors.push(
      `CLAUDE.md MISSING REQUIRED SECTIONS: ${missingSections.join(', ')}`,
      '',
      '🔴 WHAT WENT WRONG:',
      '   CLAUDE.md must include these sections:',
      '   - ## Tech Stack',
      '   - ## File Placement Guide',
      '   - ## Essential Commands',
      '',
      '🟢 HOW TO FIX:',
      '   Add the missing sections with appropriate content.',
    );
  }

  // Check for table format (| pipe characters)
  const hasTable = lines.some(line => line.includes('|') && line.trim().startsWith('|'));
  if (!hasTable) {
    errors.push(
      'CLAUDE.md MISSING TABLE FORMAT',
      '',
      '🔴 WHAT WENT WRONG:',
      '   CLAUDE.md should use table format for File Placement Guide and Commands.',
      '',
      '🟢 HOW TO FIX:',
      '   Use markdown table format:',
      '   | File Type | Location | Example |',
      '   |-----------|----------|---------|',
      '   | Controller | src/controllers/ | user.controller.ts |',
    );
  }

  // Check for bullet lists
  const hasBulletList = lines.some(line => /^[-*] /.test(line.trim()));
  if (!hasBulletList) {
    errors.push(
      'CLAUDE.md MISSING BULLET LISTS',
      '',
      '🔴 WHAT WENT WRONG:',
      '   CLAUDE.md should use bullet lists for Tech Stack.',
      '',
      '🟢 HOW TO FIX:',
      '   Use bullet format for Tech Stack:',
      '   - TypeScript 5.3',
      '   - Node.js 20.x',
      '   - PostgreSQL 15',
    );
  }

  return errors;
}

/**
 * Validate project-context content structure and quality
 */
function validateProjectContextContent(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split('\n');

  // Check for YAML frontmatter
  const frontmatterStart = content.indexOf('---');
  if (frontmatterStart === -1) {
    errors.push(
      'PROJECT-CONTEXT MISSING YAML FRONTMATTER',
      '',
      '🔴 WHAT WENT WRONG:',
      '   project-context must start with YAML frontmatter.',
      '',
      '🟢 HOW TO FIX:',
      '   Start project-context content with:',
      '   ---',
      '   name: project-context',
      '   description: Deep architectural knowledge for ProjectName',
      '   user-invokable: true',
      '   ---',
    );
  } else {
    // Check frontmatter content
    const frontmatterEnd = content.indexOf('---', frontmatterStart + 3);
    if (frontmatterEnd === -1) {
      errors.push(
        'PROJECT-CONTEXT FRONTMATTER NOT CLOSED',
        '',
        '🔴 WHAT WENT WRONG:',
        '   YAML frontmatter must be enclosed by --- markers.',
        '',
        '🟢 HOW TO FIX:',
        '   Ensure frontmatter has closing ---:',
        '   ---',
        '   name: project-context',
        '   ---',
      );
    } else {
      const frontmatter = content.substring(frontmatterStart + 3, frontmatterEnd);

      // Check for required name field
      if (!frontmatter.includes('name:')) {
        errors.push(
          'PROJECT-CONTEXT FRONTMATTER MISSING "name:" FIELD',
          '',
          '🔴 WHAT WENT WRONG:',
          '   YAML frontmatter must include "name: project-context"',
          '',
          '🟢 HOW TO FIX:',
          '   ---',
          '   name: project-context',
          '   description: Deep architectural knowledge',
          '   ---',
        );
      } else if (!frontmatter.includes('project-context')) {
        errors.push(
          'PROJECT-CONTEXT FRONTMATTER HAS WRONG NAME',
          '',
          '🔴 WHAT WENT WRONG:',
          '   The "name:" field must be "project-context" exactly.',
          '',
          '🟢 HOW TO FIX:',
          '   ---',
          '   name: project-context  # <-- EXACT value required',
          '   ---',
        );
      }
    }
  }

  // Check for main heading
  const hasMainHeading = lines.some(line => /^# Project Context/.test(line.trim()));
  if (!hasMainHeading) {
    errors.push(
      'PROJECT-CONTEXT MISSING MAIN HEADING',
      '',
      '🔴 WHAT WENT WRONG:',
      '   project-context should have "# Project Context: ProjectName" heading.',
      '',
      '🟢 HOW TO FIX:',
      '   After frontmatter, add:',
      '   # Project Context: MyProjectName',
    );
  }

  // Check for code examples (required for gotchas)
  const hasCodeBlock = content.includes('```');
  if (!hasCodeBlock) {
    errors.push(
      'PROJECT-CONTEXT MISSING CODE EXAMPLES',
      '',
      '🔴 WHAT WENT WRONG:',
      '   project-context must include code examples for gotchas and patterns.',
      '',
      '🟢 HOW TO FIX:',
      '   Include code examples showing WRONG vs CORRECT approaches:',
      '   ```typescript',
      '   // Wrong approach',
      '   async function bad() { ... }',
      '   ',
      '   // Correct approach',
      '   async function good() { ... }',
      '   ```',
    );
  }

  return errors;
}

// ============================================================================
// LINE COUNT VALIDATION
// ============================================================================

function validateLineCount(
  content: string,
  minRequired: number,
  maxAllowed: number,
  _sectionName: string
): LineCountResult {
  const lineCount = content.split('\n').length;

  return {
    valid: lineCount >= minRequired && lineCount <= maxAllowed,
    lineCount,
    minRequired,
    maxAllowed,
  };
}

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract synthesis markdown sections from agent output.
 * Robust version that handles preamble and whitespace.
 */
function extractSynthesisMarkdownRobust(output: string): {
  claudemd: string;
  projectContext: string;
} | null {
  // Find "# CLAUDE.md Content" anywhere in the output (skip preamble)
  const claudeHeaderIndex = output.indexOf(SECTION_MARKERS.CLAUDE_MD_HEADER);
  if (claudeHeaderIndex === -1) {
    return null;
  }

  // Find "---" separator after CLAUDE.md content
  // Must be on its own line: \n---\n
  const afterClaudeHeader = output.slice(claudeHeaderIndex);
  const separatorMatch = afterClaudeHeader.match(/\n---\s*\n/);
  if (!separatorMatch || separatorMatch.index === undefined) {
    return null;
  }

  // Find "# project-context/SKILL.md Content" after separator
  const contextHeaderIndex = output.indexOf(
    SECTION_MARKERS.PROJECT_CONTEXT_HEADER,
    claudeHeaderIndex + separatorMatch.index
  );
  if (contextHeaderIndex === -1) {
    return null;
  }

  // Extract CLAUDE.md content (from header to separator)
  const claudeStartIndex = claudeHeaderIndex + SECTION_MARKERS.CLAUDE_MD_HEADER.length;
  const claudeEndIndex = claudeHeaderIndex + separatorMatch.index;
  const claudemd = output.slice(claudeStartIndex, claudeEndIndex).trim();

  // Extract project-context content (from header to end)
  const contextStartIndex = contextHeaderIndex + SECTION_MARKERS.PROJECT_CONTEXT_HEADER.length;
  const projectContext = output.slice(contextStartIndex).trim();

  return { claudemd, projectContext };
}

// ============================================================================
// ERROR FORMATTING
// ============================================================================

/**
 * Format errors into a clear, actionable message for the agent
 */
function formatErrorsForAgent(errors: string[]): string[] {
  const errorCount = errors.filter(e =>
    e.length > 0 &&
    !e.startsWith('🔴') &&
    !e.startsWith('🟢') &&
    !e.startsWith('❌') &&
    !e.startsWith('✅') &&
    !e.startsWith('🟡') &&
    !e.startsWith('📋') &&
    !e.startsWith(' ')
  ).length;

  const header = [
    '═══════════════════════════════════════════════════════════════',
    '                    SYNTHESIS VALIDATION FAILED',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Found ${errorCount} error(s) in your output.`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                         ERRORS',
    '───────────────────────────────────────────────────────────────',
    '',
  ];

  const footer = [
    '',
    '───────────────────────────────────────────────────────────────',
    '                    COMPLETE REQUIRED FORMAT',
    '───────────────────────────────────────────────────────────────',
    '',
    'Your ENTIRE response must be EXACTLY this structure:',
    '',
    '# CLAUDE.md Content',
    '',
    '# ProjectName',
    '',
    '## Tech Stack',
    '- TypeScript 5.3',
    '- Node.js 20.x',
    '...',
    '',
    '## File Placement Guide',
    '| File Type | Location | Example |',
    '|-----------|----------|---------|',
    '| Controller | src/controllers/ | user.controller.ts |',
    '...',
    '',
    '## Essential Commands',
    '| Task | Command |',
    '|------|---------|',
    '| Dev | npm run dev |',
    '...',
    '',
    '---',
    '',
    '# project-context/SKILL.md Content',
    '',
    '---',
    'name: project-context',
    'description: Deep architectural knowledge',
    'user-invokable: true',
    '---',
    '',
    '# Project Context: ProjectName',
    '',
    '## When to Use This Skill',
    '- When implementing features',
    '...',
    '',
    '## Architecture Deep Dive',
    '...',
    '',
    '## Gotchas & Non-Obvious Patterns',
    '```typescript',
    '// Wrong approach',
    '...',
    '// Correct approach',
    '...',
    '```',
    '',
    '───────────────────────────────────────────────────────────────',
    '          ⚠️  START YOUR RESPONSE WITH "# CLAUDE.md Content"  ⚠️',
    '───────────────────────────────────────────────────────────────',
  ];

  return [...header, ...errors, ...footer];
}

// ============================================================================
// EXPORTS FOR USE IN BOTH LOCATIONS
// ============================================================================

// Re-export the extraction function
export { extractSynthesisMarkdownRobust as extractSynthesisMarkdown };

// Export types
export type { LineCountResult };
