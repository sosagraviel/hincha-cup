# Test Analyzer Agent

Specialized agent for analyzing code coverage, identifying gaps, and prioritizing test generation targets.

## Role

The Test Analyzer Agent is responsible for understanding the current state of test coverage and providing actionable insights for the Test Writer Agent. It acts as the "eyes" of the coverage improvement system.

## Capabilities

### 1. Coverage Report Analysis

**Parse Jest Coverage Output:**
```typescript
// Read coverage-summary.json
const coverageSummary = JSON.parse(
  fs.readFileSync('coverage/coverage-summary.json', 'utf-8')
);

// Extract metrics
interface CoverageMetrics {
  lines: { total: number; covered: number; skipped: number; pct: number };
  statements: { total: number; covered: number; skipped: number; pct: number };
  functions: { total: number; covered: number; skipped: number; pct: number };
  branches: { total: number; covered: number; skipped: number; pct: number };
}
```

**Identify Coverage Gaps:**
- Files with 0% coverage
- Files below threshold
- Specific uncovered lines/branches
- Uncovered functions

### 2. Code Structure Analysis

**Analyze Source Files:**
```typescript
// For each file in coverage report
- Read source code
- Parse TypeScript/JavaScript AST
- Identify:
  - Exported functions/classes
  - Public methods
  - Critical code paths (auth, validation, error handling)
  - Dependencies (imports)
  - Complexity metrics (cyclomatic complexity)
```

**Classify Code Importance:**
- **Critical** (Priority 1): Auth, security, payment, data integrity
- **Core** (Priority 2): Main business logic, API endpoints
- **Supporting** (Priority 3): Utilities, helpers, formatters
- **Auxiliary** (Priority 4): Config, constants, types

### 3. Existing Test Analysis

**Examine Current Tests:**
```typescript
// For each source file, find associated tests
- Look for .spec.ts/.test.ts files (co-located or mirrored)
- Analyze test structure:
  - Number of test cases
  - Mocking strategies used
  - Coverage patterns
  - Test quality indicators
```

**Identify Test Patterns:**
- AAA pattern usage
- Mocking approaches
- Assertion libraries used
- Setup/teardown patterns

### 4. Gap Prioritization

**Priority Scoring Algorithm:**
```typescript
function calculatePriority(file: SourceFile): number {
  let score = 0;

  // Criticality (0-40 points)
  score += file.criticality * 10; // 1-4 scale

  // Coverage gap (0-30 points)
  const gap = 100 - file.coverage.lines.pct;
  score += (gap / 100) * 30;

  // Complexity (0-20 points)
  score += Math.min(file.cyclomaticComplexity / 10, 20);

  // Uncovered branches (0-10 points)
  score += Math.min(file.uncoveredBranches.length / 5, 10);

  return score;
}
```

**Output Prioritized List:**
```typescript
interface PrioritizedFile {
  path: string;
  score: number;
  currentCoverage: CoverageMetrics;
  uncoveredLines: number[];
  uncoveredBranches: BranchInfo[];
  uncoveredFunctions: string[];
  criticality: 1 | 2 | 3 | 4;
  reason: string; // Why this file is prioritized
}
```

## Workflow

### Step 1: Run Coverage Analysis

```bash
# Execute Jest with coverage
npm test -- --coverage --coverageReporters=json-summary,json

# Verify coverage files exist
ls -la coverage/coverage-summary.json
ls -la coverage/coverage-final.json
```

### Step 2: Parse Coverage Data

```typescript
// Read summary for overall metrics
const summary = readCoverageSummary();

// Read detailed coverage for line-by-line analysis
const detailed = readDetailedCoverage();

// Calculate gaps
const gaps = identifyGaps(summary, detailed);
```

### Step 3: Analyze Code Structure

```typescript
for (const gap of gaps) {
  const sourceCode = readFile(gap.filePath);
  const ast = parseTypeScript(sourceCode);

  // Extract metadata
  gap.metadata = {
    exports: extractExports(ast),
    dependencies: extractImports(ast),
    complexity: calculateComplexity(ast),
    testable: isTestable(ast)
  };
}
```

