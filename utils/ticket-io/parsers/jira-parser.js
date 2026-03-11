#!/usr/bin/env node

/**
 * Jira Parser
 *
 * Parses Jira API responses into canonical ticket format.
 * Intelligently extracts structured data from descriptions.
 *
 * @module jira-parser
 */

/**
 * Parse Jira ticket data into canonical format
 *
 * @param {Object} jiraData - Raw Jira API response
 * @param {string} jiraBaseUrl - Base URL for Jira instance
 * @returns {Object} Canonical ticket object
 */
function parseJiraTicket(jiraData, jiraBaseUrl = 'https://jira.atlassian.net') {
  const fields = jiraData.fields || {};
  const description = fields.description || '';

  return {
    id: jiraData.key,
    source: 'jira',
    sourcePath: `${jiraBaseUrl}/browse/${jiraData.key}`,
    title: fields.summary || '',
    userStory: extractUserStory(description),
    stakeholders: extractStakeholders(fields, description),
    successCriteria: extractSuccessCriteria(description),
    metrics: extractMetrics(description),
    acceptanceCriteria: extractBddScenarios(description),
    technicalContext: extractTechnicalContext(description, fields),
    outOfScope: extractOutOfScope(description),
    futureConsiderations: extractFutureConsiderations(description),
    edgeCases: extractEdgeCases(description),
    errorScenarios: extractErrorScenarios(description),
    validationRules: extractValidationRules(description),
    dependencies: {
      blocking: extractBlockingIssues(fields.issuelinks || []),
      related: extractRelatedIssues(fields.issuelinks || [])
    },
    definitionOfDone: extractDefinitionOfDone(description),
    implementationNotes: extractImplementationNotes(description),
    references: extractReferences(description, fields),
    metadata: {
      priority: fields.priority?.name || null,
      labels: fields.labels || [],
      sprint: extractSprintName(fields),
      epic: fields.parent?.key || null,
      createdAt: fields.created || new Date().toISOString(),
      investValidated: false, // Will be validated later
      bddScenarioCount: 0 // Will be counted after extraction
    }
  };
}

/**
 * Extract user story components from description
 */
function extractUserStory(description) {
  // Pattern 1: "As a ... I want ... so that ..."
  const pattern1 = /As\s+(?:a|an)\s+([^,\n]+)[,.]?\s+I\s+want\s+(?:to\s+)?([^,\n]+)[,.]?\s+so\s+that\s+([^\n]+)/i;
  const match1 = description.match(pattern1);

  if (match1) {
    return {
      role: match1[1].trim(),
      goal: match1[2].trim(),
      benefit: match1[3].trim()
    };
  }

  // Pattern 2: User Story section
  const userStorySection = extractSection(description, 'User Story');
  if (userStorySection) {
    const roleMatch = userStorySection.match(/(?:As|Role|Who)[:\s]+([^\n]+)/i);
    const goalMatch = userStorySection.match(/(?:I want|Want|Goal|What)[:\s]+([^\n]+)/i);
    const benefitMatch = userStorySection.match(/(?:So that|Benefit|Why)[:\s]+([^\n]+)/i);

    if (roleMatch || goalMatch || benefitMatch) {
      return {
        role: roleMatch ? roleMatch[1].trim() : null,
        goal: goalMatch ? goalMatch[1].trim() : null,
        benefit: benefitMatch ? benefitMatch[1].trim() : null
      };
    }
  }

  return { role: null, goal: null, benefit: null };
}

/**
 * Extract stakeholders from fields and description
 */
function extractStakeholders(fields, description) {
  const stakeholders = [];

  // Add reporter as requester
  if (fields.reporter) {
    stakeholders.push({
      role: 'Requester',
      name: fields.reporter.displayName || fields.reporter.name,
      responsibility: 'Initial request, requirements validation'
    });
  }

  // Add assignee as implementer
  if (fields.assignee) {
    stakeholders.push({
      role: 'Implementer',
      name: fields.assignee.displayName || fields.assignee.name,
      responsibility: 'Implementation and delivery'
    });
  }

  // Extract from stakeholders section
  const stakeholdersSection = extractSection(description, 'Stakeholders');
  if (stakeholdersSection) {
    const tableRows = stakeholdersSection.match(/\|[^\n]+\|/g);
    if (tableRows && tableRows.length > 1) {
      // Skip header row
      for (let i = 1; i < tableRows.length; i++) {
        const cells = tableRows[i].split('|').map(c => c.trim()).filter(c => c && c !== '---');
        if (cells.length >= 3) {
          stakeholders.push({
            role: cells[0],
            name: cells[1],
            responsibility: cells[2]
          });
        }
      }
    }
  }

  return stakeholders.length > 0 ? stakeholders : [];
}

