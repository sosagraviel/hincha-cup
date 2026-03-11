#!/usr/bin/env node

/**
 * Markdown Parser
 *
 * Parses SDD markdown files into canonical ticket format.
 * Extracts structured sections and validates completeness.
 *
 * @module markdown-parser
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse SDD markdown file into canonical format
 *
 * @param {string} filePath - Path to markdown file
 * @returns {Object} Canonical ticket object
 */
function parseMarkdownTicket(filePath) {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Markdown file not found: ${filePath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const sections = extractMarkdownSections(content);

  // Extract ticket ID from filename or title
  const ticketId = extractTicketId(filePath, sections.title);

  // Parse metadata from bottom of file
  const metadata = extractMetadata(content);

  return {
    id: ticketId,
    source: 'markdown',
    sourcePath: resolvedPath,
    title: extractTitle(sections.title || ''),
    userStory: parseUserStorySection(sections['User Story'] || ''),
    stakeholders: parseStakeholdersSection(sections['Stakeholders'] || ''),
    successCriteria: parseListSection(sections['Success Criteria'] || ''),
    metrics: extractMetrics(sections['Success Criteria'] || ''),
    acceptanceCriteria: parseBddSection(sections['Acceptance Criteria'] || ''),
    technicalContext: parseTechnicalSection(sections['Technical Context'] || ''),
    outOfScope: parseListSection(sections['Out of Scope'] || ''),
    futureConsiderations: extractFutureConsiderations(sections['Out of Scope'] || ''),
    edgeCases: parseEdgeCasesSection(sections['Edge Cases Error Handling'] || sections['Edge Cases'] || ''),
    errorScenarios: parseErrorScenariosSection(sections['Edge Cases Error Handling'] || sections['Edge Cases'] || ''),
    validationRules: parseValidationRules(sections['Edge Cases Error Handling'] || sections['Edge Cases'] || ''),
    dependencies: parseDependenciesSection(sections['Dependencies'] || ''),
    definitionOfDone: parseDefinitionOfDoneSection(sections['Definition of Done'] || ''),
    implementationNotes: sections['Implementation Notes'] || null,
    references: parseReferencesSection(sections['References'] || ''),
    metadata: {
      priority: metadata.priority || 'Medium',
      labels: metadata.labels || [],
      sprint: metadata.sprint || null,
      epic: metadata.epic || null,
      createdAt: metadata.createdAt || new Date().toISOString(),
      investValidated: metadata.investValidated || false,
      bddScenarioCount: 0 // Will be counted after parsing
    }
  };
}

/**
 * Extract markdown sections by headers
 */
function extractMarkdownSections(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentSection = 'title';
  let currentContent = [];
  let sectionLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();

      // Save previous section
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }

      // Start new section - normalize header text (remove emojis, clean up)
      currentSection = normalizeHeaderText(headerText);
      currentContent = [];
      sectionLevel = level;
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Normalize header text (remove emojis, special chars)
 */
function normalizeHeaderText(text) {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/[^\w\s]/g, ' ') // Remove special chars
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Extract ticket ID from filename or title
 */
function extractTicketId(filePath, title) {
  const filename = path.basename(filePath, '.md');

  // Try to extract from filename (PROJ-123.md or PROJ-123-description.md)
  const filenameMatch = filename.match(/^([A-Z]+-[0-9]+)/);
  if (filenameMatch) {
    return filenameMatch[1];
  }

  // Try to extract from title
  if (title) {
    const titleMatch = title.match(/^([A-Z]+-[0-9]+):/);
    if (titleMatch) {
      return titleMatch[1];
    }
  }

  // Generate DRAFT ID with timestamp
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '-');
  return `DRAFT-${timestamp}`;
}

/**
 * Extract title (remove ID prefix if present)
 */
