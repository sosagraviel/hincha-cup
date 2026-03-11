#!/usr/bin/env node

/**
 * Markdown Formatter
 *
 * Formats canonical ticket to SDD markdown format.
 * Uses exact template structure from templates/sdd-ticket-template.md
 *
 * @module markdown-formatter
 */

const fs = require('fs');
const path = require('path');

/**
 * Format canonical ticket to SDD markdown
 *
 * @param {Object} ticket - Canonical ticket object
 * @returns {string} Formatted markdown content
 */
function formatToMarkdown(ticket) {
  const sections = [];

  // Title
  sections.push(`# ${ticket.id}: ${ticket.title}`);
  sections.push('');

  // User Story
  sections.push('## 📋 User Story');
  sections.push('');
  sections.push(`**As a** ${ticket.userStory.role || '[NEEDS_CLARIFICATION]'}`);
  sections.push(`**I want** ${ticket.userStory.goal || '[NEEDS_CLARIFICATION]'}`);
  sections.push(`**So that** ${ticket.userStory.benefit || '[NEEDS_CLARIFICATION]'}`);
  sections.push('');
  sections.push('---');
  sections.push('');

  // Stakeholders
  sections.push('## 👥 Stakeholders');
  sections.push('');
  sections.push('| Role | Name | Responsibility |');
  sections.push('|------|------|----------------|');

  if (ticket.stakeholders && ticket.stakeholders.length > 0) {
    ticket.stakeholders.forEach(s => {
      sections.push(`| ${s.role} | ${s.name} | ${s.responsibility} |`);
    });
  } else {
    sections.push('| [Role] | [Name] | [Responsibility] |');
  }

  sections.push('');
  sections.push('---');
  sections.push('');

  // Success Criteria
  sections.push('## 🎯 Success Criteria');
  sections.push('');

  if (ticket.successCriteria && ticket.successCriteria.length > 0) {
    ticket.successCriteria.forEach((criteria, i) => {
      sections.push(`${i + 1}. ${criteria}`);
    });
  } else {
    sections.push('1. [Measurable outcome 1]');
    sections.push('2. [Measurable outcome 2]');
    sections.push('3. [Measurable outcome 3]');
  }

  sections.push('');
  sections.push(`**Metrics**: ${ticket.metrics || '[How we\'ll measure success]'}`);
  sections.push('');
  sections.push('---');
  sections.push('');

  // Acceptance Criteria
  sections.push('## ✅ Acceptance Criteria');
  sections.push('');

  if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
    ticket.acceptanceCriteria.forEach((scenario, i) => {
      sections.push(`### Scenario ${i + 1}: ${scenario.scenario}`);
      sections.push('```gherkin');
      sections.push(`Given ${scenario.given}`);

      if (scenario.and_given) {
        scenario.and_given.forEach(and => {
          sections.push(`And ${and}`);
        });
      }

      sections.push(`When ${scenario.when}`);
      sections.push(`Then ${scenario.then}`);

      if (scenario.and_then) {
        scenario.and_then.forEach(and => {
          sections.push(`And ${and}`);
        });
      }

      sections.push('```');
      sections.push('');
    });
  } else {
    sections.push('### Scenario 1: [Happy Path]');
    sections.push('```gherkin');
    sections.push('Given [initial context/state]');
    sections.push('When [action/trigger]');
    sections.push('Then [expected outcome]');
    sections.push('```');
    sections.push('');
  }

  sections.push('---');
  sections.push('');

  // Technical Context
  sections.push('## 🔧 Technical Context');
  sections.push('');

  sections.push('### Current State');
  if (ticket.technicalContext?.currentState && ticket.technicalContext.currentState.length > 0) {
    ticket.technicalContext.currentState.forEach(item => {
      sections.push(`- ${item}`);
    });
  } else {
    sections.push('- [What exists today]');
  }
  sections.push('');

  sections.push('### Proposed Changes');
  if (ticket.technicalContext?.proposedChanges && ticket.technicalContext.proposedChanges.length > 0) {
    ticket.technicalContext.proposedChanges.forEach(item => {
      sections.push(`- ${item}`);
    });
  } else {
    sections.push('- [What will be built/modified]');
  }
  sections.push('');

  sections.push('### Technical Constraints');
  if (ticket.technicalContext?.constraints && ticket.technicalContext.constraints.length > 0) {
    ticket.technicalContext.constraints.forEach(item => {
      sections.push(`- ${item}`);
    });
  } else {
    sections.push('- [Performance, security, scalability requirements]');
  }
  sections.push('');

  sections.push('### Integration Points');
  if (ticket.technicalContext?.integrationPoints && ticket.technicalContext.integrationPoints.length > 0) {
    ticket.technicalContext.integrationPoints.forEach(item => {
      sections.push(`- ${item}`);
    });
  } else {
    sections.push('- [Systems to integrate with]');
  }
  sections.push('');

  if (ticket.technicalContext?.architectureDecisions && ticket.technicalContext.architectureDecisions.length > 0) {
    sections.push('### Architecture Decisions');
    ticket.technicalContext.architectureDecisions.forEach(decision => {
      sections.push(`- **${decision.decision}**: ${decision.rationale}`);
    });
    sections.push('');
  }

  sections.push('---');
  sections.push('');

  // Out of Scope
  sections.push('## 🚫 Out of Scope');
  sections.push('');
  sections.push('The following are explicitly NOT part of this ticket:');

  if (ticket.outOfScope && ticket.outOfScope.length > 0) {
    ticket.outOfScope.forEach((item, i) => {
      sections.push(`${i + 1}. ${item}`);
    });
  } else {
    sections.push('1. [Item 1]');
  }

  sections.push('');

  if (ticket.futureConsiderations) {
    sections.push(`**Future Considerations**: ${ticket.futureConsiderations}`);
  } else {
    sections.push('**Future Considerations**: [What might be addressed later]');
  }

  sections.push('');
  sections.push('---');
  sections.push('');

  // Edge Cases & Error Handling
  sections.push('## ⚠️ Edge Cases & Error Handling');
  sections.push('');

  sections.push('### Edge Cases');
  if (ticket.edgeCases && ticket.edgeCases.length > 0) {
    ticket.edgeCases.forEach((edge, i) => {
      sections.push(`${i + 1}. **${edge.case}**: ${edge.handling}`);
    });
  } else {
    sections.push('1. **[Edge case 1]**: [How to handle]');
  }
  sections.push('');

  sections.push('### Error Scenarios');
  if (ticket.errorScenarios && ticket.errorScenarios.length > 0) {
    ticket.errorScenarios.forEach((error, i) => {
      sections.push(`${i + 1}. **${error.error}**: ${error.systemBehavior}`);
    });
  } else {
    sections.push('1. **[Error 1]**: [User-facing message, system behavior]');
  }
  sections.push('');

  if (ticket.validationRules && ticket.validationRules.length > 0) {
    sections.push('### Data Validation Rules');
    ticket.validationRules.forEach(rule => {
      sections.push(`- ${rule}`);
    });
    sections.push('');
  }

  sections.push('---');
  sections.push('');

  // Dependencies
  sections.push('## 📦 Dependencies');
  sections.push('');

  sections.push('### Blocking');
  if (ticket.dependencies?.blocking && ticket.dependencies.blocking.length > 0) {
    ticket.dependencies.blocking.forEach(dep => {
      sections.push(`- [ ] ${dep}`);
    });
  } else {
    sections.push('- [ ] [Ticket/item that must complete first]');
  }
  sections.push('');

  sections.push('### Related');
  if (ticket.dependencies?.related && ticket.dependencies.related.length > 0) {
    ticket.dependencies.related.forEach(dep => {
      sections.push(`- ${dep}`);
    });
  } else {
    sections.push('- [Ticket] - [Relationship]');
  }
  sections.push('');

  sections.push('---');
  sections.push('');

  // Definition of Done
  sections.push('## 🎓 Definition of Done');
  sections.push('');

  sections.push('### Code Quality');
  if (ticket.definitionOfDone?.codeQuality && ticket.definitionOfDone.codeQuality.length > 0) {
    ticket.definitionOfDone.codeQuality.forEach(item => {
      sections.push(`- [ ] ${item}`);
    });
  } else {
    sections.push('- [ ] All acceptance criteria scenarios implemented');
    sections.push('- [ ] Unit test coverage ≥ 80%');
  }
  sections.push('');

  sections.push('### Testing');
  if (ticket.definitionOfDone?.testing && ticket.definitionOfDone.testing.length > 0) {
    ticket.definitionOfDone.testing.forEach(item => {
      sections.push(`- [ ] ${item}`);
    });
  } else {
    sections.push('- [ ] All BDD scenarios have corresponding automated tests');
  }
  sections.push('');

  sections.push('### Documentation');
  if (ticket.definitionOfDone?.documentation && ticket.definitionOfDone.documentation.length > 0) {
    ticket.definitionOfDone.documentation.forEach(item => {
      sections.push(`- [ ] ${item}`);
    });
  } else {
    sections.push('- [ ] API endpoints documented (if applicable)');
  }
  sections.push('');

  sections.push('### Review & Deployment');
  if (ticket.definitionOfDone?.review && ticket.definitionOfDone.review.length > 0) {
    ticket.definitionOfDone.review.forEach(item => {
      sections.push(`- [ ] ${item}`);
    });
  } else {
    sections.push('- [ ] Code reviewed and approved');
    sections.push('- [ ] PR merged to main');
  }
  sections.push('');

  sections.push('---');
  sections.push('');

  // Implementation Notes
  sections.push('## 📝 Implementation Notes');
  sections.push('');
  sections.push(ticket.implementationNotes || '[Any additional context, helpful resources, or gotchas for implementer]');
  sections.push('');
  sections.push('---');
  sections.push('');

  // References
  sections.push('## 🔗 References');
  sections.push('');
  if (ticket.references && ticket.references.length > 0) {
    ticket.references.forEach(ref => {
      sections.push(`- ${ref}`);
    });
  } else {
    sections.push('- [Design mockups URL]');
    sections.push('- [Related documentation]');
  }
  sections.push('');
  sections.push('---');
  sections.push('');

  // Metadata
  const createdDate = ticket.metadata.createdAt ? new Date(ticket.metadata.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  sections.push(`**Created**: ${createdDate}`);
  sections.push('**Created By**: Claude (create-sdd-ticket skill)');
  sections.push(`**INVEST Validated**: ${ticket.metadata.investValidated ? '✅' : '❌'}`);
  sections.push(`**BDD Scenarios**: ${ticket.metadata.bddScenarioCount || ticket.acceptanceCriteria?.length || 0}`);
  sections.push(`**Priority**: ${ticket.metadata.priority || 'Medium'}`);

  if (ticket.metadata.labels && ticket.metadata.labels.length > 0) {
    sections.push(`**Labels**: ${ticket.metadata.labels.join(', ')}`);
  }

  return sections.join('\n');
}

/**
 * Write formatted markdown to file
 *
 * @param {Object} ticket - Canonical ticket object
 * @param {string} outputPath - Path to write file
 */
function writeMarkdownFile(ticket, outputPath) {
  const markdown = formatToMarkdown(ticket);
  const resolvedPath = path.resolve(outputPath);
  const dir = path.dirname(resolvedPath);

  // Create directory if doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, markdown, 'utf-8');
  return resolvedPath;
}

module.exports = {
  formatToMarkdown,
  writeMarkdownFile
};

// CLI usage
if (require.main === module) {
  const canonicalPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!canonicalPath) {
    console.error('Usage: node markdown-formatter.js <canonical-json-path> [output-path]');
    process.exit(1);
  }

  try {
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));

    if (outputPath) {
      const written = writeMarkdownFile(canonical, outputPath);
      console.log(`✓ Markdown written to: ${written}`);
    } else {
      console.log(formatToMarkdown(canonical));
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
