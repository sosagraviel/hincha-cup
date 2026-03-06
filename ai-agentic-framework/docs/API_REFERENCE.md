# AI Store - API Reference

**Version**: 1.0.0
**Last Updated**: 2026-03-06

Complete technical reference for all AI Store utilities and their programmatic APIs.

---

## Table of Contents

1. [Risk Assessment & Strategy](#risk-assessment--strategy)
2. [Planning & Decision Making](#planning--decision-making)
3. [Test Management](#test-management)
4. [Error Handling & Resilience](#error-handling--resilience)
5. [Documentation & Tracking](#documentation--tracking)
6. [Configuration](#configuration)
7. [Return Types](#return-types)
8. [Error Codes](#error-codes)

---

## Risk Assessment & Strategy

### `select-strategy.js`

Analyzes ticket complexity and selects appropriate implementation strategy.

#### Command Line

```bash
node ai-agentic-framework/utils/select-strategy.js \
  --ticket <TICKET_KEY> \
  --context <CONTEXT_PATH>
```

#### Programmatic API

```javascript
const { analyzeRisk, selectStrategy } = require('./ai-agentic-framework/utils/select-strategy.js');

// Analyze risk for a ticket
const riskAssessment = await analyzeRisk({
  ticketKey: 'PROJ-123',
  contextPath: '/path/to/ticket-context.json'
});

// Select implementation strategy
const strategy = selectStrategy(riskAssessment.riskScore);
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticketKey` | string | Yes | Jira ticket key (e.g., "PROJ-123") |
| `contextPath` | string | Yes | Path to ticket context JSON file |

#### Return Type: `RiskAssessment`

```typescript
interface RiskAssessment {
  ticketKey: string;
  riskScore: number;           // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  strategy: 'DIRECT' | 'PLAN_FIRST' | 'ARCHITECT';
  factors: {
    impact: {
      score: number;           // 0-100
      weight: number;          // 0.4 (40%)
      affectedSystems: string[];
      breakingChanges: boolean;
    };
    complexity: {
      score: number;           // 0-100
      weight: number;          // 0.3 (30%)
      technicalComplexity: string;
      technologiesInvolved: string[];
    };
    uncertainty: {
      score: number;           // 0-100
      weight: number;          // 0.3 (30%)
      ambiguousRequirements: boolean;
      unknownDependencies: string[];
    };
  };
  reasoning: string;
  mitigationSteps: string[];
  timestamp: string;           // ISO 8601
}
```

#### Risk Score Formula

```
Risk Score = (Impact × 40%) + (Complexity × 30%) + (Uncertainty × 30%)

Where:
- Impact Score = Systems Affected (40%) + Breaking Changes (40%) + User Impact (20%)
- Complexity Score = Technical Complexity (50%) + Technologies (30%) + File Count (20%)
- Uncertainty Score = Ambiguous Requirements (50%) + Unknown Dependencies (30%) + Estimation Difficulty (20%)
```

#### Strategy Selection Thresholds

| Risk Score | Risk Level | Strategy | Description |
|------------|------------|----------|-------------|
| 0-30 | LOW | DIRECT | Implement directly without planning |
| 31-70 | MEDIUM | PLAN_FIRST | Create plan, then implement |
| 71-89 | HIGH | ARCHITECT | Architecture review required |
| 90-100 | CRITICAL | ARCHITECT | Full architecture + security review |

#### Output Files

- `.claude/risk-assessments/{TICKET_KEY}-assessment.json` - Machine-readable assessment
- `.claude/risk-assessments/{TICKET_KEY}-assessment.md` - Human-readable report

#### Example

```javascript
const assessment = await analyzeRisk({
  ticketKey: 'PROJ-456',
  contextPath: './ticket-context.json'
});

console.log(assessment);
// {
//   ticketKey: 'PROJ-456',
//   riskScore: 45,
//   riskLevel: 'MEDIUM',
//   strategy: 'PLAN_FIRST',
//   factors: { ... },
//   reasoning: 'Medium complexity OAuth integration...',
//   mitigationSteps: ['Create detailed plan', 'Add integration tests', ...],
//   timestamp: '2026-03-06T10:30:00.000Z'
// }
```

---

## Planning & Decision Making

### `auto-plan.js`

Generates autonomous implementation plans with confidence-based auto-approval.

#### Command Line

```bash
node ai-agentic-framework/utils/auto-plan.js \
  --ticket <TICKET_KEY> \
  --context <CONTEXT_PATH> \
  [--project <PROJECT_PATH>]
```

#### Programmatic API

```javascript
const { generatePlan, calculateConfidence } = require('./ai-agentic-framework/utils/auto-plan.js');

// Generate implementation plan
const plan = await generatePlan({
  ticketKey: 'PROJ-123',
  contextPath: '/path/to/context.json',
  projectPath: process.cwd()
});

// Calculate confidence only
const confidence = calculateConfidence({
  context: ticketContext,
  requirements: extractedRequirements,
  projectPatterns: analyzedPatterns,
  riskAssessment: riskData,
  affectedSystems: detectedSystems
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `ticketKey` | string | Yes | - | Jira ticket key |
| `contextPath` | string | Yes | - | Path to ticket context JSON |
| `projectPath` | string | No | `process.cwd()` | Project root directory |

#### Return Type: `ImplementationPlan`

```typescript
interface ImplementationPlan {
  ticketKey: string;
  confidence: {
    score: number;              // 0-100
    approvalNeeded: boolean;    // false if score >= 80
    factors: {
      clearRequirements: number;    // 0-40 points
      knownTechStack: number;       // 0-30 points
      noBreakingChanges: number;    // 0-20 points
      lowRisk: number;              // 0-10 points
    };
  };
  requirements: {
    functional: string[];
    nonFunctional: string[];
    constraints: string[];
  };
  affectedSystems: {
    name: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    changes: string[];
  }[];
  fileChanges: {
    path: string;
    operation: 'CREATE' | 'MODIFY' | 'DELETE';
    purpose: string;
    estimatedLines: number;
  }[];
  implementationSteps: {
    phase: string;
    step: number;
    description: string;
    files: string[];
    dependencies: number[];      // Indices of dependent steps
    estimatedTime: string;
  }[];
  testStrategy: {
    unitTests: { file: string; coverage: string; }[];
    integrationTests: { file: string; scenario: string; }[];
    e2eTests: { file: string; userFlow: string; }[];
    coverageTarget: number;      // Percentage (e.g., 80)
  };
  successCriteria: {
    criterion: string;
    verification: string;
  }[];
  timestamp: string;
}
```

#### Confidence Calculation Formula

```
Confidence Score = Clear Requirements (40) + Known Tech Stack (30) + No Breaking Changes (20) + Low Risk (10)

Clear Requirements (0-40 points):
  - No ambiguous terms (must/should/could) → 20 points
  - 3+ specific requirements → 20 points

Known Tech Stack (0-30 points):
  - Project patterns detected → 15 points
  - 2+ affected systems identified → 15 points

No Breaking Changes (0-20 points):
  - No breaking change indicators → 20 points

Low Risk (0-10 points):
  - Risk level LOW → 10 points
  - Risk level MEDIUM → 5 points
  - Risk level HIGH/CRITICAL → 0 points
```

#### Auto-Approval Thresholds

| Confidence Score | Approval Status | Action |
|------------------|-----------------|--------|
| 80-100 | ✅ AUTO-APPROVED | Plan executed without user approval |
| 60-79 | ⚠️ NEEDS REVIEW | Plan generated but requires user review |
| 0-59 | ❌ MANUAL | Manual planning recommended |

#### Output Files

- `.claude/plans/{TICKET_KEY}-plan.json` - Machine-readable plan
- `.claude/plans/{TICKET_KEY}-plan.md` - Human-readable plan document

#### Example

```javascript
const plan = await generatePlan({
  ticketKey: 'PROJ-789',
  contextPath: './context.json'
});

console.log(plan.confidence);
// {
//   score: 95,
//   approvalNeeded: false,  // ← Auto-approved!
//   factors: {
//     clearRequirements: 40,
//     knownTechStack: 30,
//     noBreakingChanges: 20,
//     lowRisk: 5
//   }
// }

console.log(plan.implementationSteps.length);  // 12 steps
console.log(plan.fileChanges.length);          // 8 files
```

---

### `autonomous-decision.js`

Makes autonomous implementation decisions with confidence tracking.

#### Command Line

```bash
node ai-agentic-framework/utils/autonomous-decision.js \
  --ticket <TICKET_KEY> \
  --decision <DECISION_TYPE> \
  --context <CONTEXT_JSON> \
  [--options <OPTIONS_JSON>]
```

#### Programmatic API

```javascript
const { makeDecision, logDecision } = require('./ai-agentic-framework/utils/autonomous-decision.js');

// Make autonomous decision
const decision = await makeDecision({
  ticketKey: 'PROJ-123',
  decisionType: 'LIBRARY_SELECTION',
  context: {
    requirement: 'Date formatting library',
    options: ['date-fns', 'dayjs', 'moment']
  },
  options: {
    criteria: ['bundle size', 'tree-shakable', 'TypeScript support']
  }
});

// Log decision manually
await logDecision({
  ticketKey: 'PROJ-123',
  decision: 'Use date-fns for date formatting',
  reasoning: 'Smallest bundle size, tree-shakable, excellent TS support',
  confidence: 90,
  alternatives: ['dayjs', 'moment'],
  impact: 'LOW'
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticketKey` | string | Yes | Jira ticket key |
| `decisionType` | string | Yes | Type of decision (see types below) |
| `context` | object | Yes | Decision context data |
| `options` | object | No | Additional decision criteria |

#### Decision Types

| Type | Description | Example Context |
|------|-------------|-----------------|
| `LIBRARY_SELECTION` | Choose between libraries | `{ requirement, options }` |
| `ARCHITECTURE_PATTERN` | Select architectural pattern | `{ useCase, patterns }` |
| `API_DESIGN` | Design API endpoint | `{ resource, operations }` |
| `ERROR_HANDLING` | Choose error handling approach | `{ errorType, strategies }` |
| `TESTING_STRATEGY` | Select testing approach | `{ component, testTypes }` |
| `IMPLEMENTATION_APPROACH` | Choose implementation method | `{ requirement, approaches }` |

#### Return Type: `Decision`

```typescript
interface Decision {
  ticketKey: string;
  decisionType: string;
  decision: string;
  reasoning: string;
  confidence: number;          // 0-100
  alternatives: {
    option: string;
    pros: string[];
    cons: string[];
    score: number;
  }[];
  selectedOption: {
    option: string;
    pros: string[];
    cons: string[];
    score: number;
  };
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  reversible: boolean;
  timestamp: string;
}
```

#### Output Files

- `.claude/decisions/{TICKET_KEY}-decisions.json` - All decisions (array)
- `.claude/decisions/{TICKET_KEY}-decisions.md` - Human-readable log

#### Example

```javascript
const decision = await makeDecision({
  ticketKey: 'PROJ-999',
  decisionType: 'LIBRARY_SELECTION',
  context: {
    requirement: 'Form validation library',
    options: ['zod', 'yup', 'joi']
  },
  options: {
    criteria: ['TypeScript support', 'bundle size', 'schema inference']
  }
});

console.log(decision);
// {
//   ticketKey: 'PROJ-999',
//   decisionType: 'LIBRARY_SELECTION',
//   decision: 'Use zod for form validation',
//   reasoning: 'Best TypeScript integration, schema inference, smallest bundle',
//   confidence: 92,
//   selectedOption: { option: 'zod', pros: [...], cons: [...], score: 92 },
//   alternatives: [
//     { option: 'yup', pros: [...], cons: [...], score: 78 },
//     { option: 'joi', pros: [...], cons: [...], score: 65 }
//   ],
//   impact: 'MEDIUM',
//   reversible: true,
//   timestamp: '2026-03-06T11:00:00.000Z'
// }
```

---

### `log-assumption.js`

Tracks assumptions made during autonomous implementation.

#### Command Line

```bash
node ai-agentic-framework/utils/log-assumption.js \
  --ticket <TICKET_KEY> \
  --assumption <ASSUMPTION_TEXT> \
  --risk <LOW|MEDIUM|HIGH> \
  [--validation <VALIDATION_PLAN>]
```

#### Programmatic API

```javascript
const { logAssumption, getAssumptions } = require('./ai-agentic-framework/utils/log-assumption.js');

// Log new assumption
await logAssumption({
  ticketKey: 'PROJ-123',
  assumption: 'User authentication is handled by Keycloak',
  risk: 'LOW',
  validation: 'Verify auth middleware exists',
  category: 'ARCHITECTURE'
});

// Get all assumptions for ticket
const assumptions = await getAssumptions('PROJ-123');
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ticketKey` | string | Yes | Jira ticket key |
| `assumption` | string | Yes | Assumption description |
| `risk` | string | Yes | Risk level: LOW, MEDIUM, HIGH |
| `validation` | string | No | How to validate assumption |
| `category` | string | No | Assumption category |

#### Assumption Categories

| Category | Description | Example |
|----------|-------------|---------|
| `ARCHITECTURE` | System design assumptions | "Service uses REST API" |
| `BUSINESS_LOGIC` | Business rule assumptions | "Users can have multiple roles" |
| `TECHNICAL` | Technical implementation | "Database supports transactions" |
| `INTEGRATION` | External system assumptions | "Payment gateway uses webhook" |
| `SECURITY` | Security-related assumptions | "API requires JWT token" |
| `PERFORMANCE` | Performance assumptions | "Table has <1M rows" |

#### Risk Levels

| Risk | Description | Action Required |
|------|-------------|-----------------|
| `LOW` | Safe assumption, minimal impact | Document only |
| `MEDIUM` | Should be validated | Add validation step to PR |
| `HIGH` | Must be validated before merge | Require explicit validation |

#### Return Type: `Assumption`

```typescript
interface Assumption {
  id: string;                  // UUID
  ticketKey: string;
  assumption: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  validation: string | null;
  category: string;
  validated: boolean;
  validationResult: string | null;
  timestamp: string;
}
```

#### Output Files

- `.claude/assumptions/{TICKET_KEY}-assumptions.json` - All assumptions (array)
- `.claude/assumptions/{TICKET_KEY}-assumptions.md` - Human-readable log

#### Example

```javascript
await logAssumption({
  ticketKey: 'PROJ-111',
  assumption: 'Email notifications are sent via SendGrid',
  risk: 'MEDIUM',
  validation: 'Check environment variables for SENDGRID_API_KEY',
  category: 'INTEGRATION'
});

const assumptions = await getAssumptions('PROJ-111');
console.log(assumptions.filter(a => a.risk === 'HIGH'));
// [ { assumption: 'Database migration is backward compatible', ... } ]
```

---

## Test Management

### `smart-test-selection.js`

Intelligently selects tests to run based on code changes.

#### Command Line

```bash
node ai-agentic-framework/utils/smart-test-selection.js \
  --base <BASE_COMMIT> \
  --head <HEAD_COMMIT> \
  [--ticket <TICKET_KEY>] \
  [--project <PROJECT_PATH>]
```

#### Programmatic API

```javascript
const { selectTests, buildDependencyGraph } = require('./ai-agentic-framework/utils/smart-test-selection.js');

// Select tests based on changes
const selection = await selectTests({
  baseCommit: 'origin/main',
  headCommit: 'HEAD',
  ticketKey: 'PROJ-123',
  projectPath: process.cwd()
});

// Build dependency graph only
const graph = await buildDependencyGraph(changedFiles, allTestFiles, projectPath);
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `baseCommit` | string | Yes | - | Base commit/branch (e.g., "origin/main") |
| `headCommit` | string | Yes | - | Head commit/branch (e.g., "HEAD") |
| `ticketKey` | string | No | - | Jira ticket key for logging |
| `projectPath` | string | No | `process.cwd()` | Project root directory |

#### Return Type: `TestSelection`

```typescript
interface TestSelection {
  changedFiles: {
    backend: string[];
    frontend: string[];
    shared: string[];
    config: string[];
    other: string[];
  };
  testSelection: {
    critical: {
      file: string;
      priority: 'critical';
      reason: string;
    }[];
    related: {
      file: string;
      priority: 'related';
      reason: string;
    }[];
    unrelated: {
      file: string;
      priority: 'unrelated';
      reason: string;
    }[];
  };
  summary: {
    totalTests: number;
    criticalTests: number;
    relatedTests: number;
    unrelatedTests: number;
    estimatedTimeReduction: string;  // e.g., "45%"
  };
  timestamp: string;
}
```

#### Test Priority Levels

| Priority | Description | Should Run | Reason Examples |
|----------|-------------|------------|-----------------|
| `critical` | Must run | ✅ Always | Test file modified, tests changed file, integration test for affected system |
| `related` | Recommended | ✅ Usually | Tests file importing changed file, shared package changed |
| `unrelated` | Can skip | ⏭️ Skip | No connection to changed files |

#### Priority Determination Logic

```javascript
// CRITICAL: Test file itself was changed
if (changedFiles.includes(testFile)) return 'critical';

// CRITICAL: Test directly tests a changed file
const testedSources = dependencyGraph.testToSources[testFile] || [];
if (testedSources.some(source => changedFiles.includes(source))) return 'critical';

// CRITICAL: Integration test and backend files changed
if (testFile.includes('integration/') && hasBackendChanges) return 'critical';

// CRITICAL: E2E test and frontend files changed
if (testFile.includes('e2e/') && hasFrontendChanges) return 'critical';

// RELATED: Tests file that imports a changed file
const imports = dependencyGraph.sourceToTests[changedFile] || [];
if (imports.includes(testFile)) return 'related';

// RELATED: Shared package changed
if (hasSharedPackageChanges) return 'related';

// UNRELATED: No connection
return 'unrelated';
```

#### Output Files

- `.claude/test-selection/{TICKET_KEY}-tests.json` - Test selection data
- `.claude/test-selection/{TICKET_KEY}-tests.md` - Human-readable report

#### Example

```javascript
const selection = await selectTests({
  baseCommit: 'origin/main',
  headCommit: 'HEAD',
  ticketKey: 'PROJ-222'
});

console.log(selection.summary);
// {
//   totalTests: 45,
//   criticalTests: 12,
//   relatedTests: 8,
//   unrelatedTests: 25,
//   estimatedTimeReduction: '56%'  // Skipping 25/45 tests
// }

// Run only critical tests
const testsToRun = selection.testSelection.critical.map(t => t.file);
// ['services/backend/test/auth.service.spec.ts', ...]
```

---

### `self-healing-tests.js`

Automatically fixes common test failures.

#### Command Line

```bash
node ai-agentic-framework/utils/self-healing-tests.js \
  --test-output <TEST_OUTPUT_FILE> \
  --project <PROJECT_PATH>
```

#### Programmatic API

```javascript
const { healTests, detectFailurePattern } = require('./ai-agentic-framework/utils/self-healing-tests.js');

// Heal test failures
const result = await healTests({
  testOutputPath: '/path/to/test-output.txt',
  projectPath: process.cwd()
});

// Detect failure pattern only
const pattern = detectFailurePattern(errorMessage);
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `testOutputPath` | string | Yes | - | Path to test output/log file |
| `projectPath` | string | No | `process.cwd()` | Project root directory |

#### Supported Failure Patterns

| Pattern | Detection | Auto-Fix Action |
|---------|-----------|-----------------|
| **Import Path** | `Cannot find module`, `Module not found` | Fix relative/absolute paths |
| **Async/Await** | `Promise rejected`, `Timeout exceeded` | Add await, increase timeout |
| **Mock Setup** | `undefined is not a function`, `jest.mock` | Fix mock configuration |
| **Snapshot Mismatch** | `Snapshot mismatch`, `1 snapshot failed` | Update snapshots |
| **Type Error** | `Property 'x' does not exist`, `Type 'X' is not assignable` | Add type assertions, fix types |
| **Environment** | `ReferenceError: process`, `window is not defined` | Add environment setup |
| **Database** | `Connection refused`, `Table does not exist` | Run migrations, seed data |
| **Flaky Test** | Random failures | Add retry logic, fix race conditions |

#### Return Type: `HealingResult`

```typescript
interface HealingResult {
  healed: boolean;
  pattern: string | null;
  fixes: {
    file: string;
    line: number;
    before: string;
    after: string;
    description: string;
  }[];
  failedTests: {
    file: string;
    testName: string;
    error: string;
  }[];
  retryRecommended: boolean;
  retryCount: number;
  timestamp: string;
}
```

#### Example

```javascript
// Test output file contains:
// Error: Cannot find module '../services/auth'
//   at /project/test/auth.spec.ts:5:1

const result = await healTests({
  testOutputPath: './test-output.txt'
});

console.log(result);
// {
//   healed: true,
//   pattern: 'IMPORT_PATH',
//   fixes: [
//     {
//       file: 'test/auth.spec.ts',
//       line: 5,
//       before: "import { AuthService } from '../services/auth';",
//       after: "import { AuthService } from '../src/services/auth';",
//       description: 'Fixed import path (added src/)'
//     }
//   ],
//   failedTests: [...],
//   retryRecommended: true,
//   retryCount: 1,
//   timestamp: '2026-03-06T12:00:00.000Z'
// }
```

---

## Error Handling & Resilience

### `error-handler.js`

Centralized error handling with context-aware recovery strategies.

#### Command Line

```bash
node ai-agentic-framework/utils/error-handler.js \
  --error <ERROR_JSON> \
  --context <CONTEXT_JSON>
```

#### Programmatic API

```javascript
const { handleError, classifyError, suggestFix } = require('./ai-agentic-framework/utils/error-handler.js');

// Handle error with context
const recovery = await handleError({
  error: error,
  context: {
    operation: 'BUILD',
    ticketKey: 'PROJ-123',
    component: 'backend'
  }
});

// Classify error only
const classification = classifyError(error);

// Get fix suggestion
const fix = suggestFix(error, context);
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `error` | Error | Yes | Error object or error message |
| `context` | object | Yes | Operation context (operation, ticketKey, component) |

#### Error Classifications

| Category | Detection | Recovery Strategy |
|----------|-----------|-------------------|
| **NETWORK** | `ECONNREFUSED`, `ETIMEDOUT`, `fetch failed` | Retry with backoff (3 attempts) |
| **BUILD** | Compilation errors, lint errors | Run format/lint fix, check dependencies |
| **TEST** | Test failures | Self-healing tests, update snapshots |
| **DATABASE** | Connection errors, migration errors | Restart DB, run migrations |
| **AUTH** | 401, 403, token expired | Refresh token, re-authenticate |
| **DEPENDENCY** | Module not found, version conflict | Run install, check lock file |
| **SYNTAX** | Syntax errors, parse errors | Run formatter, check for typos |
| **TIMEOUT** | Timeout exceeded | Increase timeout, optimize operation |

#### Return Type: `ErrorRecovery`

```typescript
interface ErrorRecovery {
  error: {
    message: string;
    stack: string;
    code: string | null;
  };
  classification: {
    category: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    recoverable: boolean;
  };
  suggestion: {
    action: string;
    command: string | null;
    autoFixable: boolean;
    confidence: number;         // 0-100
  };
  recovery: {
    attempted: boolean;
    success: boolean;
    steps: string[];
    error: string | null;
  };
  timestamp: string;
}
```

#### Example

```javascript
try {
  await buildProject();
} catch (error) {
  const recovery = await handleError({
    error,
    context: {
      operation: 'BUILD',
      ticketKey: 'PROJ-333',
      component: 'frontend'
    }
  });

  if (recovery.recovery.success) {
    console.log('Auto-recovered!');
    // Retry build
    await buildProject();
  } else {
    console.error('Manual intervention required:', recovery.suggestion.action);
  }
}
```

---

### `retry-with-backoff.js`

Retry operations with exponential backoff and jitter.

#### Command Line

```bash
# Not typically used from CLI
```

#### Programmatic API

```javascript
const { retryWithBackoff } = require('./ai-agentic-framework/utils/retry-with-backoff.js');

// Retry async operation
const result = await retryWithBackoff(
  async () => {
    return await fetchDataFromAPI();
  },
  {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt} after error:`, error.message);
    }
  }
);
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `operation` | Function | Yes | - | Async function to retry |
| `options` | object | No | See below | Retry configuration |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | 3 | Maximum retry attempts |
| `initialDelay` | number | 1000 | Initial delay in ms |
| `maxDelay` | number | 30000 | Maximum delay in ms |
| `backoffMultiplier` | number | 2 | Delay multiplier (exponential) |
| `jitter` | boolean | true | Add random jitter to delays |
| `shouldRetry` | Function | `() => true` | Custom retry condition |
| `onRetry` | Function | `() => {}` | Callback on each retry |

#### Backoff Calculation

```javascript
// Without jitter
delay = min(initialDelay * (backoffMultiplier ^ attempt), maxDelay)

// With jitter (default)
delay = min(initialDelay * (backoffMultiplier ^ attempt), maxDelay) * (0.5 + random(0, 0.5))

// Example progression (initialDelay=1000, multiplier=2):
// Attempt 1: 1000ms  * jitter(0.5-1.0) = 500-1000ms
// Attempt 2: 2000ms  * jitter(0.5-1.0) = 1000-2000ms
// Attempt 3: 4000ms  * jitter(0.5-1.0) = 2000-4000ms
// Attempt 4: 8000ms  * jitter(0.5-1.0) = 4000-8000ms
// Attempt 5: 16000ms * jitter(0.5-1.0) = 8000-16000ms
```

#### Example

```javascript
// Retry API call with custom retry logic
const data = await retryWithBackoff(
  async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  {
    maxRetries: 5,
    initialDelay: 2000,
    shouldRetry: (error) => {
      // Don't retry on 4xx errors (client errors)
      if (error.message.includes('HTTP 4')) return false;
      return true;
    },
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt}/5 after ${error.message}`);
    }
  }
);
```

---

## Documentation & Tracking

### `detect-doc-updates.js`

Detects code changes requiring documentation updates.

#### Command Line

```bash
node ai-agentic-framework/utils/detect-doc-updates.js \
  --base <BASE_COMMIT> \
  --head <HEAD_COMMIT> \
  [--ticket <TICKET_KEY>]
```

#### Programmatic API

```javascript
const { detectDocumentationNeeds } = require('./ai-agentic-framework/utils/detect-doc-updates.js');

// Detect documentation needs
const needs = await detectDocumentationNeeds({
  baseCommit: 'origin/main',
  headCommit: 'HEAD',
  ticketKey: 'PROJ-123'
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `baseCommit` | string | Yes | - | Base commit/branch |
| `headCommit` | string | Yes | - | Head commit/branch |
| `ticketKey` | string | No | - | Jira ticket key for logging |

#### Detection Patterns

| Pattern | Trigger Files | Suggested Documentation |
|---------|---------------|------------------------|
| **API Changes** | Controllers, routes, endpoints | API documentation, OpenAPI spec |
| **Database Schema** | Migrations, entities, models | Schema diagram, migration guide |
| **New Features** | New modules, major components | User guide, feature documentation |
| **Configuration** | Config files, environment vars | Configuration reference |
| **Breaking Changes** | Major version changes, API removals | Migration guide, changelog |
| **Security** | Auth changes, permissions | Security documentation |
| **Dependencies** | package.json, requirements.txt | Dependency update log |

#### Return Type: `DocumentationNeeds`

```typescript
interface DocumentationNeeds {
  required: {
    category: string;
    reason: string;
    suggestedDocs: string[];
    affectedFiles: string[];
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }[];
  optional: {
    category: string;
    reason: string;
    suggestedDocs: string[];
  }[];
  summary: {
    totalChanges: number;
    requiredUpdates: number;
    optionalUpdates: number;
    highPriority: number;
  };
  timestamp: string;
}
```

#### Output Files

- `.claude/documentation-updates/{TICKET_KEY}-docs.json` - Documentation needs data
- `.claude/documentation-updates/{TICKET_KEY}-docs.md` - Human-readable report

#### Example

```javascript
const needs = await detectDocumentationNeeds({
  baseCommit: 'origin/main',
  headCommit: 'HEAD',
  ticketKey: 'PROJ-444'
});

console.log(needs.required);
// [
//   {
//     category: 'API_CHANGES',
//     reason: 'New REST endpoint added: POST /api/notifications',
//     suggestedDocs: ['API_REFERENCE.md', 'openapi.yaml'],
//     affectedFiles: ['notifications.controller.ts'],
//     priority: 'HIGH'
//   },
//   {
//     category: 'DATABASE_SCHEMA',
//     reason: 'Migration adds notifications table',
//     suggestedDocs: ['DATABASE_SCHEMA.md', 'migrations/README.md'],
//     affectedFiles: ['1234567890-create-notifications.ts'],
//     priority: 'MEDIUM'
//   }
// ]
```

---

### `calculate-accuracy.js`

Calculates implementation accuracy metrics against plan.

#### Command Line

```bash
node ai-agentic-framework/utils/calculate-accuracy.js \
  --plan <PLAN_PATH> \
  --implementation <IMPL_PATH> \
  --ticket <TICKET_KEY>
```

#### Programmatic API

```javascript
const { calculateAccuracy } = require('./ai-agentic-framework/utils/calculate-accuracy.js');

// Calculate accuracy
const accuracy = await calculateAccuracy({
  planPath: '.claude/plans/PROJ-123-plan.json',
  implementationPath: '.claude/implementation/PROJ-123-impl.json',
  ticketKey: 'PROJ-123'
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `planPath` | string | Yes | Path to plan JSON file |
| `implementationPath` | string | Yes | Path to implementation data |
| `ticketKey` | string | Yes | Jira ticket key |

#### Return Type: `AccuracyMetrics`

```typescript
interface AccuracyMetrics {
  ticketKey: string;
  overall: number;                // 0-100
  breakdown: {
    fileChanges: {
      planned: number;
      actual: number;
      matched: number;
      accuracy: number;           // 0-100
      deviations: {
        file: string;
        expected: string;
        actual: string;
      }[];
    };
    requirements: {
      total: number;
      implemented: number;
      accuracy: number;            // 0-100
      missing: string[];
    };
    testCoverage: {
      target: number;              // Percentage
      actual: number;              // Percentage
      met: boolean;
    };
    timeline: {
      estimated: string;           // e.g., "2 hours"
      actual: string;              // e.g., "1.5 hours"
      variance: number;            // Percentage
    };
  };
  deviationReasons: {
    reason: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    count: number;
  }[];
  timestamp: string;
}
```

#### Example

```javascript
const accuracy = await calculateAccuracy({
  planPath: '.claude/plans/PROJ-555-plan.json',
  implementationPath: '.claude/implementation/PROJ-555-impl.json',
  ticketKey: 'PROJ-555'
});

console.log(accuracy.overall);  // 94
console.log(accuracy.breakdown);
// {
//   fileChanges: { planned: 8, actual: 9, matched: 8, accuracy: 89, ... },
//   requirements: { total: 5, implemented: 5, accuracy: 100, missing: [] },
//   testCoverage: { target: 80, actual: 87, met: true },
//   timeline: { estimated: '3 hours', actual: '2.8 hours', variance: -7 }
// }
```

---

## Configuration

### Environment Variables

All utilities respect these environment variables:

```bash
# Core Configuration
PROJECT_ROOT=/path/to/project              # Project root directory
JIRA_BASE_URL=https://jira.company.com     # Jira instance URL
JIRA_API_TOKEN=xxx                         # Jira API token
GITHUB_TOKEN=xxx                           # GitHub API token

# Risk Assessment Thresholds
RISK_THRESHOLD_LOW=30                      # 0-30 = LOW risk
RISK_THRESHOLD_MEDIUM=70                   # 31-70 = MEDIUM risk
RISK_THRESHOLD_HIGH=89                     # 71-89 = HIGH risk
# 90-100 = CRITICAL (implicit)

# Planning Confidence Thresholds
CONFIDENCE_AUTO_APPROVE=80                 # >= 80 = auto-approve
CONFIDENCE_NEEDS_REVIEW=60                 # 60-79 = needs review
# < 60 = manual planning (implicit)

# Test Selection
TEST_SELECTION_SKIP_UNRELATED=true         # Skip unrelated tests
TEST_SELECTION_RUN_RELATED=true            # Run related tests

# Self-Healing Tests
SELF_HEAL_MAX_ATTEMPTS=3                   # Max auto-fix attempts
SELF_HEAL_SNAPSHOT_UPDATE=true             # Auto-update snapshots

# Retry Configuration
RETRY_MAX_ATTEMPTS=5                       # Max retry attempts
RETRY_INITIAL_DELAY=1000                   # Initial delay (ms)
RETRY_MAX_DELAY=30000                      # Max delay (ms)
RETRY_BACKOFF_MULTIPLIER=2                 # Exponential multiplier

# Error Handling
ERROR_AUTO_RECOVERY=true                   # Enable auto-recovery
ERROR_LOG_LEVEL=info                       # Log level (debug|info|warn|error)

# Documentation Detection
DOC_DETECTION_ENABLED=true                 # Enable doc detection
DOC_DETECTION_STRICT=false                 # Strict mode (fail on missing docs)

# Output Configuration
OUTPUT_FORMAT=json                         # Output format (json|yaml|markdown)
OUTPUT_VERBOSE=false                       # Verbose output
```

### Configuration Files

Utilities look for configuration in this order:

1. `.ai-agentic-framework.config.js` (project root)
2. `ai-agentic-framework/config.json` (package config)
3. Environment variables
4. Default values

#### Example `.ai-agentic-framework.config.js`

```javascript
module.exports = {
  risk: {
    thresholds: {
      low: 30,
      medium: 70,
      high: 89
    },
    weights: {
      impact: 0.4,
      complexity: 0.3,
      uncertainty: 0.3
    }
  },
  planning: {
    confidence: {
      autoApprove: 80,
      needsReview: 60
    },
    factors: {
      clearRequirements: 40,
      knownTechStack: 30,
      noBreakingChanges: 20,
      lowRisk: 10
    }
  },
  testing: {
    selection: {
      skipUnrelated: true,
      runRelated: true
    },
    selfHealing: {
      enabled: true,
      maxAttempts: 3,
      snapshotUpdate: true
    },
    coverage: {
      target: 80,
      strict: false
    }
  },
  retry: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  },
  documentation: {
    detection: {
      enabled: true,
      strict: false,
      patterns: [
        'API_CHANGES',
        'DATABASE_SCHEMA',
        'NEW_FEATURES',
        'BREAKING_CHANGES'
      ]
    }
  }
};
```

---

## Return Types

### Common Types

All utilities share these common types:

```typescript
// Base response type
interface BaseResponse {
  success: boolean;
  timestamp: string;           // ISO 8601
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

// File change representation
interface FileChange {
  path: string;
  operation: 'CREATE' | 'MODIFY' | 'DELETE';
  purpose?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

// Risk levels
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Priority levels
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Strategy types
type Strategy = 'DIRECT' | 'PLAN_FIRST' | 'ARCHITECT';

// Test priority
type TestPriority = 'critical' | 'related' | 'unrelated';
```

---

## Error Codes

All utilities use standardized error codes:

| Code | Category | Description | Recoverable |
|------|----------|-------------|-------------|
| `ERR_VALIDATION` | Input Validation | Invalid parameters | No |
| `ERR_FILE_NOT_FOUND` | File System | Required file missing | No |
| `ERR_PARSE` | Parsing | JSON/YAML parse error | No |
| `ERR_NETWORK` | Network | Network request failed | Yes |
| `ERR_TIMEOUT` | Timeout | Operation timeout | Yes |
| `ERR_BUILD` | Build | Build/compilation failed | Yes |
| `ERR_TEST` | Testing | Test execution failed | Yes |
| `ERR_DATABASE` | Database | Database operation failed | Yes |
| `ERR_AUTH` | Authentication | Authentication failed | Yes |
| `ERR_PERMISSION` | Authorization | Permission denied | No |
| `ERR_DEPENDENCY` | Dependencies | Dependency issue | Yes |
| `ERR_UNKNOWN` | Unknown | Unexpected error | Maybe |

### Error Response Format

```typescript
interface ErrorResponse extends BaseResponse {
  success: false;
  error: {
    code: string;              // Error code (see table above)
    message: string;           // Human-readable message
    details?: {
      file?: string;           // File where error occurred
      line?: number;           // Line number
      stack?: string;          // Stack trace
      context?: any;           // Additional context
    };
    recoverable: boolean;      // Can auto-recover
    suggestion?: string;       // Recovery suggestion
  };
}
```

### Example Error

```javascript
{
  success: false,
  timestamp: '2026-03-06T13:00:00.000Z',
  error: {
    code: 'ERR_BUILD',
    message: 'TypeScript compilation failed',
    details: {
      file: 'src/services/auth.service.ts',
      line: 42,
      stack: 'Error: TS2345: Argument of type...',
      context: { errors: 3, warnings: 0 }
    },
    recoverable: true,
    suggestion: 'Run "pnpm format" to fix formatting issues'
  }
}
```

---

## Integration Examples

### Complete Autonomous Workflow

```javascript
const { analyzeRisk } = require('./ai-agentic-framework/utils/select-strategy.js');
const { generatePlan } = require('./ai-agentic-framework/utils/auto-plan.js');
const { selectTests } = require('./ai-agentic-framework/utils/smart-test-selection.js');
const { healTests } = require('./ai-agentic-framework/utils/self-healing-tests.js');
const { logAssumption } = require('./ai-agentic-framework/utils/log-assumption.js');
const { handleError } = require('./ai-agentic-framework/utils/error-handler.js');
const { retryWithBackoff } = require('./ai-agentic-framework/utils/retry-with-backoff.js');

async function autonomousImplementation(ticketKey, contextPath) {
  try {
    // 1. Risk Assessment
    const risk = await analyzeRisk({ ticketKey, contextPath });
    console.log(`Risk: ${risk.riskLevel}, Strategy: ${risk.strategy}`);

    // 2. Autonomous Planning
    const plan = await generatePlan({ ticketKey, contextPath });

    if (plan.confidence.approvalNeeded) {
      console.log('Manual approval required');
      return;
    }

    console.log(`Auto-approved! Confidence: ${plan.confidence.score}%`);

    // 3. Log Assumptions
    await logAssumption({
      ticketKey,
      assumption: 'Using existing auth middleware',
      risk: 'LOW',
      category: 'ARCHITECTURE'
    });

    // 4. Implementation (with retry)
    await retryWithBackoff(
      async () => {
        // Implement changes...
        await implementChanges(plan.fileChanges);
      },
      { maxRetries: 3 }
    );

    // 5. Smart Test Selection
    const tests = await selectTests({
      baseCommit: 'origin/main',
      headCommit: 'HEAD',
      ticketKey
    });

    console.log(`Running ${tests.summary.criticalTests} critical tests...`);

    // 6. Run Tests (with self-healing)
    let testsPassed = false;
    let attempts = 0;

    while (!testsPassed && attempts < 3) {
      const testResult = await runTests(tests.testSelection.critical);

      if (!testResult.success) {
        // Self-heal
        const healing = await healTests({
          testOutputPath: testResult.outputPath
        });

        if (healing.healed) {
          console.log('Tests auto-fixed!');
          attempts++;
          continue;
        } else {
          throw new Error('Test healing failed');
        }
      }

      testsPassed = true;
    }

    // 7. Create PR
    console.log('All tests passed! Creating PR...');
    await createPR(ticketKey, plan);

    return { success: true, ticketKey, plan, tests };

  } catch (error) {
    // Error handling with recovery
    const recovery = await handleError({
      error,
      context: { operation: 'IMPLEMENTATION', ticketKey }
    });

    if (recovery.recovery.success) {
      console.log('Auto-recovered! Retrying...');
      return autonomousImplementation(ticketKey, contextPath);
    } else {
      throw error;
    }
  }
}

// Run autonomous implementation
autonomousImplementation('PROJ-999', './ticket-context.json')
  .then(result => console.log('Success!', result))
  .catch(error => console.error('Failed:', error));
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-06 | Initial API reference release |

---

## Support

For issues, questions, or contributions:

- **GitHub Issues**: https://github.com/your-org/ai-agentic-framework/issues
- **Documentation**: `ai-agentic-framework/docs/USER_GUIDE.md`
- **Examples**: `ai-agentic-framework/examples/`

---

**End of API Reference**
