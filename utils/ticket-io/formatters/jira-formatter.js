#!/usr/bin/env node

/**
 * Jira Formatter
 *
 * Formats canonical ticket to Jira API payload format.
 *
 * @module jira-formatter
 */

/**
 * Format canonical ticket to Jira API payload
 *
 * @param {Object} ticket - Canonical ticket object
 * @param {string} projectKey - Jira project key (e.g., 'PROJ')
 * @param {string} issueType - Issue type (Story, Task, Bug)
 * @returns {Object} Jira API payload
 */
function formatToJira(ticket, projectKey, issueType = 'Story') {
  const description = formatDescriptionForJira(ticket);

  const payload = {
    fields: {
      project: {
        key: projectKey
      },
      summary: ticket.title,
      description: description,
      issuetype: {
        name: issueType
      }
    }
  };

  // Add priority if specified
  if (ticket.metadata.priority) {
    payload.fields.priority = {
      name: ticket.metadata.priority
    };
  }

  // Add labels if specified
  if (ticket.metadata.labels && ticket.metadata.labels.length > 0) {
    payload.fields.labels = ticket.metadata.labels;
  }

  // Add epic link if specified
  if (ticket.metadata.epic) {
    payload.fields.parent = {
      key: ticket.metadata.epic
    };
  }

  return payload;
}

/**
 * Format ticket description for Jira (using Jira markdown format)
 */
