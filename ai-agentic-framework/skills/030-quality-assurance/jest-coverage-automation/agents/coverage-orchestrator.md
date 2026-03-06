# Coverage Orchestrator Agent

Master coordinator for the automated test coverage improvement workflow. Manages the test-analyze-generate-validate loop until coverage thresholds are met.

## Role

The Coverage Orchestrator Agent is the "conductor" of the test generation symphony. It coordinates the Test Analyzer and Test Writer agents, validates generated tests, tracks progress, and iterates until coverage goals are achieved.

## Capabilities

### 1. Workflow Coordination

**Main Loop:**
```typescript
async function orchestrateCoverageImprovement(config: OrchestratorConfig) {
  let iteration = 0;
  const maxIterations = config.maxIterations || 10;

  while (iteration < maxIterations) {
    // Step 1: Analyze current coverage
    const analysis = await runTestAnalyzer(config);

    // Step 2: Check if thresholds met
    if (meetsThresholds(analysis.summary, config.thresholds)) {
      return { status: 'success', iterations: iteration };
    }

    // Step 3: Generate tests for gaps
    const tests = await generateTestsForGaps(analysis.prioritizedFiles);

    // Step 4: Validate and filter tests
    const validTests = await validateAndFilterTests(tests);

    // Step 5: Run tests and measure coverage
    const newCoverage = await runTestsAndMeasure(validTests);

    // Step 6: Keep only tests that increased coverage
    await keepCoverageImprovingTests(validTests, newCoverage);

    iteration++;
  }

  return { status: 'max_iterations_reached', iterations: iteration };
}
```

### 2. Test Validation Pipeline

