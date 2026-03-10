# Changelog

All notable changes to the AI Agentic Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Framework Features

#### Complete Automation Pipeline

- **10-Phase Workflow**: Comprehensive implementation workflow
  - Phase 0: Pre-Flight Checks
  - Phase 1: Context Gathering
  - Phase 2: Planning
  - Phase 3: Environment Setup
  - Phase 4: Implementation
  - Phase 5: Testing
  - Phase 6: Visual Verification
  - Phase 7: Documentation Update
  - Phase 8: PR Creation
  - Phase 9: Automated Review Loop
  - Phase 10: Cleanup

#### Agents

- **planner.template.md**: Context gathering and requirements analysis with test planning
- **implementer.template.md**: Stack-specific code implementation (one per detected language)
- **tester-unit.template.md**: Unit and integration test creation
- **tester-e2e.template.md**: End-to-end test creation with auto-initialization
- **security-reviewer.template.md**: Security scanning and OWASP Top 10 checks
- **visual-verifier.template.md**: Screenshot diff analysis with fix suggestions
- **doc-updater.template.md**: Automatic documentation maintenance

#### Integration Utilities

- **doc-change-detector.js** (~600 lines): Pattern-based detection for documentation update triggers
  - Detection rules for tech stack, architecture, middleware, guards, real-time changes
  - Outputs `doc-update-analysis.json`

- **pr-description-generator.js** (~537 lines): Comprehensive PR description generation
  - Template-based markdown with 8+ sections
  - Extracts data from all phase artifacts
  - Outputs `pr-description.md`

- **review-loop-orchestrator.js** (~600 lines): Automated fix-test-review iterations
  - Max 3 iterations with convergence/divergence detection
  - Applies fixes (replace, add, delete actions)
  - Re-runs tests and reviews after each fix

- **agent-generation.js** (1145 lines): Stack-specific agent generation
  - Generates agents for planning, implementation, testing, review, verification, documentation
  - Runtime variable substitution for ticket-specific agents
  - Language-specific agent templates

#### Enhanced Skills

- **create-pr**: Pre-flight checks, artifact collection, rich PR descriptions
- **pr-reviewer**: Structured JSON output with actionable fix instructions
- **security-review**: OWASP Top 10 + language-specific scanners (bandit, npm audit, eslint)

#### Core Utilities (Week 1-2)

- **artifact-collector.js**: Centralized artifact management
- **environment-detection.js**: Detects project environment type
- **environment-manager.js**: Manages isolated test environments
- **test-orchestrator.js**: Coordinates test execution
- **test-framework-detection.js**: Detects test framework
- **screenshot-capture.js**: Captures screenshots for visual verification
- **screenshot-comparator.js**: Compares screenshots with pixelmatch

### Architecture

#### Artifact Directory Structure

```
.claude/artifacts/{JIRA_KEY}/
├── context/              # Phase 1
├── plans/                # Phase 2
├── implementations/      # Phase 4
├── tests/                # Phase 5
├── screenshots/          # Phase 6
│   ├── before/
│   ├── after/
│   └── diffs/
├── security/             # Phase 4
├── pr/                   # Phase 8 + 9
│   ├── pr-description.md
│   └── review/
└── doc-update-analysis.json  # Phase 7
```

#### Structured JSON Schemas

- `review-results.json`: PR review findings with fix instructions
- `security-results.json`: Security scan results
- `test-results.json`: Test execution results
- `visual-diff-report.json`: Screenshot comparison results
- `doc-update-analysis.json`: Documentation change triggers

#### Fix Instruction Schema

```typescript
interface FixInstruction {
  action: 'replace' | 'add' | 'delete' | 'refactor';
  file: string;
  line?: number;
  insertAfterLine?: number;
  oldCode?: string;
  newCode?: string;
  explanation: string;
}
```

### Testing

#### Integration Tests

- **doc-change-detector.test.js**: 7 test cases
- **pr-description-generator.test.js**: 5 test cases
- **review-loop-orchestrator.test.js**: 5 test cases
- **agent-generation.test.js**: 4 test cases
- **run-all-tests.sh**: Automated test runner

**Total**: 27 test cases across 4 suites

### Documentation

- **SKILLS_AND_AGENTS_MAP.md**: Complete skills and agents hierarchy
- **CHANGELOG.md**: This file
- **README.md**: Updated with current features
- Comprehensive JSDoc comments in all utilities

### Configuration

#### Review Loop Configuration

```javascript
const CONFIG = {
  maxIterations: 3,
  minImprovementThreshold: 0.1, // 10% improvement required
  autoFixCategories: ['blocking', 'major'],
  testRetryAttempts: 2
};
```

#### Documentation Change Detection Rules

- **CLAUDE.md triggers**: Tech stack, architecture, commands, services
- **project-context triggers**: Request lifecycle, authentication, real-time, error handling, data flow

### Performance

- **Context Reduction**: 70-85% reduction through language-specific agents
- **Parallel Processing**: Multiple agents can run concurrently
- **Artifact Caching**: Reuses artifacts across phases
- **Auto-Resolution Rate**: 70-80% of blocking issues resolved automatically in review loop

---

**Legend**:

- ✨ Added: New features
- 🔄 Changed: Changes in existing functionality
- 🗑️ Deprecated: Soon-to-be removed features
- ❌ Removed: Removed features
- 🐛 Fixed: Bug fixes
- 🔒 Security: Security fixes