/**
 * Extract success criteria
 */
function extractSuccessCriteria(description) {
  const section = extractSection(description, 'Success Criteria');
  if (!section) return [];

  const criteria = [];
  const lines = section.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered or bulleted lists
    const match = trimmed.match(/^(?:[0-9]+\.|[-*])\s+(.+)/);
    if (match) {
      criteria.push(match[1].trim());
    }
  }

  return criteria;
}

/**
 * Extract metrics
 */
function extractMetrics(description) {
  const metricsMatch = description.match(/Metrics?[:\s]+([^\n]+)/i);
  return metricsMatch ? metricsMatch[1].trim() : null;
}

/**
 * Extract BDD scenarios from description
 */
function extractBddScenarios(description) {
  const scenarios = [];

  // Pattern 1: Full BDD format with code blocks
  const codeBlockPattern = /```gherkin\s*([\s\S]*?)\s*```/gi;
  let match;

  while ((match = codeBlockPattern.exec(description)) !== null) {
    const gherkinContent = match[1];
    const scenarioMatch = gherkinContent.match(/Scenario[:\s]+([^\n]+)/i);

    if (scenarioMatch) {
      const scenario = parseGherkinScenario(gherkinContent, scenarioMatch[1]);
      if (scenario) {
        scenarios.push(scenario);
      }
    }
  }

  // Pattern 2: Inline Given-When-Then (without code blocks)
  const inlinePattern = /(?:Scenario|Test Case)[:\s]*([^\n]+)[\s\S]*?Given\s+([^\n]+)[\s\S]*?When\s+([^\n]+)[\s\S]*?Then\s+([^\n]+)/gi;

  while ((match = inlinePattern.exec(description)) !== null) {
    // Avoid duplicates from code blocks
    if (!match[0].includes('```')) {
      scenarios.push({
        scenario: match[1].trim(),
        given: match[2].trim(),
        when: match[3].trim(),
        then: match[4].trim()
      });
    }
  }

  return scenarios;
}

/**
 * Parse Gherkin scenario
 */
function parseGherkinScenario(gherkinContent, scenarioName) {
  const givenMatch = gherkinContent.match(/Given\s+([^\n]+)/i);
  const whenMatch = gherkinContent.match(/When\s+([^\n]+)/i);
  const thenMatch = gherkinContent.match(/Then\s+([^\n]+)/i);

  if (givenMatch && whenMatch && thenMatch) {
    const scenario = {
      scenario: scenarioName.trim(),
      given: givenMatch[1].trim(),
      when: whenMatch[1].trim(),
      then: thenMatch[1].trim()
    };

    // Extract additional And clauses
    const andGivenMatches = gherkinContent.match(/And\s+([^\n]+)/gi);
    if (andGivenMatches) {
      scenario.and_given = andGivenMatches.map(m => m.replace(/And\s+/i, '').trim());
    }

    return scenario;
  }

  return null;
}

/**
 * Extract technical context
 */
function extractTechnicalContext(description, fields) {
  const context = {
    currentState: [],
    proposedChanges: [],
    constraints: [],
    integrationPoints: [],
    architectureDecisions: []
  };

  const technicalSection = extractSection(description, 'Technical Context');
  if (technicalSection) {
    context.currentState = extractListItems(technicalSection, 'Current State');
    context.proposedChanges = extractListItems(technicalSection, 'Proposed Changes');
    context.constraints = extractListItems(technicalSection, 'Constraints');
    context.integrationPoints = extractListItems(technicalSection, 'Integration Points');
  }

  // Extract from components/labels
  if (fields.components && fields.components.length > 0) {
    context.integrationPoints.push(...fields.components.map(c => c.name));
  }

  return context;
}

/**
 * Extract out of scope items
 */
function extractOutOfScope(description) {
  const section = extractSection(description, 'Out of Scope');
  if (!section) return [];

  return extractListItems(section);
}

/**
 * Extract future considerations
 */
