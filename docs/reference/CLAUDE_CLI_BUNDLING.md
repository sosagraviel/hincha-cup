# Claude CLI Bundling

## Overview

The AI Agentic Framework bundles Claude CLI v2.1+ as a local dependency to ensure **100% version consistency** across all developer environments. This eliminates the "unknown option '--agent'" errors that occur when developers have older Claude CLI versions installed globally.

## Why Bundle Claude CLI?

### The Problem

Claude CLI versions before v2.0.0 do not support the `--agent` flag, which is critical for the framework's agent invocation system. Developers may have:

- **No Claude CLI** installed
- **Old versions** via pnpm (v1.0.x)
- **Old versions** via npm global
- **Mixed versions** across different PATH configurations

This leads to:
- ❌ Random failures based on user's local setup
- ❌ Hours of debugging "unknown option" errors
- ❌ Inconsistent behavior across team members
- ❌ High support burden

### The Solution

By bundling Claude CLI v2.1+ as a dependency in `orchestration/package.json`, we ensure:

- ✅ **100% version consistency** - All developers use the same Claude CLI version
- ✅ **Zero setup friction** - `npm install` handles everything automatically
- ✅ **Guaranteed --agent support** - v2.1+ always has this flag
- ✅ **CI/CD ready** - No manual CLI installation in pipelines
- ✅ **Offline-friendly** - Works without internet after initial install

## How It Works

### 1. Dependency Declaration

The framework declares Claude CLI as a dependency:

```json
// orchestration/package.json
{
  "dependencies": {
    "@anthropic-ai/claude-code": "^2.1.0"
  }
}
```

### 2. Automatic Path Resolution

The framework automatically finds and uses the local Claude CLI:

```typescript
// orchestration/src/agents/agent-factory-hybrid.ts
function getClaudeCLIPath(): string {
  const localPath = path.resolve(__dirname, '../../node_modules/.bin/claude');

  if (fs.existsSync(localPath)) {
    // Use local bundled version (guaranteed v2.1+)
    return localPath;
  }

  // Fallback to global with version check
  // (warns if using global instead of local)
}
```

### 3. Version Verification

Before using any Claude CLI binary, the framework verifies:

- ✅ Version is 2.0.0 or higher
- ✅ `--agent` flag is available
- ✅ Binary is executable

If version check fails, you get a clear error message with fix instructions.

## Installation

### For New Users

Simply clone and install:

```bash
git clone <repository-url>
cd orchestration
npm install  # Installs Claude CLI v2.1+ automatically
```

**That's it!** You don't need to install Claude CLI globally.

### For Existing Users

Update your local copy:

```bash
git pull
cd orchestration
npm install  # Installs/updates Claude CLI
```

The framework will automatically use the bundled version.

## Version Management

### Checking Your Claude CLI Version

```bash
# Local bundled version (used by framework)
orchestration/node_modules/.bin/claude --version

# Global version (NOT used by framework)
claude --version
```

### Upgrading Claude CLI

The framework automatically uses the version specified in `package.json`.

To upgrade to a newer Claude CLI version:

```bash
cd orchestration
npm install @anthropic-ai/claude-code@latest
npm test  # Verify everything works
```

## Troubleshooting

### "Unknown option '--agent'" Error

**Cause:** You're running an old global Claude CLI version outside the framework.

**Fix:** Use the framework's orchestration scripts which automatically use the bundled version:

```bash
# Use framework scripts (correct)
npm run initialize

# Don't use global claude directly (incorrect)
claude --agent ./some-agent.md
```

### "Local Claude CLI found but version check failed"

**Cause:** Corrupted or incomplete installation.

**Fix:**

```bash
cd orchestration
rm -rf node_modules package-lock.json
npm install
```

### "Using global Claude CLI - consider using framework's bundled version"

**Cause:** Local bundled Claude CLI not found, falling back to global.

**This is a warning, not an error.** However, for consistency across all developers, you should:

```bash
cd orchestration
npm install  # Ensure local version is installed
```

### Multiple Claude CLI Versions on System

If you have multiple Claude CLI versions installed globally:

