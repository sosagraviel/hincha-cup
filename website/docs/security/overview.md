---
sidebar_position: 1
title: Security Overview
description: Security best practices, secrets management, and dependency security
---

# Security Overview

Security best practices, threat model, and security controls for the AI Agentic Framework.

## Security Principles

### 1. Principle of Least Privilege

✅ **DO**:
- Run utilities with minimum necessary permissions
- Use read-only access where possible
- Limit file system access to project directory

❌ **DON'T**:
- Run as root/administrator
- Grant broad file system access
- Use wildcard permissions

### 2. Defense in Depth

✅ **DO**:
- Multiple layers of validation (input, output, execution)
- Separate concerns (read, process, write)
- Fail securely (deny by default)

❌ **DON'T**:
- Rely on single security control
- Assume inputs are safe
- Continue execution on security failures

### 3. Secure by Default

✅ **DO**:
- Require explicit opt-in for sensitive operations
- Default to restrictive permissions
- Validate all external inputs

❌ **DON'T**:
- Default to permissive settings
- Auto-enable risky features
- Trust external data without validation

## Threat Model

### Assets to Protect

1. **Source Code**: Proprietary application code
2. **Credentials**: API keys, tokens, passwords
3. **User Data**: Ticket data, commit messages, PR descriptions
4. **Git History**: Commit history, authorship information
5. **System Access**: File system, network, processes

### Attack Vectors

1. **Command Injection**: Malicious ticket descriptions with shell commands
2. **Path Traversal**: Ticket keys containing `../` to access unauthorized files
3. **Secret Exposure**: Hardcoded API keys committed to git
4. **Dependency Vulnerabilities**: npm packages with known CVEs
5. **Privilege Escalation**: Running with unnecessary elevated permissions

## Secrets Management

### Environment Variables

**Setup**:
```bash
# .env (never commit this!)
JIRA_API_TOKEN=your_token
GITHUB_TOKEN=ghp_your_token
ANTHROPIC_API_KEY=sk-your_key

# .env.example (commit this for documentation)
JIRA_API_TOKEN=your_jira_token_here
GITHUB_TOKEN=your_github_token_here
ANTHROPIC_API_KEY=your_anthropic_key_here
```

**Loading**:
```typescript
// ✅ Good: Validate required env vars
function validateEnvironment() {
  const required = ['JIRA_API_TOKEN', 'GITHUB_TOKEN'];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

// Run at startup
validateEnvironment();
```

### Git History

**Check for leaked secrets**:
```bash
# Scan git history for secrets
git log --all --full-history --pretty=format: --name-only | grep -E '\.env$|id_rsa|\.pem$'

# If found, remove with BFG or filter-branch
# BFG Repo-Cleaner (easier):
bfg --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

**Prevent future leaks**:
```bash
# .gitignore
.env
.env.local
.env.*.local
*.pem
*.key
id_rsa
credentials.json

# Pre-commit hook (optional)
#!/bin/bash
if git diff --cached --name-only | grep -E '\.env$'; then
  echo "Error: Attempting to commit .env file"
  exit 1
fi
```

## Input Validation

### Ticket Key Validation

```javascript
// ✅ Good: Validate ticket key format
function validateTicketKey(key) {
  const pattern = /^[A-Z]{2,10}-\d{1,6}$/;
  if (!pattern.test(key)) {
    throw new Error(`Invalid ticket key: ${key}`);
  }
  return key;
}

// ❌ Bad: Use ticket key directly
function processTicket(key) {
  execSync(`git branch feature/${key}`);  // Command injection risk!
}
```

### File Path Validation

```javascript
// ✅ Good: Prevent path traversal
function validatePath(filePath, baseDir) {
  const resolved = path.resolve(baseDir, filePath);

  // Ensure resolved path is within base directory
  if (!resolved.startsWith(baseDir)) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}

// Example usage
const safePath = validatePath(userInput, process.cwd());

// ❌ Bad: Use user input directly
const content = fs.readFileSync(userInput);  // Path traversal risk!
```

### Command Injection Prevention

```javascript
// ✅ Good: Use parameterized commands
const { execFileSync } = require('child_process');
execFileSync('git', ['branch', 'feature/PROJ-123']);

// ❌ Bad: String interpolation with user input
execSync(`git branch ${userInput}`);  // Injection risk!
execSync(`git branch feature/${ticketKey}`);  // If ticketKey = "; rm -rf /"
```

## Dependencies Security

### Audit Dependencies

```bash
# Check for known vulnerabilities
pnpm audit

# Fix automatically (if possible)
pnpm audit --fix

# View detailed report
pnpm audit --json > audit-report.json
```

### Lock File

```bash
# Always commit pnpm-lock.yaml
git add pnpm-lock.yaml
git commit -m "Lock dependencies"

