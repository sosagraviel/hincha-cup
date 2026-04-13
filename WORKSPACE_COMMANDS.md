# Workspace Unified Commands

All workspace packages (orchestration, website) share the same command structure for consistency and pre-commit hook compatibility.

## Available Commands

Run these commands recursively across all workspace packages with `pnpm -r <command>`:

### Building & Type Checking

```bash
# Build all packages
pnpm -r build

# Type check all packages
pnpm -r typecheck
```

### Code Quality

```bash
# Check linting (no changes)
pnpm -r lint

# Fix linting issues
pnpm -r lint:fix

# Check formatting (no changes)
pnpm -r format

# Alias for format check
pnpm -r format:check

# Fix formatting issues
pnpm -r format:fix
```

### Testing

```bash
# Run all tests
pnpm -r test
```

## Pre-commit Hook Usage

The pre-commit hook can now run unified commands across all packages:

```bash
# .husky/pre-commit
pnpm -r lint
pnpm -r format
pnpm -r typecheck
```

## Package-Specific Commands

### Orchestration

```bash
cd orchestration
pnpm dev              # Run with tsx
pnpm initialize       # Run initialize-project CLI
pnpm implement        # Run implement-ticket CLI
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests only
```

### Website

```bash
cd website
pnpm start            # Start dev server
pnpm serve            # Serve production build
pnpm deploy           # Deploy to GitHub Pages
pnpm clear            # Clear Docusaurus cache
```

## Configuration Files

Both packages use identical linting and formatting configuration:

- **ESLint**: `eslint.config.js` (TypeScript-ESLint + Prettier integration)
- **Prettier**: `.prettierrc.json` (consistent code style)
- **TypeScript**: `tsconfig.json` (strict mode enabled)

## Tools & Versions

- **ESLint**: `^10.2.0`
- **Prettier**: `^3.8.2`
- **TypeScript**: `^5.9.3` (orchestration), `~6.0.2` (website)
- **TypeScript-ESLint**: `^8.58.1`