```bash
# Check all installed versions
which -a claude

# Example output:
/Users/you/.nvm/versions/node/v22.17.0/bin/claude  # v2.0.61
/Users/you/Library/pnpm/claude                       # v1.0.115 (old!)
```

**You can safely ignore global versions.** The framework always prefers the local bundled version.

To clean up old global versions:

```bash
# Remove pnpm global install
pnpm remove -g @anthropic-ai/claude-code

# Remove npm global install
npm uninstall -g @anthropic-ai/claude-code

# Verify
which -a claude
```

## FAQ

### Do I need to install Claude CLI globally?

**No.** The framework bundles its own version. Global installation is optional.

### Will this conflict with my global Claude CLI?

**No.** The framework's path resolution prefers the local version, so your global installation won't interfere.

### What if I want to use a different Claude CLI version?

The framework requires Claude CLI v2.0.0+ for `--agent` flag support. If you need a specific version:

```bash
cd orchestration
npm install @anthropic-ai/claude-code@2.1.50  # Specific version
```

Then test thoroughly before deploying.

### How much disk space does this add?

Claude CLI adds approximately **12MB** to `node_modules`. This is minimal compared to other dependencies like Playwright (~300MB for browser binaries).

### Does this work in CI/CD?

**Yes!** No special setup needed. Standard `npm install` in your CI pipeline handles everything.

Example GitHub Actions:

```yaml
- name: Install dependencies
  run: |
    cd orchestration
    npm install  # Installs Claude CLI automatically

- name: Run tests
  run: |
    cd orchestration
    npm test  # Uses bundled Claude CLI
```

### What if npm install fails?

Check your npm version and Node.js version:

```bash
node --version  # Should be v18+ or v20+
npm --version   # Should be v9+ or v10+
```

If still failing, try:

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## Best Practices

### ✅ DO

- Let the framework use its bundled Claude CLI
- Run `npm install` in orchestration before working on the project
- Use framework scripts (`npm run initialize`, etc.) instead of calling `claude` directly
- Keep your local copy updated with `git pull && npm install`

### ❌ DON'T

- Don't call `claude --agent` directly from command line
- Don't rely on global Claude CLI for framework operations
- Don't manually manage Claude CLI versions for the framework
- Don't skip `npm install` after pulling changes

## Industry Precedent

This bundling approach follows industry best practices used by major tools:

- **Playwright** bundles Chromium, Firefox, and WebKit browsers (~300MB)
- **Puppeteer** bundles Chromium browser
- **Electron** bundles Node.js and Chromium
- **Create React App** bundles webpack, Babel, ESLint, etc.

Bundling ensures **predictable behavior across all environments**.

## Technical Details

### Path Resolution Logic

1. Check `orchestration/node_modules/.bin/claude` (local bundled)
2. If exists and version >= 2.0.0, use it
3. Else check global `claude` command
4. If exists and version >= 2.0.0, use it (with warning)
5. Else throw error with installation instructions

### Version Check Implementation

```typescript
const version = execSync(`"${claudePath}" --version`, { encoding: 'utf-8' });
const versionMatch = version.match(/^(\d+\.\d+\.\d+)/);
const [major, minor] = versionMatch[1].split('.').map(Number);

if (major >= 2 && minor >= 0) {
  // Version OK
} else {
  throw new Error('Claude CLI version too old');
}
```

### Spawn Implementation

```typescript
const claudePath = getClaudeCLIPath();  // Resolves to local or global
claudeProcess = spawn(claudePath, [
  "--agent", agentPath,
  "--model", "sonnet",
  // ... other flags
]);
```

## Support

If you encounter issues with Claude CLI bundling:

1. Check this documentation first
2. Verify your Node.js version: `node --version` (should be v18+)
3. Try clean reinstall: `rm -rf node_modules && npm install`
4. Check GitHub Issues for similar problems
5. Create a new issue with:
   - Your Node.js version
   - Your npm version
   - Output of `orchestration/node_modules/.bin/claude --version`
   - Full error message

## Related Documentation

- [Hybrid Authentication](./HYBRID_AUTHENTICATION.md) - How authentication works
- [Provider Switching](./PROVIDER_SWITCHING.md) - Switching between API providers