# Reproducible builds
pnpm install --frozen-lockfile  # In CI/CD
```

### Update Policy

| Severity | Action | Timeline |
|----------|--------|----------|
| Critical | Update immediately | < 24 hours |
| High | Update soon | < 1 week |
| Medium | Update regularly | < 1 month |
| Low | Update with other changes | As needed |

### Dependency Review

```bash
# Review new dependencies before adding
pnpm info <package>

# Check for known issues
pnpm view <package> security

# Alternative: Use Snyk or GitHub Dependabot
```

## Logging & Privacy

### What to Log

✅ **DO log**:
- Operation start/end times
- Success/failure status
- Error messages (sanitized)
- User actions (without PII)
- System events

❌ **DON'T log**:
- Passwords or API keys
- User personal information
- Full request/response bodies
- Session tokens
- Credit card numbers

### Log Sanitization

```javascript
// ✅ Good: Sanitize before logging
function sanitizeForLogging(data) {
  const sanitized = { ...data };

  const sensitiveKeys = ['password', 'token', 'apiKey', 'secret'];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

console.log('User data:', sanitizeForLogging(userData));

// ❌ Bad: Log everything
console.log('User data:', userData);  // May contain passwords!
```

## Security Checklist

### Pre-Deployment

- [ ] No hardcoded secrets in code
- [ ] All `.env` files gitignored
- [ ] pnpm audit shows 0 high/critical vulnerabilities
- [ ] Input validation on all external inputs
- [ ] File permissions correctly set (600 for sensitive files)
- [ ] No `eval()` or `Function()` usage
- [ ] Logging sanitized (no secrets logged)
- [ ] Dependencies locked (pnpm-lock.yaml committed)
- [ ] Git history scanned for secrets

### Runtime

- [ ] Run with minimum necessary permissions (not root)
- [ ] Environment variables validated on startup
- [ ] All external API calls use authentication
- [ ] Errors fail securely (deny by default)
- [ ] Temp files cleaned up
- [ ] Logs rotated and monitored

### Post-Incident

- [ ] Rotate all exposed credentials immediately
- [ ] Review git history for sensitive data
- [ ] Audit all affected systems
- [ ] Update security controls
- [ ] Document lessons learned

## File System Security

### File Permissions

```bash
# Sensitive files should be 600 (owner read/write only)
chmod 600 .env
chmod 600 ~/.ssh/id_rsa

# Scripts should be 755 (executable by all, writable by owner)
chmod 755 scripts/*.sh

# Directories should be 755
chmod 755 .claude/
```

### Secure File Operations

```javascript
// ✅ Good: Check file exists before reading
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf8');
}

// ✅ Good: Create files with restrictive permissions
fs.writeFileSync(filePath, content, { mode: 0o600 });

// ❌ Bad: World-readable sensitive files
fs.writeFileSync('.env', secrets);  // Default 644 (world-readable)
```

## Incident Response

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **P0 - Critical** | Active exploitation, data breach | Immediate (< 1 hour) |
| **P1 - High** | Vulnerable to exploitation | < 4 hours |
| **P2 - Medium** | Potential vulnerability | < 24 hours |
| **P3 - Low** | Theoretical risk | < 1 week |

### Response Steps

#### 1. Identify

- Detect incident via monitoring or report
- Determine severity level
- Assess scope of impact

#### 2. Contain

**P0/P1 actions**:
1. Immediately rotate all potentially compromised credentials
2. Disable affected systems
3. Block suspicious IP addresses
4. Isolate affected repositories

#### 3. Eradicate

- Remove malicious code
- Patch vulnerabilities
- Update dependencies
- Scan git history for secrets

#### 4. Recover

- Restore from clean backups
- Verify system integrity
- Re-enable systems
- Monitor closely

#### 5. Learn

- Document incident
- Update security controls
- Train team on lessons learned
- Update incident response plan

## Best Practices

### 1. Use API Keys for Production

```bash
# CI/CD environments
export ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
pnpm initialize
```

### 2. Rotate Credentials Regularly

```bash
# Generate new API keys every 90 days
# Update .env with new keys
# Test before removing old keys
```

### 3. Handle Errors Gracefully

```typescript
try {
  const result = await agent.invoke({ input: prompt });
} catch (error) {
  if (error.message.includes('timeout')) {
    // Retry with longer timeout
  } else if (error.message.includes('API key')) {
    // Check authentication
  } else {
    // Other error handling
  }
}
```

### 4. Monitor and Alert

```bash
# Set up monitoring for:
# - Failed authentication attempts
# - Unusual API usage patterns
# - Dependency vulnerabilities
# - Git commits with potential secrets
```

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [pnpm Security Best Practices](https://pnpm.io/security)

## See Also

- [Environment Variables](../configuration/environment-variables.md) - Secrets configuration
- [Authentication](../configuration/authentication.md) - API key setup
- [Docker Runtime](../configuration/docker.md) - Containerized security
