#!/usr/bin/env node

/**
 * Gap Detector with Deep Codebase Inference
 *
 * Intelligently detects gaps in tickets and attempts to fill them by:
 * 1. Searching project context (CLAUDE.md, project-context skill)
 * 2. Deep codebase analysis (patterns, similar implementations)
 * 3. Analyzing existing tickets for precedents
 *
 * Only asks engineers when gaps cannot be inferred from code/context.
 *
 * @module gap-detector
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Detect and fill gaps in ticket using deep codebase inference
 *
 * @param {Object} ticket - Canonical ticket from any source
 * @param {Object} validation - Validation result from ticket-validator
 * @param {string} projectRoot - Path to project root
 * @returns {Promise<Object>} Gap analysis with inferred values and unresolved gaps
 */
async function detectAndFillGaps(ticket, validation, projectRoot) {
  console.log('\n🔍 Starting intelligent gap detection...');
  console.log(`   Project root: ${projectRoot}`);
  console.log(`   Total gaps identified: ${validation.gaps.length}\n`);

  const inferredValues = {};
  const unresolvedGaps = [];
  const questionsNeeded = [];
  const inferenceLog = [];

  // Process each gap
  for (const gap of validation.gaps) {
    console.log(`\n📌 Processing gap: ${gap.field}`);
    console.log(`   Category: ${gap.category}`);
    console.log(`   Priority: ${gap.priority}`);

    try {
      const inferred = await attemptInference(gap, ticket, projectRoot, inferenceLog);

      if (inferred.success) {
        inferredValues[gap.field] = inferred.value;
        console.log(`   ✅ Inferred from ${inferred.source}`);
        console.log(`   Value: ${JSON.stringify(inferred.value).substring(0, 100)}...`);
      } else {
        unresolvedGaps.push(gap);
        const question = generateQuestion(gap, inferred.attemptedSources, inferred.searchDetails);
        questionsNeeded.push(question);
        console.log(`   ❌ Could not infer - will ask engineer`);
        console.log(`   Searched: ${inferred.attemptedSources.join(', ')}`);
      }
    } catch (error) {
      console.error(`   ⚠️  Error during inference: ${error.message}`);
      unresolvedGaps.push(gap);
      questionsNeeded.push(generateQuestion(gap, [], null));
    }
  }

  const result = {
    originalGaps: validation.gaps,
    inferredValues,
    unresolvedGaps,
    questionsNeeded,
    inferenceLog,
    canProceedAutonomously: unresolvedGaps.length === 0,
    summary: {
      totalGaps: validation.gaps.length,
      inferred: Object.keys(inferredValues).length,
      unresolved: unresolvedGaps.length,
      inferenceRate: Math.round((Object.keys(inferredValues).length / validation.gaps.length) * 100)
    }
  };

  console.log('\n' + '='.repeat(60));
  console.log('📊 GAP DETECTION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total gaps: ${result.summary.totalGaps}`);
  console.log(`Inferred: ${result.summary.inferred} (${result.summary.inferenceRate}%)`);
  console.log(`Unresolved: ${result.summary.unresolved}`);
  console.log(`Autonomous: ${result.canProceedAutonomously ? '✅ Yes' : '❌ No - needs engineer input'}`);
  console.log('='.repeat(60) + '\n');

  return result;
}

/**
 * Attempt to infer gap value from multiple sources
 */
async function attemptInference(gap, ticket, projectRoot, inferenceLog) {
  const sources = [];
  const searchDetails = {};

  // Strategy 1: Search project context (CLAUDE.md, project-context skill)
  try {
    const contextResult = await searchProjectContext(gap, ticket, projectRoot);
    sources.push('project-context');
    searchDetails.projectContext = contextResult.details;

    if (contextResult.found) {
      inferenceLog.push({
        gap: gap.field,
        source: 'project-context',
        method: contextResult.method,
        value: contextResult.value
      });
      return {
        success: true,
        value: contextResult.value,
        source: `project-context (${contextResult.method})`,
        attemptedSources: sources
      };
    }
  } catch (error) {
    console.log(`     ⚠️  Project context search failed: ${error.message}`);
  }

  // Strategy 2: Deep codebase pattern search
  try {
    const codebaseResult = await searchCodebasePatterns(gap, ticket, projectRoot);
    sources.push('codebase-patterns');
    searchDetails.codebasePatterns = codebaseResult.details;

    if (codebaseResult.found) {
      inferenceLog.push({
        gap: gap.field,
        source: 'codebase',
        method: codebaseResult.method,
        file: codebaseResult.file,
        value: codebaseResult.value
      });
      return {
        success: true,
        value: codebaseResult.value,
        source: `codebase: ${codebaseResult.file}`,
        attemptedSources: sources
      };
    }
  } catch (error) {
    console.log(`     ⚠️  Codebase search failed: ${error.message}`);
  }

  // Strategy 3: Find similar existing implementations
  try {
    const similarResult = await findSimilarImplementation(gap, ticket, projectRoot);
    sources.push('similar-implementation');
    searchDetails.similarImplementation = similarResult.details;

    if (similarResult.found) {
      inferenceLog.push({
        gap: gap.field,
        source: 'similar-implementation',
        similarTo: similarResult.similarTo,
        value: similarResult.value
      });
      return {
        success: true,
        value: similarResult.value,
        source: `similar: ${similarResult.similarTo}`,
        attemptedSources: sources
      };
    }
  } catch (error) {
    console.log(`     ⚠️  Similar implementation search failed: ${error.message}`);
  }

  // Strategy 4: Analyze existing tickets (if .claude/tickets/ exists)
  try {
    const ticketResult = await analyzeExistingTickets(gap, ticket, projectRoot);
    sources.push('existing-tickets');
    searchDetails.existingTickets = ticketResult.details;

    if (ticketResult.found) {
      inferenceLog.push({
        gap: gap.field,
        source: 'existing-ticket',
        ticketId: ticketResult.ticketId,
        value: ticketResult.value
      });
      return {
        success: true,
        value: ticketResult.value,
        source: `ticket: ${ticketResult.ticketId}`,
        attemptedSources: sources
      };
    }
  } catch (error) {
    console.log(`     ⚠️  Existing ticket analysis failed: ${error.message}`);
  }

  return {
    success: false,
    attemptedSources: sources,
    searchDetails
  };
}

/**
 * Search project context (CLAUDE.md, project-context skill)
 */
async function searchProjectContext(gap, ticket, projectRoot) {
  const details = { searched: [], found: false };

  // Check CLAUDE.md
  const claudeMdPath = path.join(projectRoot, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    details.searched.push('CLAUDE.md');

    const result = extractFromContext(content, gap, ticket);
    if (result.found) {
      details.found = true;
      details.extractedFrom = 'CLAUDE.md';
      details.matchedPattern = result.pattern;
      return { found: true, value: result.value, method: result.method, details };
    }
  }

  // Check project-context skill
  const projectContextPath = path.join(projectRoot, '.claude', 'skills', 'project-context', 'SKILL.md');
  if (fs.existsSync(projectContextPath)) {
    const content = fs.readFileSync(projectContextPath, 'utf-8');
    details.searched.push('project-context/SKILL.md');

    const result = extractFromContext(content, gap, ticket);
    if (result.found) {
      details.found = true;
      details.extractedFrom = 'project-context/SKILL.md';
      details.matchedPattern = result.pattern;
      return { found: true, value: result.value, method: result.method, details };
    }
  }

  return { found: false, details };
}

/**
 * Extract value from context based on gap category
 */
function extractFromContext(content, gap, ticket) {
  const category = gap.category;

  switch (category) {
    case 'user_story':
      return extractUserStoryFromContext(content, gap.field);

    case 'stakeholders':
      return extractStakeholdersFromContext(content);

    case 'success_criteria':
      return extractSuccessCriteriaFromContext(content, ticket);

    case 'technical_context':
      return extractTechnicalContextFromContext(content, gap.field);

    case 'definition_of_done':
      return extractDefinitionOfDoneFromContext(content, gap.field);

    default:
      return { found: false };
  }
}

/**
 * Extract user story components from context
 */
function extractUserStoryFromContext(content, field) {
  // Look for common user patterns
  if (field === 'userStory.role') {
    const rolePatterns = [
      /(?:primary|main|typical)\s+users?[:\s]+([^\n]+)/i,
      /(?:user|actor)\s+roles?[:\s]+([^\n]+)/i,
      /(?:personas?|stakeholders?)[:\s]+([^\n]+)/i
    ];

    for (const pattern of rolePatterns) {
      const match = content.match(pattern);
      if (match) {
        return { found: true, value: match[1].trim(), method: 'role-pattern', pattern: pattern.toString() };
      }
    }
  }

  return { found: false };
}

/**
 * Extract stakeholders from context
 */
function extractStakeholdersFromContext(content) {
  // Look for team/stakeholder sections
  const stakeholderPatterns = [
    /(?:team|stakeholders?)[:\s]*\n([\s\S]{0,500}?)\n\n/i,
    /(?:product owner|tech lead|pm)[:\s]+([^\n]+)/gi
  ];

  const stakeholders = [];

  // Try to find stakeholder mentions
  const mentions = content.match(/(?:product owner|tech lead|pm|manager|owner)[:\s]+([^\n]+)/gi);
  if (mentions && mentions.length > 0) {
    mentions.forEach(mention => {
      const roleMatch = mention.match(/^([^:]+):\s*(.+)/);
      if (roleMatch) {
        stakeholders.push({
          role: roleMatch[1].trim(),
          name: roleMatch[2].trim(),
          responsibility: 'As documented in project context'
        });
      }
    });

    if (stakeholders.length > 0) {
      return { found: true, value: stakeholders, method: 'stakeholder-mentions' };
    }
  }

  return { found: false };
}

/**
 * Extract success criteria from context (project quality standards)
 */
function extractSuccessCriteriaFromContext(content, ticket) {
  // Infer from quality standards if technical ticket
  if (ticket.title.toLowerCase().includes('test') ||
      ticket.title.toLowerCase().includes('quality') ||
      ticket.title.toLowerCase().includes('performance')) {

    const qualityPatterns = [
      /(?:test coverage|coverage)[:\s]+([0-9]+%)/i,
      /(?:response time|latency)[:\s]+([^\n]+)/i,
      /(?:uptime|availability)[:\s]+([^\n]+)/i
    ];

    const criteria = [];
    for (const pattern of qualityPatterns) {
      const match = content.match(pattern);
      if (match) {
        criteria.push(match[0].trim());
      }
    }

    if (criteria.length > 0) {
      return { found: true, value: criteria, method: 'quality-standards' };
    }
  }

  return { found: false };
}

/**
 * Extract technical context from CLAUDE.md
 */
function extractTechnicalContextFromContext(content, field) {
  if (field === 'technicalContext.proposedChanges') {
    // Look for architectural patterns section
    const archPatterns = content.match(/(?:architecture|patterns|structure)[:\s]*\n([\s\S]{0,1000}?)\n\n/i);
    if (archPatterns) {
      const lines = archPatterns[1].split('\n').filter(l => l.trim().startsWith('-'));
      if (lines.length > 0) {
        const changes = lines.map(l => l.trim().substring(1).trim());
        return { found: true, value: changes, method: 'architecture-patterns' };
      }
    }
  }

  return { found: false };
}

/**
 * Extract definition of done from context
 */
function extractDefinitionOfDoneFromContext(content, field) {
  if (field === 'definitionOfDone.testing') {
    // Look for testing standards
    const testingSection = content.match(/(?:testing|quality|coverage)[:\s]*\n([\s\S]{0,500}?)\n\n/i);
    if (testingSection) {
      const requirements = [];

      // Check for coverage requirements
      const coverageMatch = testingSection[1].match(/([0-9]+%)\s+coverage/i);
      if (coverageMatch) {
        requirements.push(`Unit test coverage >= ${coverageMatch[1]}`);
      }

      // Check for test types
      if (testingSection[1].toLowerCase().includes('integration')) {
        requirements.push('Integration tests for all endpoints');
      }
      if (testingSection[1].toLowerCase().includes('e2e') || testingSection[1].toLowerCase().includes('end-to-end')) {
        requirements.push('E2E tests for critical user flows');
      }

      if (requirements.length > 0) {
        return { found: true, value: requirements, method: 'testing-standards' };
      }
    }
  }

  return { found: false };
}

/**
 * Search codebase for patterns
 */
async function searchCodebasePatterns(gap, ticket, projectRoot) {
  const details = { searched: [], found: false };

  // Build search keywords based on gap category
  const searchTerms = buildSearchTerms(gap, ticket);
  details.searchTerms = searchTerms;

  for (const term of searchTerms) {
    try {
      // Use grep to search codebase
      const { stdout } = await execAsync(
        `grep -r -i "${term}" --include="*.{ts,js,py,go,java}" ${projectRoot} 2>/dev/null | head -20`,
        { maxBuffer: 1024 * 1024 }
      );

      if (stdout) {
        details.searched.push(term);
        const result = analyzeGrepResults(stdout, gap, ticket);

        if (result.found) {
          details.found = true;
          details.matchedTerm = term;
          details.matchedFile = result.file;
          return { found: true, value: result.value, method: 'grep-search', file: result.file, details };
        }
      }
    } catch (error) {
      // No matches or error - continue
    }
  }

  return { found: false, details };
}

/**
 * Build search terms based on gap category
 */
function buildSearchTerms(gap, ticket) {
  const terms = [];
  const titleWords = ticket.title.toLowerCase().split(' ').filter(w => w.length > 3);

  switch (gap.category) {
    case 'user_story':
      if (gap.field === 'userStory.role') {
        terms.push(...titleWords, 'user', 'role', 'actor', 'persona');
      }
      break;

    case 'technical_context':
      terms.push(...titleWords, 'implementation', 'architecture', 'design');
      break;

    case 'acceptance_criteria':
      terms.push(...titleWords, 'test', 'scenario', 'validation');
      break;

    case 'definition_of_done':
      terms.push('coverage', 'test', 'quality', 'review');
      break;
  }

  return [...new Set(terms)].slice(0, 5); // Limit to 5 most relevant
}

/**
 * Analyze grep results to extract meaningful values
 */
function analyzeGrepResults(grepOutput, gap, ticket) {
  const lines = grepOutput.split('\n').filter(l => l.trim());

  if (lines.length === 0) {
    return { found: false };
  }

  // Extract file path from first match
  const firstLine = lines[0];
  const filePath = firstLine.split(':')[0];

  // For technical context, extract architectural patterns
  if (gap.category === 'technical_context') {
    const patterns = lines
      .map(l => l.split(':').slice(1).join(':').trim())
      .filter(l => l.length > 0)
      .slice(0, 3);

    if (patterns.length > 0) {
      return {
        found: true,
        value: patterns,
        file: filePath
      };
    }
  }

  return { found: false };
}

/**
 * Find similar implementations in codebase
 */
async function findSimilarImplementation(gap, ticket, projectRoot) {
  const details = { searched: [], found: false };

  // Look for similar feature names in file names
  const titleWords = ticket.title.toLowerCase().split(' ').filter(w => w.length > 4);

  for (const word of titleWords.slice(0, 3)) {
    try {
      const { stdout } = await execAsync(
        `find ${projectRoot} -type f -iname "*${word}*" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -10`,
        { maxBuffer: 1024 * 1024 }
      );

      if (stdout) {
        const files = stdout.split('\n').filter(f => f.trim());
        details.searched.push(word);

        if (files.length > 0) {
          details.found = true;
          details.similarFiles = files;

          // For now, return indication that similar files exist
          return {
            found: true,
            value: `Similar implementation pattern found in ${files[0]}`,
            similarTo: files[0],
            details
          };
        }
      }
    } catch (error) {
      // No matches - continue
    }
  }

  return { found: false, details };
}

/**
 * Analyze existing tickets for precedents
 */
async function analyzeExistingTickets(gap, ticket, projectRoot) {
  const details = { searched: [], found: false };
  const ticketsDir = path.join(projectRoot, '.claude', 'tickets');

  if (!fs.existsSync(ticketsDir)) {
    details.noTicketsDir = true;
    return { found: false, details };
  }

  try {
    const files = fs.readdirSync(ticketsDir).filter(f => f.endsWith('.md'));
    details.searched = files;

    // Search for similar tickets
    for (const file of files) {
      const content = fs.readFileSync(path.join(ticketsDir, file), 'utf-8');

      // Check if this ticket is similar (has overlapping keywords)
      const titleWords = ticket.title.toLowerCase().split(' ');
      const fileTitle = content.split('\n')[0].toLowerCase();

      const overlap = titleWords.filter(w => w.length > 4 && fileTitle.includes(w));

      if (overlap.length >= 2) {
        // Extract relevant section from similar ticket
        const result = extractFromContext(content, gap, ticket);

        if (result.found) {
          details.found = true;
          details.similarTicket = file;
          return {
            found: true,
            value: result.value,
            ticketId: file.replace('.md', ''),
            details
          };
        }
      }
    }
  } catch (error) {
    details.error = error.message;
  }

  return { found: false, details };
}

/**
 * Generate question for unresolved gap
 */
function generateQuestion(gap, attemptedSources, searchDetails) {
  const context = attemptedSources.length > 0
    ? `\n\n(I searched: ${attemptedSources.join(', ')}, but couldn't determine this)`
    : '';

  const templates = {
    'userStory.role': {
      question: `Who is the primary user for this feature?${context}`,
      hint: 'Example: admin, project manager, end user, customer',
      required: true
    },
    'userStory.goal': {
      question: `What specific capability does the user need?${context}`,
      hint: 'Example: export reports, reset password, view analytics',
      required: true
    },
    'userStory.benefit': {
      question: `What business value or outcome does this provide?${context}`,
      hint: 'Example: improve compliance, reduce support tickets, increase revenue',
      required: true
    },
    'stakeholders': {
      question: `Who requested this feature and who will approve it?${context}`,
      hint: 'Example: Product Owner: Jane Doe, Tech Lead: John Smith',
      required: true
    },
    'successCriteria': {
      question: `How will we measure success? (specific metrics)${context}`,
      hint: 'Example: Users can complete task in <5 seconds, 95% success rate',
      required: true
    },
    'acceptanceCriteria': {
      question: `What are the key scenarios to test? (happy path, edge cases, errors)${context}`,
      hint: 'Example: User successfully exports data, handles empty dataset, shows error for invalid input',
      required: true
    },
    'technicalContext.proposedChanges': {
      question: `What technical changes are needed?${context}`,
      hint: 'Example: Add new API endpoint, create React component, update database schema',
      required: true
    },
    'definitionOfDone.testing': {
      question: `What testing is required? (unit, integration, E2E coverage)${context}`,
      hint: 'Example: Unit coverage >= 80%, E2E tests for all user flows',
      required: true
    }
  };

  const template = templates[gap.field] || {
    question: `Please clarify: ${gap.message}${context}`,
    hint: gap.example || 'Provide specific details',
    required: gap.priority === 'high'
  };

  return {
    field: gap.field,
    category: gap.category,
    question: template.question,
    hint: template.hint,
    required: template.required,
    priority: gap.priority,
    attemptedSources,
    searchDetails
  };
}

module.exports = {
  detectAndFillGaps
};

// CLI usage
if (require.main === module) {
  const canonicalPath = process.argv[2];
  const projectRoot = process.argv[3] || process.cwd();

  if (!canonicalPath) {
    console.error('Usage: node gap-detector.js <canonical-json-path> [project-root]');
    process.exit(1);
  }

  (async () => {
    try {
      const { validateTicket } = require('./validators/ticket-validator');
      const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));

      console.log('Validating ticket...');
      const validation = validateTicket(canonical);

      console.log('Starting gap detection...');
      const result = await detectAndFillGaps(canonical, validation, projectRoot);

      if (result.questionsNeeded.length > 0) {
        console.log('\n📝 QUESTIONS FOR ENGINEER:\n');
        result.questionsNeeded.forEach((q, i) => {
          console.log(`${i + 1}. ${q.question}`);
          console.log(`   Hint: ${q.hint}`);
          console.log(`   Priority: ${q.priority.toUpperCase()}\n`);
        });
      }

      process.exit(result.canProceedAutonomously ? 0 : 1);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}
