# AI Store Security Guide

**Last Updated**: 2026-03-06
**Version**: 1.0.0

---

## Overview

This document outlines security best practices, threat model, and security controls for the AI Store autonomous workflow framework.

---

## Table of Contents

1. [Threat Model](#threat-model)
2. [Security Principles](#security-principles)
3. [Authentication & Authorization](#authentication--authorization)
4. [Input Validation](#input-validation)
5. [Secrets Management](#secrets-management)
6. [Code Injection Prevention](#code-injection-prevention)
7. [File System Security](#file-system-security)
8. [Dependencies Security](#dependencies-security)
9. [Logging & Privacy](#logging--privacy)
10. [Security Checklist](#security-checklist)
11. [Incident Response](#incident-response)

---

## Threat Model

### Assets to Protect

1. **Source Code**: Proprietary application code
2. **Credentials**: API keys, tokens, passwords
3. **User Data**: Ticket data, commit messages, PR descriptions
4. **Git History**: Commit history, authorship information
5. **System Access**: File system, network, processes

### Threat Actors

| Actor | Motivation | Capability | Likelihood |
|-------|------------|------------|------------|
| Malicious Insider | Data theft, sabotage | High | Low |
| External Attacker | Data breach, ransomware | Medium | Low |
| Compromised Dependencies | Supply chain attack | High | Medium |
| Accidental Exposure | Human error | Low | High |

### Attack Vectors

1. **Command Injection**: Malicious ticket descriptions with shell commands
2. **Path Traversal**: Ticket keys containing `../` to access unauthorized files
3. **Secret Exposure**: Hardcoded API keys committed to git
4. **Dependency Vulnerabilities**: npm packages with known CVEs
5. **Privilege Escalation**: Running with unnecessary elevated permissions

---

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

---

## Authentication & Authorization

### API Authentication

**Jira API**:
```bash
# Use API tokens, not passwords
JIRA_API_TOKEN=your_token_here  # ✅ Good
JIRA_PASSWORD=your_password     # ❌ Bad

# Store in environment, not code
export JIRA_API_TOKEN="..."     # ✅ Good
const token = "abc123...";      # ❌ Bad
```

**GitHub API**:
```bash
# Use fine-grained tokens with minimal scopes
GITHUB_TOKEN=github_pat_...     # ✅ Good (PAT)
GITHUB_TOKEN=ghp_...            # ⚠️  OK (classic, but broader scope)

# Required scopes only:
# - repo (for PR creation)
# - read:org (for team access)
```

### Permission Validation

```javascript
// Validate user has permission before autonomous operations
function validatePermissions(ticketKey) {
  // Check user can access ticket
  if (!canAccessTicket(ticketKey)) {
    throw new Error('Insufficient permissions');
  }

  // Check user can create PRs
  if (!canCreatePR()) {
    throw new Error('Cannot create pull requests');
  }
}
```

---

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

// ✅ Good: Escape shell arguments
const { quote } = require('shell-quote');
const safe = quote([userInput]);
execSync(`git branch ${safe}`);

// ❌ Bad: String interpolation with user input
execSync(`git branch ${userInput}`);  // Injection risk!
execSync(`git branch feature/${ticketKey}`);  // If ticketKey = "; rm -rf /"
```

### JSON Schema Validation

```javascript
// ✅ Good: Validate structure
function validateTicketContext(context) {
  const schema = {
    ticketKey: 'string',
    title: 'string',
    description: 'string',
    requirements: 'array'
  };

  for (const [key, type] of Object.entries(schema)) {
    if (typeof context[key] !== type) {
      throw new Error(`Invalid context: ${key} must be ${type}`);
    }
  }

  return context;
}

// ❌ Bad: Trust external JSON
const context = JSON.parse(externalData);
processContext(context);  // No validation!
```

---

## Secrets Management

### Environment Variables

**Setup**:
```bash
# .env (never commit this!)
JIRA_API_TOKEN=your_token
GITHUB_TOKEN=ghp_your_token
OPENAI_API_KEY=sk-your_key

# .env.example (commit this for documentation)
JIRA_API_TOKEN=your_jira_token_here
GITHUB_TOKEN=your_github_token_here
OPENAI_API_KEY=your_openai_key_here
```

**Loading**:
```javascript
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

// ❌ Bad: Use without validation
const token = process.env.JIRA_API_TOKEN;  // May be undefined!
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

---

## Code Injection Prevention

### Avoid eval()

```javascript
// ❌ NEVER use eval()
eval(userInput);  // CRITICAL VULNERABILITY

// ❌ NEVER use Function constructor
new Function(userInput)();  // CRITICAL VULNERABILITY

// ✅ Use safe alternatives
const safeEval = require('safe-eval');
const result = safeEval(expression, { allowed: 'variables' });
```

### Template Injection

```javascript
// ❌ Bad: User input in templates
const template = `Hello ${userInput}`;  // If userInput = "${process.exit()}"

// ✅ Good: Escape user input
const template = `Hello ${escapeHtml(userInput)}`;

// ✅ Better: Use parameterized templates
const template = Handlebars.compile('Hello {{name}}');
const output = template({ name: sanitizedInput });
```

---

## File System Security

### File Permissions

```bash
# Sensitive files should be 600 (owner read/write only)
chmod 600 .env
chmod 600 ~/.ssh/id_rsa

# Scripts should be 755 (executable by all, writable by owner)
chmod 755 utils/*.sh

# Directories should be 755
chmod 755 
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

### Temporary Files

```javascript
// ✅ Good: Use secure temp directory
const os = require('os');
const tmpDir = os.tmpdir();
const tmpFile = path.join(tmpDir, `ai-agentic-framework-${Date.now()}.tmp`);

// ✅ Good: Clean up temp files
try {
  fs.writeFileSync(tmpFile, data);
  processFile(tmpFile);
} finally {
  fs.unlinkSync(tmpFile);  // Always cleanup
}

// ❌ Bad: Leave temp files around
fs.writeFileSync('/tmp/data.tmp', sensitiveData);
// Never deleted - accessible to other users!
```

---

## Dependencies Security

### Audit Dependencies

```bash
# Check for known vulnerabilities
npm audit

# Fix automatically (if possible)
npm audit fix

# Fix with breaking changes
npm audit fix --force

# View detailed report
npm audit --json > audit-report.json
```

### Lock File

```bash
# Always commit package-lock.json
git add package-lock.json
git commit -m "Lock dependencies"

# Reproducible builds
npm ci  # Instead of npm install in CI/CD
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
npm info <package> --json | jq '.versions, .maintainers, .license'

# Check for known issues
npm view <package> security

# Alternative: Use Snyk or GitHub Dependabot
```

---

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

### Log File Permissions

```bash
# Logs should be readable only by owner
chmod 600 logs/*.log

# Or readable by group (for log aggregation)
chmod 640 logs/*.log
chown user:logging logs/*.log
```

---

## Security Checklist

### Pre-Deployment

- [ ] Run security check: `./utils/security-check.sh`
- [ ] No hardcoded secrets in code
- [ ] All `.env` files gitignored
- [ ] npm audit shows 0 high/critical vulnerabilities
- [ ] Input validation on all external inputs
- [ ] File permissions correctly set (600 for sensitive files)
- [ ] No `eval()` or `Function()` usage
- [ ] Logging sanitized (no secrets logged)
- [ ] Dependencies locked (package-lock.json committed)
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

---

## Security Controls by Component

### Risk Assessment (`select-strategy.js`)

**Threats**:
- Malicious ticket descriptions with injection
- Path traversal in ticket keys

**Controls**:
- ✅ Ticket key format validation
- ✅ Input sanitization for git commands
- ✅ Read-only file system access

### Planning (`auto-plan.js`)

**Threats**:
- Code generation with malicious patterns
- File path manipulation

**Controls**:
- ✅ Path validation for generated files
- ✅ No eval() or dynamic code execution
- ✅ Output sanitization

### Test Execution (`smart-test-selection.js`)

**Threats**:
- Test file manipulation
- Command injection in test commands

**Controls**:
- ✅ Test file path validation
- ✅ Parameterized test execution
- ✅ Timeout limits

### PR Creation

**Threats**:
- Malicious PR descriptions
- Unauthorized repository access

**Controls**:
- ✅ GitHub token with minimal scopes
- ✅ Markdown sanitization
- ✅ Branch name validation

---

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

**P2/P3 actions**:
1. Document the issue
2. Plan fix timeline
3. Monitor for exploitation

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

---

## Security Contacts

### Internal

- **Security Team**: security@company.com
- **On-Call**: Use PagerDuty rotation
- **DevSecOps**: devsecops@company.com

### External

- **Vulnerability Reports**: security@ai-agentic-framework.dev
- **GPG Key**: [Link to public key]

### Security Researchers

We appreciate responsible disclosure:

1. Email security@ai-agentic-framework.dev with vulnerability details
2. Allow 90 days for patching before public disclosure
3. Eligible for recognition in SECURITY.md

---

## Compliance

### Data Protection

- **GDPR**: User data minimization, right to deletion
- **CCPA**: Data disclosure, opt-out rights
- **SOC 2**: Access controls, audit logging

### Industry Standards

- **OWASP Top 10**: All risks addressed
- **CWE Top 25**: Common weaknesses mitigated
- **NIST Cybersecurity Framework**: Controls implemented

---

## Security Tools

### Automated Scanning

```bash
# Security check (custom)
./utils/security-check.sh

# Dependency audit
npm audit

# Secret scanning (if available)
trufflehog --regex --entropy=False .

# SAST (Static Application Security Testing)
# Example with Semgrep
semgrep --config=auto 
```

### Manual Review

- Code review checklist
- Threat modeling sessions (quarterly)
- Penetration testing (annually)
- Security training (biannually)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-03-06 | Initial security documentation |

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [npm Security Best Practices](https://docs.npmjs.com/security-best-practices)

---

**Remember**: Security is everyone's responsibility. When in doubt, ask the security team.