**Four-Stage Filter (Meta's TestGen-LLM approach):**

```typescript
interface ValidationPipeline {
  build: (test: GeneratedTest) => Promise<boolean>;
  run: (test: GeneratedTest) => Promise<boolean>;
  pass: (test: GeneratedTest) => Promise<boolean>;
  coverage: (test: GeneratedTest) => Promise<CoverageIncrease>;
}

async function validateTest(test: GeneratedTest): Promise<ValidationResult> {
  // Filter 1: Does it compile?
  const buildResult = await validateBuild(test);
  if (!buildResult.success) {
    return { valid: false, reason: 'build_failed', details: buildResult.errors };
  }

  // Filter 2: Does it run without errors?
  const runResult = await validateRun(test);
  if (!runResult.success) {
    return { valid: false, reason: 'run_failed', details: runResult.errors };
  }

  // Filter 3: Do all test cases pass?
  const passResult = await validatePass(test);
  if (!passResult.success) {
    return { valid: false, reason: 'tests_failed', details: passResult.failures };
  }

  // Filter 4: Does it increase coverage?
  const coverageResult = await validateCoverageIncrease(test);
  if (coverageResult.increase <= 0) {
    return { valid: false, reason: 'no_coverage_increase', details: coverageResult };
  }

  return {
    valid: true,
    coverageIncrease: coverageResult,
    metadata: { build: buildResult, run: runResult, pass: passResult }
  };
}
```

### 3. Coverage Measurement

**Precise Coverage Tracking:**
```typescript
async function measureCoverageIncrease(
  testFile: string,
  targetFile: string
): Promise<CoverageIncrease> {
  // Get baseline coverage
  const before = await runCoverage({ exclude: testFile });
  const baselineCoverage = before.files[targetFile];

  // Run with new test
  const after = await runCoverage({ include: testFile });
  const newCoverage = after.files[targetFile];

  // Calculate delta
  return {
    lines: newCoverage.lines.pct - baselineCoverage.lines.pct,
    statements: newCoverage.statements.pct - baselineCoverage.statements.pct,
    branches: newCoverage.branches.pct - baselineCoverage.branches.pct,
    functions: newCoverage.functions.pct - baselineCoverage.functions.pct,
    newlyTestedLines: calculateNewLines(baselineCoverage, newCoverage)
  };
}
```

### 4. Progress Tracking

**State Management:**
```typescript
interface OrchestrationState {
  startTime: Date;
  iterations: number;
  filesProcessed: Set<string>;
  testsGenerated: number;
  testsValid: number;
  testsAccepted: number;
  coverageHistory: CoverageSnapshot[];
  currentCoverage: CoverageMetrics;
  targetCoverage: CoverageThresholds;
}

function trackProgress(state: OrchestrationState): ProgressReport {
  return {
    percentComplete: calculateCompletion(state),
    estimatedTimeRemaining: estimateTimeRemaining(state),
    coverageGains: calculateGains(state.coverageHistory),
    acceptanceRate: state.testsAccepted / state.testsGenerated,
    filesRemaining: estimateFilesRemaining(state)
  };
}
```

### 5. Adaptive Strategy

**Learning from Failures:**
```typescript
interface StrategyAdaptation {
  // Adjust test generation based on validation results
  adaptStrategy(results: ValidationResult[]): GenerationStrategy;

  // Focus on high-impact targets
  prioritizeHighImpact(files: PrioritizedFile[]): PrioritizedFile[];

  // Skip problematic patterns
  avoidFailurePatterns(patterns: FailurePattern[]): void;
}

function adaptStrategy(results: ValidationResult[]): void {
  const failures = results.filter(r => !r.valid);

  // If many build failures, simplify generated code
  const buildFailureRate = failures.filter(f => f.reason === 'build_failed').length / results.length;
  if (buildFailureRate > 0.5) {
    config.simplifyGeneration = true;
  }

  // If many coverage failures, refocus on different lines
  const noCoverageRate = failures.filter(f => f.reason === 'no_coverage_increase').length / results.length;
  if (noCoverageRate > 0.5) {
    config.regenerateCoverageTargets = true;
  }
}
```

## Workflow

### Phase 1: Initialization

```typescript
async function initialize(config: OrchestratorConfig): Promise<OrchestrationState> {
  // Validate configuration
  validateConfig(config);

  // Ensure project setup
  await ensureJestConfigured();
  await ensureDependenciesInstalled();

  // Run initial coverage
  const initialCoverage = await runInitialCoverage();

  // Initialize state
  return {
    startTime: new Date(),
    iterations: 0,
    filesProcessed: new Set(),
    testsGenerated: 0,
    testsValid: 0,
    testsAccepted: 0,
    coverageHistory: [initialCoverage],
    currentCoverage: initialCoverage.summary,
    targetCoverage: config.thresholds
  };
}
```

### Phase 2: Iteration Loop

```typescript
async function iterate(state: OrchestrationState): Promise<IterationResult> {
  console.log(`\n🔄 Iteration ${state.iterations + 1}`);

  // Step 1: Analyze gaps
  console.log('📊 Analyzing coverage gaps...');
  const analysis = await invokeTestAnalyzer({
    currentCoverage: state.currentCoverage,
    processedFiles: Array.from(state.filesProcessed)
  });

  // Step 2: Select targets
  const targets = selectTargets(analysis, state);
  if (targets.length === 0) {
    return { status: 'no_targets', message: 'No testable gaps remaining' };
  }

  console.log(`🎯 Selected ${targets.length} targets for test generation`);

  // Step 3: Generate tests
  console.log('✍️  Generating tests...');
  const generatedTests = [];
  for (const target of targets) {
    const tests = await invokeTestWriter({
      targetFile: target.path,
      uncoveredLines: target.uncoveredLines,
      uncoveredFunctions: target.uncoveredFunctions,
      testType: determineTestType(target)
    });
    generatedTests.push(...tests);
    state.testsGenerated += tests.length;
  }

  // Step 4: Validate tests
  console.log('🔍 Validating generated tests...');
  const validationResults = [];
  for (const test of generatedTests) {
    const result = await validateTest(test);
    validationResults.push(result);
    if (result.valid) {
      state.testsValid++;
    }
  }

  // Step 5: Accept coverage-improving tests
  const acceptedTests = validationResults.filter(r => r.valid);
  state.testsAccepted += acceptedTests.length;

  for (const test of acceptedTests) {
    await saveTest(test.testFile);
  }

  // Step 6: Measure new coverage
  console.log('📈 Measuring coverage...');
  const newCoverage = await runCoverage();
  state.coverageHistory.push(newCoverage);
  state.currentCoverage = newCoverage.summary;

  // Step 7: Update processed files
  targets.forEach(t => state.filesProcessed.add(t.path));

  // Step 8: Check thresholds
  if (meetsThresholds(state.currentCoverage, state.targetCoverage)) {
    return { status: 'success', message: 'Thresholds met!' };
  }

  state.iterations++;
  return { status: 'continue' };
}
```

### Phase 3: Completion

```typescript
async function finalize(state: OrchestrationState): Promise<FinalReport> {
  const report = {
    status: state.status,
    duration: Date.now() - state.startTime.getTime(),
    iterations: state.iterations,
    stats: {
      testsGenerated: state.testsGenerated,
      testsValid: state.testsValid,
      testsAccepted: state.testsAccepted,
      buildSuccessRate: state.testsValid / state.testsGenerated,
      acceptanceRate: state.testsAccepted / state.testsGenerated
    },
    coverage: {
      initial: state.coverageHistory[0].summary,
      final: state.currentCoverage,
      gains: calculateGains(state.coverageHistory)
    },
    files: {
      processed: state.filesProcessed.size,
      remaining: estimateRemaining(state)
    }
  };

  // Generate detailed report
  await generateDetailedReport(report);

  return report;
}
```

## Configuration

### Orchestrator Config

```typescript
interface OrchestratorConfig {
  // Coverage targets
  thresholds: {
    global: CoverageThresholds;
    perFile?: Record<string, CoverageThresholds>;
  };

  // Iteration control
  maxIterations: number;              // Default: 10
  targetFilesPerIteration: number;    // Default: 5

  // Test generation preferences
  preferUnitTests: boolean;           // Default: true
  includeIntegrationTests: boolean;   // Default: true

  // Validation settings
  timeoutPerTest: number;             // Default: 30000ms
  retryFailedTests: boolean;          // Default: false

  // Coverage measurement
  collectCoverageFrom: string[];
  coverageReporters: string[];        // Default: ['json-summary', 'text']

  // Output
  reportDir: string;                  // Default: 'coverage-reports'
  verbose: boolean;                   // Default: true
}
```

### Example Configuration

```typescript
const config: OrchestratorConfig = {
  thresholds: {
    global: {
      lines: 80,
      statements: 80,
      branches: 75,
      functions: 80
    },
    perFile: {
      'src/modules/auth/**/*.ts': {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100
      }
    }
  },
  maxIterations: 15,
  targetFilesPerIteration: 3,
  preferUnitTests: true,
  includeIntegrationTests: true,
  timeoutPerTest: 60000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts'
  ],
  coverageReporters: ['json-summary', 'json', 'text', 'lcov'],
  reportDir: 'coverage-automation-reports',
  verbose: true
};
```

## Test Validation Details

### Build Validation

```bash
# Compile TypeScript without emitting files
npx tsc --noEmit ${testFile}

# Check exit code
if [ $? -eq 0 ]; then
  echo "✓ Build successful"
else
  echo "✗ Build failed"
  npx tsc --noEmit ${testFile} 2>&1 | grep "error TS"
fi
```

### Run Validation

```bash
# Run test file in isolation
npm test -- ${testFile} --maxWorkers=1 --silent

# Exit code 0 = ran without errors (even if tests failed)
# Exit code non-zero = runtime error
```

### Pass Validation

```bash
# Run and check all tests pass
npm test -- ${testFile} --maxWorkers=1

# Parse output for:
# - "Tests: X passed, X total" (all must pass)
# - No "FAIL" markers
```

### Coverage Validation

```bash
# Run coverage for specific file
npm test -- ${testFile} --coverage \
  --collectCoverageFrom=${targetFile} \
  --coverageReporters=json

# Compare before/after in coverage-final.json
# Ensure coverage increased for target file
```

## Best Practices

### 1. Batch Processing

Process multiple files per iteration:
```typescript
// ✅ Good: Process 3-5 files per iteration
const targets = prioritizedFiles.slice(0, 5);

// ❌ Bad: Process one file per iteration
const targets = [prioritizedFiles[0]];
```

### 2. Fail Fast

Stop early if no progress:
```typescript
if (iteration > 3 && noCoverageGain()) {
  console.warn('No coverage gains in last 3 iterations. Stopping.');
  break;
}
```

### 3. Adaptive Targeting

Learn from successful tests:
```typescript
if (test.valid && test.coverageIncrease > 5) {
  // Similar files likely to have good results
  prioritizeSimilarFiles(test.targetFile);
}
```

### 4. Resource Management

Clean up between iterations:
```typescript
afterEach(async () => {
  await cleanupTempFiles();
  jest.clearAllMocks();
  jest.resetModules();
});
```

### 5. Progress Reporting

Keep user informed:
```typescript
console.log(`
📊 Progress Report - Iteration ${iteration}/${maxIterations}
──────────────────────────────────────────────────
Coverage:   ${currentCoverage.lines}% → ${targetCoverage.lines}% (${gap}% remaining)
Tests:      ${testsAccepted}/${testsGenerated} accepted (${acceptanceRate}%)
Files:      ${filesProcessed.size} processed, ~${filesRemaining} remaining
Time:       ${elapsed}s elapsed, ~${estimatedRemaining}s remaining
──────────────────────────────────────────────────
`);
```

## Error Handling

### Stuck in Local Maximum

```typescript
if (noImprovementInLastNIterations(3)) {
  console.warn('Coverage plateaued. Trying alternative strategies...');

  // Strategy 1: Focus on different metric
  if (currentMetric === 'lines') {
    currentMetric = 'branches';
  }

  // Strategy 2: Increase complexity of generated tests
  config.testComplexity = 'high';

  // Strategy 3: Include integration tests
  config.includeIntegrationTests = true;
}
```

### All Tests Failing Validation

```typescript
if (acceptanceRate < 0.1) {
  console.error('Acceptance rate too low (<10%). Investigating...');

  // Check common issues
  const issues = diagnoseFailures(validationResults);

  if (issues.includes('missing_mocks')) {
    console.log('💡 Tip: Ensure mock dependencies are available');
  }

  if (issues.includes('type_errors')) {
    console.log('💡 Tip: Check TypeScript configuration and types');
  }

  // Simplify generation strategy
  config.simplifyGeneration = true;
}
```

### Timeout Issues

```typescript
try {
  await runTest(testFile, { timeout: config.timeoutPerTest });
} catch (error) {
  if (error.message.includes('timeout')) {
    console.warn(`Test ${testFile} timed out. Increasing timeout.`);
    config.timeoutPerTest *= 1.5;
    retry = true;
  }
}
```

## Output Reports

### Progress Log

```
🎯 Jest Coverage Automation - Starting
═══════════════════════════════════════════════════════════

📊 Initial Coverage:
  Lines:      65.2% (target: 80%, gap: 14.8%)
  Statements: 66.1% (target: 80%, gap: 13.9%)
  Branches:   58.5% (target: 75%, gap: 16.5%)
  Functions:  63.8% (target: 80%, gap: 16.2%)

🔄 Iteration 1/10
───────────────────────────────────────────────────────────
📊 Analyzing coverage gaps...
  ✓ Identified 45 files with coverage gaps
  ✓ Prioritized 15 critical files

🎯 Selected 5 targets:
  1. src/modules/auth/auth.service.ts (score: 95)
  2. src/modules/payment/payment.processor.ts (score: 92)
  3. src/modules/users/user.service.ts (score: 78)
  4. src/common/validation/dto.validator.ts (score: 65)
  5. src/utils/crypto.util.ts (score: 58)

✍️  Generating tests...
  ✓ Generated 12 test files (47 test cases)

🔍 Validating generated tests...
  ✓ Build: 11/12 passed (91.7%)
  ✓ Run: 10/11 passed (90.9%)
  ✓ Pass: 9/10 passed (90.0%)
  ✓ Coverage: 7/9 increased coverage (77.8%)

📈 Measuring coverage...
  Lines:      65.2% → 72.8% (+7.6%)
  Statements: 66.1% → 73.5% (+7.4%)
  Branches:   58.5% → 65.2% (+6.7%)
  Functions:  63.8% → 71.1% (+7.3%)

💾 Accepted 7 new test files
───────────────────────────────────────────────────────────

[... more iterations ...]

✅ SUCCESS - Coverage thresholds met!
═══════════════════════════════════════════════════════════

📊 Final Coverage:
  Lines:      80.3% ✓ (target: 80%)
  Statements: 81.1% ✓ (target: 80%)
  Branches:   75.8% ✓ (target: 75%)
  Functions:  80.5% ✓ (target: 80%)

📈 Statistics:
  Duration: 8.5 minutes
  Iterations: 6/10
  Tests generated: 54
  Tests accepted: 38 (70.4% acceptance rate)
  Files processed: 28
  Coverage gain: +15.1% average

📁 Detailed report: coverage-automation-reports/report-2025-01-21.json
```

### JSON Report

```json
{
  "timestamp": "2025-01-21T15:30:00Z",
  "status": "success",
  "config": { ... },
  "summary": {
    "duration": 510000,
    "iterations": 6,
    "testsGenerated": 54,
    "testsAccepted": 38,
    "acceptanceRate": 0.704,
    "filesProcessed": 28
  },
  "coverage": {
    "initial": {
      "lines": 65.2,
      "statements": 66.1,
      "branches": 58.5,
      "functions": 63.8
    },
    "final": {
      "lines": 80.3,
      "statements": 81.1,
      "branches": 75.8,
      "functions": 80.5
    },
    "gains": {
      "lines": 15.1,
      "statements": 15.0,
      "branches": 17.3,
      "functions": 16.7
    }
  },
  "iterations": [ ... ],
  "testsAccepted": [ ... ]
}
```

## Agent Communication

### Input (from User/CLI)

```typescript
interface OrchestratorRequest {
  config: OrchestratorConfig;
  mode: 'full' | 'single-iteration' | 'analyze-only';
  resumeFrom?: OrchestrationState;
}
```

### Output (to User)

```typescript
interface OrchestratorResult {
  status: 'success' | 'max_iterations' | 'error';
  report: FinalReport;
  recommendations: string[];
  nextSteps?: string[];
}
```

## Example Session

```bash
$ claude-code /agents quality-assurance coverage-orchestrator \
    --target-lines=80 \
    --target-branches=75

[Coverage Orchestrator Agent]
🎯 Jest Coverage Automation - Starting
═══════════════════════════════════════════════════════

📊 Initial Coverage Analysis...
  Current: Lines 65.2%, Branches 58.5%
  Target:  Lines 80%, Branches 75%
  Gap:     Lines 14.8%, Branches 16.5%

🚀 Starting automated test generation...

[6 iterations later...]

✅ SUCCESS - Coverage thresholds met!
═══════════════════════════════════════════════════════

📊 Final Coverage:
  Lines:      80.3% ✓ (+15.1%)
  Statements: 81.1% ✓ (+15.0%)
  Branches:   75.8% ✓ (+17.3%)
  Functions:  80.5% ✓ (+16.7%)

📈 Statistics:
  Duration: 8.5 minutes
  Iterations: 6/10
  Tests: 38 accepted / 54 generated (70.4% acceptance rate)
  Files: 28 processed

💡 Recommendations:
  - Review generated tests for quality
  - Consider increasing thresholds for critical modules
  - Add integration tests for payment workflow

📁 Report: coverage-automation-reports/report-2025-01-21.json
```
