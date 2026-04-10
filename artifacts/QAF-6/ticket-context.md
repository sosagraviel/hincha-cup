# QAF-6: Set up ESLint, Prettier, and Husky pre-commit hooks in orchestration module

**Status**: In Progress
**Priority**: Medium
**Labels**: code-quality, dx, tooling

## User Story

**As a** developer working on the orchestration module,
**I want** automated linting, formatting, and pre-commit quality gates enforced locally,
**So that** code quality issues are caught before they reach CI/CD and the codebase maintains consistent style across all contributors.

## Success Criteria

1. `pnpm lint` and `pnpm lint:fix` commands execute ESLint across all TypeScript source files
2. `pnpm format` and `pnpm format:fix` commands execute Prettier across all source files
3. A Husky pre-commit hook runs lint, prettier check, typecheck, and build — blocking commits on failure
4. All existing source files pass the configured lint and format rules without manual overrides
5. The pre-commit hook completes in under 60 seconds on a typical developer machine

## Acceptance Criteria

### AC1: Developer runs lint check on clean codebase
- ESLint reports 0 errors and 0 warnings
- Exit code is 0

### AC2: Developer auto-fixes lint issues
- `pnpm lint:fix` applies all auto-fixable rules
- Non-auto-fixable violations are reported with file path and line number

### AC3: Developer runs prettier format check
- Prettier checks all .ts and .js files for formatting compliance
- Reports any files that do not match the configured style
- Exits with code 1 if any files are unformatted

### AC4: Developer auto-formats files with prettier
- `pnpm format:fix` rewrites files to match the configured style
- Running `pnpm format` afterwards exits with code 0

### AC5: Pre-commit hook blocks a bad commit
- Hook executes lint, prettier check, typecheck, and build in sequence
- Commit is blocked with descriptive error message
- No commit is created

### AC6: Pre-commit hook allows a clean commit
- Hook completes successfully
- Commit is created with provided message
- Hook output shows all 4 checks passed

### AC7: ESLint is compatible with TypeScript strict mode
- ESLint uses type information from tsconfig.json for advanced rules
- No conflicts exist between ESLint rules and TypeScript strict checks

## Technical Requirements

### Dependencies to Install
- `eslint`
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `prettier`
- `eslint-config-prettier`
- Install Husky via `pnpm dlx husky init`

### Configuration Files to Create
1. **eslint.config.js** (ESLint v9 flat config for ESM compatibility)
2. **.prettierrc.json**:
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
3. **.prettierignore**: exclude `dist/`, `node_modules/`, `coverage/`
4. **.husky/pre-commit**: run `pnpm lint && pnpm format && pnpm typecheck && pnpm build`

### package.json Scripts to Add
```json
{
  "lint": "eslint src/ test/",
  "lint:fix": "eslint src/ test/ --fix",
  "format": "prettier --check src/ test/",
  "format:fix": "prettier --write src/ test/",
  "prepare": "husky"
}
```

### Technical Constraints
- Must be compatible with ESM modules (`"type": "module"`)
- ESLint rules must not conflict with TypeScript strict mode
- Pre-commit hook must NOT run the full test suite (too slow)
- All tooling scoped to `orchestration/` only

### Architecture Decisions
- Use `eslint-config-prettier` to disable conflicting rules (not `eslint-plugin-prettier`)
- Pre-commit runs sequentially: lint → format → typecheck → build

## Out of Scope
1. Adding ESLint/Prettier to any package outside `orchestration/`
2. Running tests in the pre-commit hook
3. Setting up lint-staged
4. CI pipeline integration

## Edge Cases
1. **ESM config**: Use `eslint.config.js` with `export default [...]` for ESLint v9 flat config
2. **Existing code violations**: Run `pnpm format:fix && pnpm lint:fix` on all files as part of this PR
3. **Windows line endings**: Add `"endOfLine": "lf"` to `.prettierrc.json`

## Definition of Done
- [ ] ESLint installed and configured with TypeScript-aware rules
- [ ] Prettier installed and configured with project style rules
- [ ] `eslint-config-prettier` installed to disable conflicting ESLint formatting rules
- [ ] `pnpm lint` exits 0 on current codebase (after baseline fix)
- [ ] `pnpm lint:fix` applies auto-fixable rules
- [ ] `pnpm format` exits 0 on current codebase (after baseline fix)
- [ ] `pnpm format:fix` rewrites files to match Prettier config
- [ ] `.husky/pre-commit` runs: `pnpm lint && pnpm format && pnpm typecheck && pnpm build`
- [ ] `prepare` script added to `package.json`
- [ ] Pre-commit hook verified: blocked commit on lint error, allowed commit on clean files
- [ ] No `// eslint-disable` suppressions added to make existing code pass
- [ ] Code reviewed and approved, PR merged to main

## Implementation Notes
- Use `pnpm dlx husky init` to scaffold `.husky/pre-commit` and the `prepare` script
- Run `pnpm format:fix && pnpm lint:fix` on all existing source files as part of this PR
- Use `pnpm` (not `npm`) in all hook scripts