### Step 4: Find Existing Tests

```typescript
for (const gap of gaps) {
  // Check co-located test
  const colocatedTest = gap.filePath.replace('.ts', '.spec.ts');

  // Check mirror pattern
  const mirrorTest = gap.filePath
    .replace('/src/', '/test/unit/')
    .replace('.ts', '.spec.ts');

  gap.existingTests = findExistingTests([colocatedTest, mirrorTest]);
}
```

### Step 5: Prioritize and Output

```typescript
// Score each gap
const prioritized = gaps
  .map(gap => ({ ...gap, score: calculatePriority(gap) }))
  .sort((a, b) => b.score - a.score);

// Output structured analysis
return {
  summary: {
    totalFiles: gaps.length,
    criticalFiles: prioritized.filter(f => f.criticality === 1).length,
    avgCoverage: calculateAverage(gaps.map(g => g.currentCoverage.lines.pct))
  },
  prioritizedFiles: prioritized,
  recommendations: generateRecommendations(prioritized)
};
```

## Output Format

### Analysis Report

```json
{
  "timestamp": "2025-01-21T10:00:00Z",
  "summary": {
    "totalFiles": 45,
    "uncoveredFiles": 12,
    "partiallyTestedFiles": 18,
    "criticalUncovered": 3,
    "globalCoverage": {
      "lines": 72.5,
      "statements": 73.1,
      "branches": 65.8,
      "functions": 70.2
    },
    "thresholds": {
      "lines": 80,
      "statements": 80,
      "branches": 80,
      "functions": 80
    },
    "shortfall": {
      "lines": 7.5,
      "statements": 6.9,
      "branches": 14.2,
      "functions": 9.8
    }
  },
  "prioritizedFiles": [
    {
      "path": "src/modules/auth/auth.service.ts",
      "score": 95,
      "criticality": 1,
      "reason": "Critical authentication logic with 45% coverage",
      "currentCoverage": {
        "lines": { "pct": 45.2, "total": 120, "covered": 54, "uncovered": 66 },
        "branches": { "pct": 30.0, "total": 20, "covered": 6, "uncovered": 14 }
      },
      "uncoveredLines": [15, 16, 17, 23, 24, 45, 46, 47, 48, 89, 90, 91],
      "uncoveredBranches": [
        { "line": 15, "type": "if", "reason": "else branch not covered" },
        { "line": 23, "type": "switch", "reason": "case 'admin' not covered" }
      ],
      "uncoveredFunctions": ["validateToken", "refreshToken", "revokeToken"],
      "existingTests": "src/modules/auth/auth.service.spec.ts",
      "recommendations": [
        "Add tests for validateToken method (lines 15-20)",
        "Cover admin case in switch statement (line 23)",
        "Test refreshToken error handling (lines 45-48)"
      ]
    }
  ]
}
```

## Tools and Commands

### Coverage Analysis Commands

```bash
# Generate coverage with all formats
npm test -- --coverage \
  --coverageReporters=json-summary,json,text,lcov

# Coverage for specific file
npm test -- --coverage \
  --collectCoverageFrom=src/modules/auth/auth.service.ts \
  --testMatch=**/*auth*.spec.ts

# Coverage without running tests (if coverage data exists)
npx jest --coverage --coverageReporters=json-summary --passWithNoTests
```

### Code Analysis Tools

```bash
# TypeScript AST parsing
npx ts-node scripts/parse-ast.ts <file>

# Complexity analysis
npx complexity-report <file>

# Find untested files
comm -23 \
  <(find src -name "*.ts" ! -name "*.spec.ts" | sort) \
  <(find src -name "*.spec.ts" | sed 's/.spec.ts/.ts/' | sort)
```

## Best Practices

### 1. Focus on Impact

Prioritize files where new tests will have the most impact:
- High business value
- Low current coverage
- Moderate complexity (testable)

### 2. Respect Project Patterns

Identify and respect existing patterns:
- Test file locations (co-located vs mirrored)
- Naming conventions
- Mocking strategies
- Assertion styles

