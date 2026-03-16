# Utils Module

Production-ready utilities for the AI Agentic Framework. Single config file, simple matching.

## Modules

| Module | Purpose |
|--------|---------|
| **agents/** | Agent template rendering and generation |
| **artifacts/** | Artifact collection, accuracy calculation, PR descriptions |
| **config/** | Configuration, environment detection, MCP, argument parsing |
| **core/** | Skill resolution (simple array matching) |
| **discovery/** | Skill discovery, stack auditing, assumption logging |
| **documentation/** | Documentation change detection, architecture diagrams |
| **error-handling/** | Error recovery, retry logic, checkpoint management |
| **skills/** | Skill config and simple resolver |
| **stack/** | Stack detection (100 lines, checks files + dependencies) |
| **testing/** | Test framework detection, orchestration, selection, E2E |
| **ticket-io/** | Ticket reading/writing with markdown/JSON formatters |
| **ui/** | Screenshot capture and comparison |
| **validation/** | SDD ticket validation |
| **workflow/** | Planning, autonomous decisions, strategy selection, review orchestration |

## Architecture

**Config-Driven**: All skills in one file: `skills.config.json`. Simple trigger matching against detected stack array.

**AI Detection**: Initialize-project agents analyze project and save to `framework-config.json`. Stack detection reads this config.

**Zero Complexity**: No classes, no plugins, no parsing. One config file, one resolver. AI does the heavy lifting.

## Public API

```javascript
// Direct exports
const utils = require('./utils');

// Stack detection
utils.detectStack(projectPath)           // Returns legacy format (backward compat)
utils.detectStackSimple(projectPath)     // Returns simple array: ['typescript', 'react', ...]

// Skill resolution
utils.resolveSkills(detectedArray, frameworkPath)  // Returns skills to copy

// Agents
utils.generateAgents(stackProfile, projectPath, templatesPath, frameworkPath)

// Tickets
utils.TicketReader
utils.TicketWriter

// Module namespaces (advanced)
utils.config.*
utils.errorHandling.*
utils.testing.*
utils.workflow.*
utils.documentation.*
utils.artifacts.*
utils.ui.*
utils.discovery.*
```

## Extending

**Add skill**: Edit `skills.config.json`, add one object. Create skill directory.

**Add language/framework**: Just add skill to `skills.config.json`. AI agents detect it during initialize-project.

**That's it.** No detection code needed. AI handles everything.

## Documentation

- `MIGRATION.md` - Migration from old monolithic structure
- `COMPLETION_REPORT.md` - Complete refactor details
- `REFACTOR_SUMMARY.md` - Architecture decisions
- `IMPORT_UPDATES.md` - Bash script import changes