function extractFutureConsiderations(description) {
  const match = description.match(/Future Considerations?[:\s]+([^\n]+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Extract edge cases
 */
function extractEdgeCases(description) {
  const section = extractSection(description, 'Edge Cases');
  if (!section) return [];

  const edgeCases = [];
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

  return edgeCases;
}

/**
 * Extract error scenarios
 */
function extractErrorScenarios(description) {
  const section = extractSection(description, 'Error');
  if (!section) return [];

  const scenarios = [];
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

  return scenarios;
}

/**
 * Extract validation rules
 */
function extractValidationRules(description) {
  const section = extractSection(description, 'Validation');
  if (!section) return [];

  return extractListItems(section);
}

/**
 * Extract blocking issues
 */
function extractBlockingIssues(issueLinks) {
  return issueLinks
    .filter(link => link.type?.name === 'Blocks' && link.outwardIssue)
    .map(link => link.outwardIssue.key);
}

/**
 * Extract related issues
 */
function extractRelatedIssues(issueLinks) {
  return issueLinks
    .filter(link => link.type?.name === 'Relates' || (link.type?.name === 'Blocks' && link.inwardIssue))
    .map(link => (link.inwardIssue || link.outwardIssue).key);
}

/**
 * Extract definition of done
 */
function extractDefinitionOfDone(description) {
  const section = extractSection(description, 'Definition of Done');
  if (!section) {
    return {
      codeQuality: [],
      testing: [],
      documentation: [],
      review: []
    };
  }

  return {
    codeQuality: extractListItems(section, 'Code Quality'),
    testing: extractListItems(section, 'Testing'),
    documentation: extractListItems(section, 'Documentation'),
    review: extractListItems(section, 'Review')
  };
}

/**
 * Extract implementation notes
 */
function extractImplementationNotes(description) {
  const section = extractSection(description, 'Implementation Notes');
  return section || null;
}

/**
 * Extract references
 */
function extractReferences(description, fields) {
  const refs = [];

  // Extract URLs from description
  const urlPattern = /https?:\/\/[^\s)]+/g;
  const urls = description.match(urlPattern) || [];
  refs.push(...urls);

  // Add attachment URLs
  if (fields.attachment && fields.attachment.length > 0) {
    refs.push(...fields.attachment.map(a => a.content));
  }

  return [...new Set(refs)]; // Remove duplicates
}

/**
 * Extract sprint name
 */
function extractSprintName(fields) {
  if (fields.sprint && fields.sprint.length > 0) {
    return fields.sprint[0].name;
  }

  if (fields.customfield_sprint) {
    return Array.isArray(fields.customfield_sprint)
      ? fields.customfield_sprint[0]?.name
      : fields.customfield_sprint;
  }

  return null;
}

/**
 * Extract a section from description by header
 */
function extractSection(text, headerName) {
  // Match various header formats
  const patterns = [
    new RegExp(`##\\s+${headerName}[\\s\\S]*?(?=##|$)`, 'i'),
    new RegExp(`\\*\\*${headerName}\\*\\*[\\s\\S]*?(?=\\*\\*[A-Z]|$)`, 'i'),
    new RegExp(`${headerName}:[\\s\\S]*?(?=\\n\\n|$)`, 'i')
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].replace(new RegExp(`^##\\s+${headerName}|^\\*\\*${headerName}\\*\\*|^${headerName}:`, 'i'), '').trim();
    }
  }

  return null;
}

/**
 * Extract list items from text
 */
function extractListItems(text, subsectionName = null) {
  let content = text;

  // If subsection specified, extract that first
  if (subsectionName) {
    const subsection = extractSection(text, subsectionName);
    if (!subsection) return [];
    content = subsection;
  }

  const items = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered lists, bullets, or checkboxes
    const match = trimmed.match(/^(?:[0-9]+\.|[-*]|\[\s?\])\s+(.+)/);
    if (match) {
      items.push(match[1].trim());
    }
  }

  return items;
}

module.exports = {
  parseJiraTicket
};

// CLI usage
if (require.main === module) {
  const fs = require('fs');
  const jiraDataPath = process.argv[2];

  if (!jiraDataPath) {
    console.error('Usage: node jira-parser.js <path-to-jira-json>');
    process.exit(1);
  }

  try {
    const jiraData = JSON.parse(fs.readFileSync(jiraDataPath, 'utf-8'));
    const canonical = parseJiraTicket(jiraData);
    console.log(JSON.stringify(canonical, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
