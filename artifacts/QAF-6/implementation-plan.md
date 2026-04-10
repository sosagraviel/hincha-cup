# Implementation Plan: QAF-6

## Overview
Set up ESLint, Prettier, and Husky pre-commit hooks in the orchestration module with TypeScript-aware linting and automated formatting.

## Phase Breakdown

### Phase 1: Install Dependencies
**Command**:
```bash
cd orchestration
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier eslint-config-prettier
```

**Files Modified**:
- `orchestration/package.json`
- `orchestration/pnpm-lock.yaml`

### Phase 2: Initialize Husky
**Command**:
```bash
cd orchestration
pnpm dlx husky init
```

**Files Created**:
- `.husky/pre-commit` (basic scaffold)
- `package.json` (adds `"prepare": "husky"` script)

### Phase 3: Create ESLint Configuration
**File**: `orchestration/eslint.config.js`

**Content Strategy**:
- Use ESLint v9 flat config format (ESM compatible)
- Import @typescript-eslint/eslint-plugin
- Configure for TypeScript strict mode compatibility
- Target src/ and test/ directories
- Ignore dist/, node_modules/, coverage/

**Key Rules**:
- Enable recommended TypeScript rules
- Enable type-aware linting using tsconfig.json
- Disable formatting rules (handled by Prettier)

### Phase 4: Create Prettier Configuration
**File**: `orchestration/.prettierrc.json`

**Content**:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

**File**: `orchestration/.prettierignore`

**Content**:
```
dist/
node_modules/
coverage/
*.min.js
pnpm-lock.yaml
```

### Phase 5: Add npm Scripts
**File**: `orchestration/package.json`

**Scripts to Add**:
```json
{
  "lint": "eslint src/ test/",
  "lint:fix": "eslint src/ test/ --fix",
  "format": "prettier --check src/ test/",
  "format:fix": "prettier --write src/ test/"
}
```

### Phase 6: Configure Pre-commit Hook
**File**: `.husky/pre-commit`

**Content**:
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

cd orchestration

echo "🔍 Running lint..."
pnpm lint || exit 1

echo "💅 Checking format..."
pnpm format || exit 1

echo "🔧 Running typecheck..."
pnpm typecheck || exit 1

echo "🏗️  Running build..."
pnpm build || exit 1

echo "✅ All pre-commit checks passed!"
```

### Phase 7: Establish Clean Baseline
**Commands**:
```bash
cd orchestration
pnpm format:fix
pnpm lint:fix
```

**Purpose**: Fix all existing code to match new standards

### Phase 8: Verification
**Commands to Run**:
```bash
cd orchestration
pnpm lint          # Should exit 0
pnpm format        # Should exit 0
pnpm typecheck     # Should exit 0
pnpm build         # Should exit 0
```

## Files to Create/Modify

### New Files
1. `orchestration/eslint.config.js` - ESLint v9 flat config
2. `orchestration/.prettierrc.json` - Prettier style rules
3. `orchestration/.prettierignore` - Prettier ignore patterns
4. `orchestration/.husky/pre-commit` - Pre-commit hook script

### Modified Files
1. `orchestration/package.json` - Add scripts and devDependencies
2. `orchestration/pnpm-lock.yaml` - Updated dependencies

### Files to Format/Fix
1. All .ts files in `orchestration/src/`
2. All .ts files in `orchestration/test/`

## Test Strategy

### Unit Testing
No new unit tests required - this is tooling infrastructure.

### Integration Testing
1. **Test lint command**: Run `pnpm lint` on clean code → exit 0
2. **Test lint:fix command**: Introduce a lint error, run `pnpm lint:fix`, verify fix applied
3. **Test format command**: Run `pnpm format` on formatted code → exit 0
4. **Test format:fix command**: Introduce formatting issue, run `pnpm format:fix`, verify fix applied
5. **Test pre-commit hook**:
   - Stage files with errors → commit blocked
   - Stage clean files → commit succeeds

### Performance Testing
- Measure pre-commit hook execution time → should be < 60 seconds

## Risk Mitigation

### Risk 1: ESM Module Compatibility
**Mitigation**: Use `eslint.config.js` with `export default` syntax, not `.cjs` extension

### Risk 2: Existing Code Violations
**Mitigation**: Run `pnpm format:fix && pnpm lint:fix` before enabling hook

### Risk 3: TypeScript Strict Mode Conflicts
**Mitigation**: Use `@typescript-eslint/eslint-plugin` recommended rules which are strict-compatible

### Risk 4: Pre-commit Performance
**Mitigation**: Don't run full test suite (only lint, format, typecheck, build)

## Success Metrics

1. ✅ `pnpm lint` exits 0 on current codebase
2. ✅ `pnpm format` exits 0 on current codebase
3. ✅ Pre-commit hook blocks commits with errors
4. ✅ Pre-commit hook allows clean commits
5. ✅ Pre-commit hook completes in < 60 seconds
6. ✅ No `// eslint-disable` comments added to pass checks
7. ✅ All existing tests still pass

## Implementation Order

1. Install dependencies (Phase 1)
2. Initialize Husky (Phase 2)
3. Create ESLint config (Phase 3)
4. Create Prettier config (Phase 4)
5. Add npm scripts (Phase 5)
6. Run baseline fixes (Phase 7)
7. Verify all checks pass (Phase 8)
8. Configure pre-commit hook (Phase 6)
9. Final verification (Phase 8)

## Rollback Plan

If issues arise:
1. Remove devDependencies from package.json
2. Delete configuration files (.eslintrc.json, .prettierrc.json, .prettierignore)
3. Remove .husky/ directory
4. Remove added scripts from package.json
5. Run `pnpm install` to restore clean state