function extractTitle(titleLine) {
  return titleLine
    .replace(/^#\s+/, '')
    .replace(/^[A-Z]+-[0-9]+:\s*/, '')
    .trim();
}

/**
 * Parse user story section
 */
function parseUserStorySection(content) {
  const roleMatch = content.match(/\*\*As\s+(?:a|an)\*\*\s+([^\n]+)/i);
  const goalMatch = content.match(/\*\*I\s+want\*\*\s+([^\n]+)/i);
  const benefitMatch = content.match(/\*\*So\s+that\*\*\s+([^\n]+)/i);

  return {
    role: roleMatch ? roleMatch[1].trim() : null,
    goal: goalMatch ? goalMatch[1].trim() : null,
    benefit: benefitMatch ? benefitMatch[1].trim() : null
  };
}

/**
 * Parse stakeholders table
 */
function parseStakeholdersSection(content) {
  const stakeholders = [];
  const tableRows = content.match(/\|[^\n]+\|/g);

  if (tableRows && tableRows.length > 2) {
    // Skip header and separator rows
    for (let i = 2; i < tableRows.length; i++) {
      const cells = tableRows[i].split('|').map(c => c.trim()).filter(c => c);

      if (cells.length >= 3) {
        stakeholders.push({
          role: cells[0],
          name: cells[1],
          responsibility: cells[2]
        });
      }
    }
  }

  return stakeholders;
}

/**
 * Parse simple list section
 */
function parseListSection(content) {
  const items = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered lists, bullets, or checkboxes
    const match = trimmed.match(/^(?:[0-9]+\.|[-*]|\[\s?[x ]?\])\s+(.+)/);
    if (match) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Extract metrics from success criteria section
 */
function extractMetrics(content) {
  const match = content.match(/\*\*Metrics\*\*[:\s]+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Parse BDD scenarios section
 */
function parseBddSection(content) {
  const scenarios = [];

  // Extract all scenario blocks
  const scenarioBlocks = content.split(/###\s+Scenario\s+[0-9]+:/);

  for (let i = 1; i < scenarioBlocks.length; i++) {
    const block = scenarioBlocks[i];
    const scenarioNameMatch = block.match(/^([^\n]+)/);

    if (!scenarioNameMatch) continue;

    const scenarioName = scenarioNameMatch[1].trim();

    // Extract Gherkin block
    const gherkinMatch = block.match(/```gherkin\s*([\s\S]*?)\s*```/);

    if (gherkinMatch) {
      const gherkin = gherkinMatch[1];
      const scenario = parseGherkinBlock(gherkin, scenarioName);
      if (scenario) {
        scenarios.push(scenario);
      }
    }
  }

  return scenarios;
}

/**
 * Parse Gherkin block
 */
function parseGherkinBlock(gherkin, scenarioName) {
  const givenMatch = gherkin.match(/Given\s+([^\n]+)/i);
  const whenMatch = gherkin.match(/When\s+([^\n]+)/i);
  const thenMatch = gherkin.match(/Then\s+([^\n]+)/i);

  if (!givenMatch || !whenMatch || !thenMatch) {
    return null;
  }

  const scenario = {
    scenario: scenarioName,
    given: givenMatch[1].trim(),
    when: whenMatch[1].trim(),
    then: thenMatch[1].trim()
  };

  // Extract And clauses
  const andMatches = gherkin.match(/And\s+([^\n]+)/gi);
  if (andMatches) {
    scenario.and_given = andMatches.map(m => m.replace(/And\s+/i, '').trim());
  }

  return scenario;
}

/**
 * Parse technical context section
 */
function parseTechnicalSection(content) {
  return {
    currentState: parseSubsectionList(content, 'Current State'),
    proposedChanges: parseSubsectionList(content, 'Proposed Changes'),
    constraints: parseSubsectionList(content, 'Technical Constraints'),
    integrationPoints: parseSubsectionList(content, 'Integration Points'),
    architectureDecisions: [] // TODO: Parse if formatted as list
  };
}

/**
 * Parse subsection list
 */
function parseSubsectionList(content, subsectionName) {
  const pattern = new RegExp(`###\\s+${subsectionName}([\\s\\S]*?)(?=###|$)`, 'i');
  const match = content.match(pattern);

  if (!match) return [];

  return parseListSection(match[1]);
}

/**
 * Extract future considerations
 */
function extractFutureConsiderations(content) {
  const match = content.match(/\*\*Future Considerations\*\*[:\s]+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Parse edge cases section
 */
function parseEdgeCasesSection(content) {
  const edgeCases = [];
  const section = extractSubsection(content, 'Edge Cases');

  if (section) {
    const lines = section.split('\n');
    for (const line of lines) {
      const match = line.match(/^(?:[0-9]+\.|[-*])\s*\*?\*?([^:]+)\*?\*?[:\s]+(.+)/);
      if (match) {
        edgeCases.push({
          case: match[1].trim(),
          handling: match[2].trim()
        });
      }
    }
  }

  return edgeCases;
}

/**
 * Parse error scenarios section
 */
function parseErrorScenariosSection(content) {
  const scenarios = [];
  const section = extractSubsection(content, 'Error Scenarios');

  if (section) {
    const lines = section.split('\n');
    for (const line of lines) {
      const match = line.match(/^(?:[0-9]+\.|[-*])\s*\*?\*?([^:]+)\*?\*?[:\s]+(.+)/);
      if (match) {
        scenarios.push({
          error: match[1].trim(),
          userMessage: 'TBD',
          systemBehavior: match[2].trim()
        });
      }
    }
  }

  return scenarios;
}

/**
 * Parse validation rules
 */
function parseValidationRules(content) {
  const section = extractSubsection(content, 'Data Validation Rules');
  return section ? parseListSection(section) : [];
}

/**
 * Parse dependencies section
 */
function parseDependenciesSection(content) {
  return {
    blocking: parseSubsectionList(content, 'Blocking'),
    related: parseSubsectionList(content, 'Related')
  };
}

/**
 * Parse definition of done section
 */
function parseDefinitionOfDoneSection(content) {
  return {
    codeQuality: parseSubsectionList(content, 'Code Quality'),
    testing: parseSubsectionList(content, 'Testing'),
    documentation: parseSubsectionList(content, 'Documentation'),
    review: parseSubsectionList(content, 'Review Deployment')
  };
}

/**
 * Parse references section
 */
function parseReferencesSection(content) {
  const refs = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/[^\s)]+/);
    if (urlMatch) {
      refs.push(urlMatch[0]);
    }
  }

  return refs;
}

/**
 * Extract metadata from bottom of markdown
 */
function extractMetadata(content) {
  const metadata = {};

  const priorityMatch = content.match(/\*\*Priority\*\*[:\s]+([^\n]+)/i);
  if (priorityMatch) {
    metadata.priority = priorityMatch[1].trim();
  }

  const labelsMatch = content.match(/\*\*Labels\*\*[:\s]+([^\n]+)/i);
  if (labelsMatch) {
    metadata.labels = labelsMatch[1].split(',').map(l => l.trim());
  }

  const sprintMatch = content.match(/\*\*Sprint\*\*[:\s]+([^\n]+)/i);
  if (sprintMatch) {
    metadata.sprint = sprintMatch[1].trim();
  }

  const epicMatch = content.match(/\*\*Epic\*\*[:\s]+([^\n]+)/i);
  if (epicMatch) {
    metadata.epic = epicMatch[1].trim();
  }

  const createdMatch = content.match(/\*\*Created\*\*[:\s]+([^\n]+)/i);
  if (createdMatch) {
    metadata.createdAt = createdMatch[1].trim();
  }

  const investMatch = content.match(/\*\*INVEST Validated\*\*[:\s]+(✅|❌)/i);
  if (investMatch) {
    metadata.investValidated = investMatch[1] === '✅';
  }

  return metadata;
}

/**
 * Extract subsection content
 */
function extractSubsection(content, subsectionName) {
  const pattern = new RegExp(`###\\s+${subsectionName}([\\s\\S]*?)(?=###|$)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

module.exports = {
  parseMarkdownTicket
};

// CLI usage
if (require.main === module) {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: node markdown-parser.js <path-to-markdown-file>');
    process.exit(1);
  }

  try {
    const canonical = parseMarkdownTicket(filePath);
    console.log(JSON.stringify(canonical, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