function formatDescriptionForJira(ticket) {
  let description = '';

  // User Story
  if (ticket.userStory.role || ticket.userStory.goal || ticket.userStory.benefit) {
    description += 'h2. User Story\n\n';
    description += `*As a* ${ticket.userStory.role || '[NEEDS_CLARIFICATION]'}\\n`;
    description += `*I want* ${ticket.userStory.goal || '[NEEDS_CLARIFICATION]'}\\n`;
    description += `*So that* ${ticket.userStory.benefit || '[NEEDS_CLARIFICATION]'}\\n`;
    description += '\n----\n\n';
  }

  // Stakeholders
  if (ticket.stakeholders && ticket.stakeholders.length > 0) {
    description += 'h2. Stakeholders\n\n';
    description += '||Role||Name||Responsibility||\n';
    for (const stakeholder of ticket.stakeholders) {
      description += `|${stakeholder.role}|${stakeholder.name}|${stakeholder.responsibility}|\n`;
    }
    description += '\n----\n\n';
  }

  // Success Criteria
  if (ticket.successCriteria && ticket.successCriteria.length > 0) {
    description += 'h2. Success Criteria\n\n';
    ticket.successCriteria.forEach((criteria, i) => {
      description += `# ${criteria}\n`;
    });

    if (ticket.metrics) {
      description += `\n*Metrics*: ${ticket.metrics}\n`;
    }
    description += '\n----\n\n';
  }

  // Acceptance Criteria (BDD)
  if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
    description += 'h2. Acceptance Criteria\n\n';

    ticket.acceptanceCriteria.forEach((scenario, i) => {
      description += `h3. Scenario ${i + 1}: ${scenario.scenario}\n\n`;
      description += '{code:gherkin}\n';
      description += `Given ${scenario.given}\n`;

      if (scenario.and_given) {
        scenario.and_given.forEach(and => {
          description += `And ${and}\n`;
        });
      }

      description += `When ${scenario.when}\n`;
      description += `Then ${scenario.then}\n`;

      if (scenario.and_then) {
        scenario.and_then.forEach(and => {
          description += `And ${and}\n`;
        });
      }

      description += '{code}\n\n';
    });

    description += '----\n\n';
  }

  // Technical Context
  if (ticket.technicalContext) {
    description += 'h2. Technical Context\n\n';

    if (ticket.technicalContext.currentState && ticket.technicalContext.currentState.length > 0) {
      description += 'h3. Current State\n';
      ticket.technicalContext.currentState.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    if (ticket.technicalContext.proposedChanges && ticket.technicalContext.proposedChanges.length > 0) {
      description += 'h3. Proposed Changes\n';
      ticket.technicalContext.proposedChanges.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    if (ticket.technicalContext.constraints && ticket.technicalContext.constraints.length > 0) {
      description += 'h3. Technical Constraints\n';
      ticket.technicalContext.constraints.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    if (ticket.technicalContext.integrationPoints && ticket.technicalContext.integrationPoints.length > 0) {
      description += 'h3. Integration Points\n';
      ticket.technicalContext.integrationPoints.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    description += '----\n\n';
  }

  // Out of Scope
  if (ticket.outOfScope && ticket.outOfScope.length > 0) {
    description += 'h2. Out of Scope\n\n';
    description += 'The following are explicitly NOT part of this ticket:\n';
    ticket.outOfScope.forEach((item, i) => {
      description += `# ${item}\n`;
    });

    if (ticket.futureConsiderations) {
      description += `\n*Future Considerations*: ${ticket.futureConsiderations}\n`;
    }

    description += '\n----\n\n';
  }

  // Edge Cases & Error Handling
  if (ticket.edgeCases && ticket.edgeCases.length > 0) {
    description += 'h2. Edge Cases & Error Handling\n\n';
    description += 'h3. Edge Cases\n';
    ticket.edgeCases.forEach((edge, i) => {
      description += `# *${edge.case}*: ${edge.handling}\n`;
    });
    description += '\n';
  }

  if (ticket.errorScenarios && ticket.errorScenarios.length > 0) {
    description += 'h3. Error Scenarios\n';
    ticket.errorScenarios.forEach((error, i) => {
      description += `# *${error.error}*: ${error.systemBehavior}\n`;
    });
    description += '\n';
  }

  if (ticket.validationRules && ticket.validationRules.length > 0) {
    description += 'h3. Data Validation Rules\n';
    ticket.validationRules.forEach(rule => {
      description += `* ${rule}\n`;
    });
    description += '\n----\n\n';
  }

  // Dependencies
  if (ticket.dependencies && (ticket.dependencies.blocking?.length > 0 || ticket.dependencies.related?.length > 0)) {
    description += 'h2. Dependencies\n\n';

    if (ticket.dependencies.blocking?.length > 0) {
      description += 'h3. Blocking\n';
      ticket.dependencies.blocking.forEach(dep => {
        description += `* ${dep}\n`;
      });
      description += '\n';
    }

    if (ticket.dependencies.related?.length > 0) {
      description += 'h3. Related\n';
      ticket.dependencies.related.forEach(dep => {
        description += `* ${dep}\n`;
      });
      description += '\n';
    }

    description += '----\n\n';
  }

  // Definition of Done
  if (ticket.definitionOfDone) {
    description += 'h2. Definition of Done\n\n';

    if (ticket.definitionOfDone.codeQuality?.length > 0) {
      description += 'h3. Code Quality\n';
      ticket.definitionOfDone.codeQuality.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    if (ticket.definitionOfDone.testing?.length > 0) {
      description += 'h3. Testing\n';
      ticket.definitionOfDone.testing.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    if (ticket.definitionOfDone.documentation?.length > 0) {
      description += 'h3. Documentation\n';
      ticket.definitionOfDone.documentation.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    if (ticket.definitionOfDone.review?.length > 0) {
      description += 'h3. Review & Deployment\n';
      ticket.definitionOfDone.review.forEach(item => {
        description += `* ${item}\n`;
      });
      description += '\n';
    }

    description += '----\n\n';
  }

  // Implementation Notes
  if (ticket.implementationNotes) {
    description += 'h2. Implementation Notes\n\n';
    description += ticket.implementationNotes;
    description += '\n\n----\n\n';
  }

  // Metadata
  description += `*Created By*: Claude (create-sdd-ticket skill)\\n`;
  description += `*INVEST Validated*: ${ticket.metadata.investValidated ? 'Yes' : 'No'}\\n`;
  description += `*BDD Scenarios*: ${ticket.metadata.bddScenarioCount || ticket.acceptanceCriteria?.length || 0}\\n`;

  return description;
}

module.exports = {
  formatToJira
};

// CLI usage
if (require.main === module) {
  const fs = require('fs');
  const canonicalPath = process.argv[2];
  const projectKey = process.argv[3];
  const issueType = process.argv[4] || 'Story';

  if (!canonicalPath || !projectKey) {
    console.error('Usage: node jira-formatter.js <canonical-json-path> <project-key> [issue-type]');
    process.exit(1);
  }

  try {
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));
    const jiraPayload = formatToJira(canonical, projectKey, issueType);
    console.log(JSON.stringify(jiraPayload, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