### 3. Provide Context

Give the Test Writer Agent sufficient context:
- Uncovered code snippets
- Dependency information
- Existing test examples
- Expected behavior (from comments, types, adjacent code)

### 4. Batch Similar Work

Group related files:
- Files in the same module
- Files using similar patterns
- Files with similar testing needs

### 5. Track Progress

Maintain state across iterations:
- Files already processed
- Tests generated but failed
- Tests generated and passed
- Coverage improvements achieved

## Error Handling

### Missing Coverage Data

```typescript
if (!fs.existsSync('coverage/coverage-summary.json')) {
  console.error('Coverage data not found. Run: npm test -- --coverage');
  process.exit(1);
}
```

### Unparseable Source Code

```typescript
try {
  const ast = parseTypeScript(sourceCode);
} catch (error) {
  console.warn(`Could not parse ${filePath}: ${error.message}`);
  // Skip this file or use basic heuristics
  return { ...file, metadata: null, testable: false };
}
```

### Invalid Coverage Percentages

```typescript
function validateCoverage(pct: number): number {
  if (isNaN(pct) || pct < 0 || pct > 100) {
    console.warn(`Invalid coverage percentage: ${pct}. Using 0.`);
    return 0;
  }
  return pct;
}
```

## Agent Communication

### Input (from Coverage Orchestrator)

```typescript
interface AnalyzerRequest {
  coverageReportPath?: string; // Default: coverage/coverage-summary.json
  sourceRoot?: string;          // Default: src/
  testRoot?: string;            // Default: test/ or src/
  thresholds?: CoverageThresholds;
  focusAreas?: string[];        // Specific modules/files to analyze
}
```

### Output (to Coverage Orchestrator)

```typescript
interface AnalysisResult {
  summary: CoverageSummary;
  prioritizedFiles: PrioritizedFile[];
  recommendations: string[];
  metadata: {
    totalFilesAnalyzed: number;
    analysisTimestamp: string;
    toolVersions: { jest: string; typescript: string };
  };
}
```

## Example Session

```bash
# User invokes analyzer
$ claude-code /agents quality-assurance test-analyzer

[Test Analyzer Agent]
📊 Analyzing coverage data...

✓ Read coverage-summary.json (45 files)
✓ Parsed source files (42 TypeScript files)
✓ Identified existing tests (30 test files)
✓ Calculated priorities

📈 Coverage Summary:
  Lines:      72.5% (target: 80%, gap: -7.5%)
  Statements: 73.1% (target: 80%, gap: -6.9%)
  Branches:   65.8% (target: 80%, gap: -14.2%)
  Functions:  70.2% (target: 80%, gap: -9.8%)

🎯 Top 5 Priority Files:

1. src/modules/auth/auth.service.ts (score: 95)
   Coverage: 45% | Criticality: CRITICAL | Reason: Auth logic
   Uncovered: validateToken, refreshToken, revokeToken

2. src/modules/payment/payment.processor.ts (score: 92)
   Coverage: 38% | Criticality: CRITICAL | Reason: Payment processing
   Uncovered: processRefund, handleFailure, validateAmount

3. src/modules/users/user.service.ts (score: 78)
   Coverage: 55% | Criticality: CORE | Reason: User management
   Uncovered: updateProfile, changePassword, deactivateUser

4. src/common/validation/dto.validator.ts (score: 65)
   Coverage: 60% | Criticality: CORE | Reason: Input validation
   Uncovered: validateEmail, validatePhone, sanitizeInput

5. src/utils/crypto.util.ts (score: 58)
   Coverage: 0% | Criticality: SUPPORTING | Reason: Encryption utilities
   Uncovered: All functions (no tests exist)

💡 Recommendations:
  - Generate tests for auth.service.ts first (critical, low coverage)
  - Focus on branch coverage (lowest metric at 65.8%)
  - Consider integration tests for payment flow
  - Utilities need basic unit test coverage

📁 Analysis report saved to: coverage/analysis-report.json
```
