---
name: security-review
description: Automated security scanning and OWASP Top 10 verification. Use when asked to "security review", "security scan", "check for vulnerabilities", "OWASP check", or before creating a PR. Runs language-specific security scanners (bandit/pip-audit for Python, npm audit/eslint security for TypeScript), checks for secrets, SQL injection, XSS, and produces detailed security report.
user-invocable: true
argument-hint: [optional: path/to/code]
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
metadata:
  version: 1.0.0
  category: sdlc-workflow
  triggers:
    - security review
    - security scan
    - vulnerability scan
    - owasp check
    - security audit
---

# Security Review Skill

Automated security scanning with language-specific tools and OWASP Top 10 verification.

## Table of Contents

- [Purpose](#purpose)
- [When to Use](#when-to-use)
- [Workflow](#workflow)
- [Security Scanners](#security-scanners)
- [OWASP Top 10 Checks](#owasp-top-10-checks)
- [Report Format](#report-format)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Purpose

This skill performs security reviews by:

1. **Detecting project language** - Python, TypeScript, JavaScript
2. **Running security scanners** - Language-specific tools (bandit, npm audit, etc.)
3. **Checking for secrets** - API keys, passwords, tokens in code
4. **Validating input handling** - SQL injection, XSS, command injection
5. **OWASP Top 10 verification** - Industry-standard security checklist
6. **Generating security report** - Detailed findings with severity levels

**Input:** Codebase path (defaults to current directory)
**Output:** Security report with findings, severity, and remediation

## When to Use

Activate this skill when:
- Before creating a pull request
- After code implementation is complete
- Asked to "run security scan" or "check for vulnerabilities"
- Working on security-sensitive features (auth, payments, data access)
- As part of CI/CD pipeline
- Before production deployment

## Workflow

### Phase 1: Detect Language and Tools

```bash
detect_language_and_tools() {
    echo "Detecting project language and available security tools..."

    # Python detection
    if [[ -f "pyproject.toml" ]] || [[ -f "setup.py" ]] || [[ -f "requirements.txt" ]]; then
        LANGUAGE="python"

        # Check for security tools
        TOOLS=""
        if command -v bandit &>/dev/null; then
            TOOLS="$TOOLS bandit"
        fi
        if command -v pip-audit &>/dev/null; then
            TOOLS="$TOOLS pip-audit"
        fi
        if command -v safety &>/dev/null; then
            TOOLS="$TOOLS safety"
        fi

        echo "Language: Python"
        echo "Available tools: $TOOLS"
    fi

    # TypeScript/JavaScript detection
    if [[ -f "package.json" ]]; then
        if [[ -f "tsconfig.json" ]] || grep -q "typescript" package.json; then
            LANGUAGE="typescript"
        else
            LANGUAGE="javascript"
        fi

        # Check for security tools
        TOOLS=""
        if [[ -f "node_modules/.bin/npm" ]] || command -v npm &>/dev/null; then
            TOOLS="$TOOLS npm-audit"
        fi
        if [[ -f "node_modules/.bin/eslint" ]]; then
            TOOLS="$TOOLS eslint-security"
        fi
        if command -v snyk &>/dev/null; then
            TOOLS="$TOOLS snyk"
        fi

        echo "Language: $LANGUAGE"
        echo "Available tools: $TOOLS"
    fi

    if [[ -z "$LANGUAGE" ]]; then
        echo "Warning: Cannot detect project language"
        echo "Running generic security checks only"
        LANGUAGE="generic"
    fi
}

detect_language_and_tools
```

### Phase 2: Install Missing Security Tools

```bash
install_security_tools() {
    local lang="$1"

    echo "Checking security tools installation..."

    if [[ "$lang" == "python" ]]; then
        # Install Python security tools
        if ! command -v bandit &>/dev/null; then
            echo "Installing bandit..."
            pip install bandit
        fi

        if ! command -v pip-audit &>/dev/null; then
            echo "Installing pip-audit..."
            pip install pip-audit
        fi

        if ! command -v safety &>/dev/null; then
            echo "Installing safety..."
            pip install safety
        fi
    fi

    if [[ "$lang" == "typescript" ]] || [[ "$lang" == "javascript" ]]; then
        # Check npm audit (built-in)
        if ! command -v npm &>/dev/null; then
            echo "Error: npm not found"
            return 1
        fi

        # Install eslint security plugin if eslint present
        if [[ -f "node_modules/.bin/eslint" ]]; then
            if ! grep -q "eslint-plugin-security" package.json; then
                echo "Installing eslint-plugin-security..."
                npm install --save-dev eslint-plugin-security
            fi
        fi
    fi

    echo "Security tools ready"
}

install_security_tools "$LANGUAGE"
```

### Phase 3: Run Language-Specific Scans

#### 3a. Python Security Scan

```bash
run_python_security_scan() {
    local report_file="/tmp/security_report_python.json"

    echo "Running Python security scans..."

    # 1. Bandit - Static code analysis
    if command -v bandit &>/dev/null; then
        echo "Running bandit..."
        bandit -r . -f json -o /tmp/bandit_report.json 2>&1 || true

        # Parse results
        bandit_issues=$(jq '.results | length' /tmp/bandit_report.json 2>/dev/null || echo "0")
        echo "Bandit found $bandit_issues issues"
    fi

    # 2. pip-audit - Dependency vulnerabilities
    if command -v pip-audit &>/dev/null; then
        echo "Running pip-audit..."
        pip-audit --format json --output /tmp/pip_audit_report.json 2>&1 || true

        # Parse results
        pip_vulns=$(jq '.dependencies | length' /tmp/pip_audit_report.json 2>/dev/null || echo "0")
        echo "pip-audit found $pip_vulns vulnerable dependencies"
    fi

    # 3. Safety - Known security vulnerabilities
    if command -v safety &>/dev/null; then
        echo "Running safety..."
        safety check --json --output /tmp/safety_report.json 2>&1 || true

        # Parse results
        safety_vulns=$(jq '.vulnerabilities | length' /tmp/safety_report.json 2>/dev/null || echo "0")
        echo "safety found $safety_vulns vulnerabilities"
    fi

    # Combine results
    combine_python_reports "$report_file"
    echo "$report_file"
}

combine_python_reports() {
    local output="$1"

    cat > "$output" <<EOF
{
  "language": "python",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "bandit": $(cat /tmp/bandit_report.json 2>/dev/null || echo '{}'),
  "pip_audit": $(cat /tmp/pip_audit_report.json 2>/dev/null || echo '{}'),
  "safety": $(cat /tmp/safety_report.json 2>/dev/null || echo '{}')
}
EOF
}
```

#### 3b. TypeScript/JavaScript Security Scan

```bash
run_typescript_security_scan() {
    local report_file="/tmp/security_report_typescript.json"

    echo "Running TypeScript/JavaScript security scans..."

    # 1. npm audit - Dependency vulnerabilities
    echo "Running npm audit..."
    npm audit --json > /tmp/npm_audit_report.json 2>&1 || true

    # Parse results
    npm_vulns=$(jq '.metadata.vulnerabilities | .total' /tmp/npm_audit_report.json 2>/dev/null || echo "0")
    echo "npm audit found $npm_vulns vulnerabilities"

    # 2. ESLint security plugin
    if [[ -f "node_modules/.bin/eslint" ]]; then
        echo "Running eslint with security rules..."

        # Create temporary eslint config with security plugin
        cat > /tmp/.eslintrc.security.json <<EOF
{
  "plugins": ["security"],
  "extends": ["plugin:security/recommended"]
}
EOF

        npx eslint . --config /tmp/.eslintrc.security.json --format json --output-file /tmp/eslint_security_report.json 2>&1 || true

        # Parse results
        eslint_issues=$(jq '. | length' /tmp/eslint_security_report.json 2>/dev/null || echo "0")
        echo "ESLint security found $eslint_issues issues"
    fi

    # Combine results
    combine_typescript_reports "$report_file"
    echo "$report_file"
}

combine_typescript_reports() {
    local output="$1"

    cat > "$output" <<EOF
{
  "language": "typescript",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "npm_audit": $(cat /tmp/npm_audit_report.json 2>/dev/null || echo '{}'),
  "eslint_security": $(cat /tmp/eslint_security_report.json 2>/dev/null || echo '[]')
}
EOF
}
```

### Phase 4: Check for Secrets

```bash
check_for_secrets() {
    echo "Checking for exposed secrets..."

    local secrets_found=0
    local secrets_report="/tmp/secrets_report.txt"

    > "$secrets_report"  # Clear file

    # Patterns to search for
    declare -A secret_patterns=(
        ["AWS Access Key"]="AKIA[0-9A-Z]{16}"
        ["AWS Secret Key"]="aws_secret_access_key\s*=\s*['\"][^'\"]{40}['\"]"
        ["Generic API Key"]="api[_-]?key\s*[:=]\s*['\"][^'\"]{20,}['\"]"
        ["Generic Secret"]="secret\s*[:=]\s*['\"][^'\"]{8,}['\"]"
        ["Password"]="password\s*[:=]\s*['\"][^'\"]{8,}['\"]"
        ["Private Key"]="-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----"
        ["GitHub Token"]="gh[pousr]_[0-9a-zA-Z]{36}"
        ["Slack Token"]="xox[baprs]-[0-9]{10,12}-[0-9]{10,12}-[0-9a-zA-Z]{24,32}"
        ["Google API Key"]="AIza[0-9A-Za-z\\-_]{35}"
        ["JWT Token"]="eyJ[A-Za-z0-9-_=]+\\.eyJ[A-Za-z0-9-_=]+\\.[A-Za-z0-9-_.+/=]*"
    )

    # Search for each pattern
    for secret_type in "${!secret_patterns[@]}"; do
        pattern="${secret_patterns[$secret_type]}"

        # Search in code (exclude common safe paths)
        matches=$(grep -rn -E "$pattern" . \
            --exclude-dir={node_modules,.git,.venv,venv,dist,build,.next,coverage} \
            --exclude="*.lock" \
            --exclude="*.log" \
            --exclude="package-lock.json" \
            --exclude="poetry.lock" \
            2>/dev/null || true)

        if [[ -n "$matches" ]]; then
            echo "WARNING: Found potential $secret_type:" >> "$secrets_report"
            echo "$matches" >> "$secrets_report"
            echo "" >> "$secrets_report"
            ((secrets_found++))
        fi
    done

    if [[ $secrets_found -gt 0 ]]; then
        echo "CRITICAL: Found $secrets_found potential secrets in code!"
        echo "See: $secrets_report"
    else
        echo "No secrets detected"
    fi

    echo "$secrets_report"
}

secrets_report=$(check_for_secrets)
```

### Phase 5: OWASP Top 10 Checks

```bash
check_owasp_top_10() {
    echo "Performing OWASP Top 10 checks..."

    local owasp_report="/tmp/owasp_report.md"

    cat > "$owasp_report" <<EOF
# OWASP Top 10 Security Review

## A01:2021 - Broken Access Control

$(check_broken_access_control)

## A02:2021 - Cryptographic Failures

$(check_cryptographic_failures)

## A03:2021 - Injection

$(check_injection_vulnerabilities)

## A04:2021 - Insecure Design

$(check_insecure_design)

## A05:2021 - Security Misconfiguration

$(check_security_misconfiguration)

## A06:2021 - Vulnerable and Outdated Components

$(check_vulnerable_components)

## A07:2021 - Identification and Authentication Failures

$(check_auth_failures)

## A08:2021 - Software and Data Integrity Failures

$(check_integrity_failures)

## A09:2021 - Security Logging and Monitoring Failures

$(check_logging_monitoring)

## A10:2021 - Server-Side Request Forgery (SSRF)

$(check_ssrf)

EOF

    echo "$owasp_report"
}

# Individual OWASP checks
check_broken_access_control() {
    echo "### Checking for authorization issues..."

    # Look for missing authorization checks
    local issues=""

    # Python: Check for unprotected routes
    if [[ "$LANGUAGE" == "python" ]]; then
        issues=$(grep -rn "@router\|@app.route" . --include="*.py" | \
                 grep -v "depends\|Depends\|authorize\|@require" | \
                 wc -l)
    fi

    # TypeScript: Check for unprotected routes
    if [[ "$LANGUAGE" == "typescript" ]]; then
        issues=$(grep -rn "app.get\|app.post\|app.put\|app.delete" . --include="*.ts" | \
                 grep -v "auth\|guard\|middleware" | \
                 wc -l)
    fi

    if [[ $issues -gt 0 ]]; then
        echo "WARN: Found $issues potentially unprotected routes"
        echo "Review: Ensure all routes have proper authorization"
    else
        echo "PASS: No obvious authorization issues"
    fi
}

check_injection_vulnerabilities() {
    echo "### Checking for injection vulnerabilities..."

    local sql_injection=0
    local cmd_injection=0
    local xss=0

    # SQL Injection patterns
    sql_patterns=(
        "execute.*\+.*"
        "execute.*%.*"
        "execute.*f['\"].*{.*}.*['\"]"
        "raw.*SELECT.*WHERE"
    )

    for pattern in "${sql_patterns[@]}"; do
        matches=$(grep -rn -E "$pattern" . \
            --exclude-dir={node_modules,.git,.venv,venv,dist,build} \
            2>/dev/null | wc -l)
        sql_injection=$((sql_injection + matches))
    done

    # Command Injection patterns
    cmd_patterns=(
        "os.system.*input\|request"
        "subprocess.*shell=True"
        "exec.*input\|request"
        "eval.*input\|request"
    )

    for pattern in "${cmd_patterns[@]}"; do
        matches=$(grep -rn -E "$pattern" . \
            --exclude-dir={node_modules,.git,.venv,venv,dist,build} \
            2>/dev/null | wc -l)
        cmd_injection=$((cmd_injection + matches))
    done

    # XSS patterns
    xss_patterns=(
        "dangerouslySetInnerHTML"
        "innerHTML.*=.*"
        "\.html\(.*request\|input"
    )

    for pattern in "${xss_patterns[@]}"; do
        matches=$(grep -rn -E "$pattern" . \
            --exclude-dir={node_modules,.git,.venv,venv,dist,build} \
            2>/dev/null | wc -l)
        xss=$((xss + matches))
    done

    # Report findings
    if [[ $sql_injection -gt 0 ]]; then
        echo "CRITICAL: Found $sql_injection potential SQL injection points"
    fi
    if [[ $cmd_injection -gt 0 ]]; then
        echo "CRITICAL: Found $cmd_injection potential command injection points"
    fi
    if [[ $xss -gt 0 ]]; then
        echo "WARN: Found $xss potential XSS points"
    fi

    if [[ $sql_injection -eq 0 ]] && [[ $cmd_injection -eq 0 ]] && [[ $xss -eq 0 ]]; then
        echo "PASS: No obvious injection vulnerabilities"
    fi
}

check_cryptographic_failures() {
    echo "### Checking cryptographic implementations..."

    local weak_crypto=0

    # Check for weak algorithms
    weak_patterns=(
        "md5\("
        "sha1\("
        "DES\("
        "RC4"
    )

    for pattern in "${weak_patterns[@]}"; do
        matches=$(grep -rn -E "$pattern" . \
            --exclude-dir={node_modules,.git,.venv,venv,dist,build} \
            2>/dev/null | wc -l)
        weak_crypto=$((weak_crypto + matches))
    done

    if [[ $weak_crypto -gt 0 ]]; then
        echo "CRITICAL: Found $weak_crypto uses of weak cryptographic algorithms"
        echo "Recommendation: Use SHA-256 or better, AES for encryption"
    else
        echo "PASS: No weak cryptographic algorithms detected"
    fi
}

check_vulnerable_components() {
    echo "### Checking for vulnerable dependencies..."

    # This is covered by language-specific scans (pip-audit, npm audit)
    echo "See dependency scan results above"
}

check_auth_failures() {
    echo "### Checking authentication patterns..."

    # Look for weak authentication patterns
    local issues=0

    # Check for hardcoded credentials
    issues=$(grep -rn -E "password\s*=\s*['\"][^'\"]+['\"]" . \
        --exclude-dir={node_modules,.git,.venv,venv,dist,build} \
        --exclude="*.test.*" \
        --exclude="*.spec.*" \
        2>/dev/null | wc -l)

    if [[ $issues -gt 0 ]]; then
        echo "CRITICAL: Found $issues hardcoded credentials"
    else
        echo "PASS: No hardcoded credentials detected"
    fi
}

check_logging_monitoring() {
    echo "### Checking logging and monitoring..."

    # Check if logging is present
    if [[ "$LANGUAGE" == "python" ]]; then
        logging_count=$(grep -rn "import logging\|logger\." . --include="*.py" | wc -l)
    elif [[ "$LANGUAGE" == "typescript" ]]; then
        logging_count=$(grep -rn "console.log\|logger\." . --include="*.ts" | wc -l)
    fi

    if [[ $logging_count -gt 0 ]]; then
        echo "PASS: Logging implemented ($logging_count occurrences)"
        echo "REVIEW: Ensure sensitive data is not logged"
    else
        echo "WARN: No logging detected"
    fi
}

check_ssrf() {
    echo "### Checking for SSRF vulnerabilities..."

    # Look for external requests with user input
    ssrf_patterns=(
        "requests.get.*request\|input"
        "httpx.get.*request\|input"
        "fetch.*request\|input"
        "urllib.request.*request\|input"
    )

    local ssrf_issues=0
    for pattern in "${ssrf_patterns[@]}"; do
        matches=$(grep -rn -E "$pattern" . \
            --exclude-dir={node_modules,.git,.venv,venv,dist,build} \
            2>/dev/null | wc -l)
        ssrf_issues=$((ssrf_issues + matches))
    done

    if [[ $ssrf_issues -gt 0 ]]; then
        echo "WARN: Found $ssrf_issues potential SSRF points"
        echo "REVIEW: Validate and whitelist URLs before making requests"
    else
        echo "PASS: No obvious SSRF vulnerabilities"
    fi
}

owasp_report=$(check_owasp_top_10)
```

### Phase 6: Generate Security Report

```bash
generate_security_report() {
    local output_file="/tmp/security_report_final.md"

    echo "Generating comprehensive security report..."

    cat > "$output_file" <<EOF
# Security Review Report

**Generated:** $(date)
**Language:** $LANGUAGE
**Framework:** $FRAMEWORK

---

## Executive Summary

$(generate_executive_summary)

---

## 1. Automated Security Scans

### Language-Specific Scans
$(cat "$language_scan_report" 2>/dev/null || echo "No scan results")

### Severity Breakdown
$(calculate_severity_breakdown)

---

## 2. Secrets Detection

$(cat "$secrets_report" 2>/dev/null || echo "No secrets detected")

---

## 3. OWASP Top 10 Compliance

$(cat "$owasp_report" 2>/dev/null)

---

## 4. Security Findings

### Critical (Must Fix)
$(list_critical_findings)

### High (Should Fix)
$(list_high_findings)

### Medium (Consider Fixing)
$(list_medium_findings)

### Low (Informational)
$(list_low_findings)

---

## 5. Recommendations

$(generate_recommendations)

---

## 6. Remediation Steps

$(generate_remediation_steps)

---

## 7. Security Score

**Overall Score:** $(calculate_security_score) / 100

$(generate_score_breakdown)

---

## Next Steps

1. Address all CRITICAL findings immediately
2. Review and fix HIGH severity issues
3. Plan remediation for MEDIUM issues
4. Document LOW issues for future improvements
5. Re-run security scan after fixes

EOF

    echo "Security report generated: $output_file"
    cat "$output_file"
}
```

## Security Scanners

### Python Scanners

| Tool | Purpose | Installation |
|------|---------|--------------|
| **bandit** | Static code analysis for security issues | `pip install bandit` |
| **pip-audit** | Audit dependencies for known vulnerabilities | `pip install pip-audit` |
| **safety** | Check dependencies against safety database | `pip install safety` |

**Usage:**
```bash
# Bandit
bandit -r . -f json

# pip-audit
pip-audit --format json

# Safety
safety check --json
```

### TypeScript/JavaScript Scanners

| Tool | Purpose | Installation |
|------|---------|--------------|
| **npm audit** | Built-in dependency vulnerability scanner | Built-in with npm |
| **eslint-plugin-security** | ESLint rules for security | `npm install --save-dev eslint-plugin-security` |
| **snyk** | Comprehensive vulnerability scanner | `npm install -g snyk` |

**Usage:**
```bash
# npm audit
npm audit --json

# ESLint security
npx eslint . --plugin security

# Snyk
snyk test
```

## OWASP Top 10 Checks

### A01: Broken Access Control
```bash
# Check for missing authorization
grep -rn "@router" . --include="*.py" | grep -v "Depends"
grep -rn "app.get\|app.post" . --include="*.ts" | grep -v "auth\|guard"
```

### A03: Injection
```bash
# SQL Injection
grep -rn "execute.*+" . --include="*.py"
grep -rn "query.*${" . --include="*.ts"

# Command Injection
grep -rn "os.system\|subprocess.*shell=True" . --include="*.py"
grep -rn "exec\|eval.*request" . --include="*.ts"

# XSS
grep -rn "dangerouslySetInnerHTML\|innerHTML" . --include="*.tsx"
```

### A02: Cryptographic Failures
```bash
# Weak algorithms
grep -rn "md5\|sha1\|DES\|RC4" .
```

### A06: Vulnerable Components
```bash
# Python
pip-audit

# TypeScript
npm audit
```

### A07: Authentication Failures
```bash
# Hardcoded credentials
grep -rn "password\s*=\s*['\"]" . --exclude-dir={node_modules,venv}
```

## Report Format

### Security Score Calculation

```bash
calculate_security_score() {
    local score=100

    # Deduct points for findings
    critical_count=$(jq '.critical | length' /tmp/findings.json 2>/dev/null || echo "0")
    high_count=$(jq '.high | length' /tmp/findings.json 2>/dev/null || echo "0")
    medium_count=$(jq '.medium | length' /tmp/findings.json 2>/dev/null || echo "0")

    score=$((score - critical_count * 20))  # -20 per critical
    score=$((score - high_count * 10))      # -10 per high
    score=$((score - medium_count * 5))     # -5 per medium

    # Minimum score is 0
    if [[ $score -lt 0 ]]; then
        score=0
    fi

    echo "$score"
}
```

### Severity Levels

| Severity | Description | Examples |
|----------|-------------|----------|
| **CRITICAL** | Immediate security risk, must fix | SQL injection, exposed secrets, RCE |
| **HIGH** | Significant risk, should fix soon | Weak crypto, missing auth, XSS |
| **MEDIUM** | Moderate risk, plan to fix | Vulnerable deps, missing logging |
| **LOW** | Minor risk, informational | Code quality, best practices |

## Error Handling

### Scanner Not Installed
```bash
if ! command -v bandit &>/dev/null; then
    echo "Warning: bandit not installed"
    echo "Install: pip install bandit"
    echo "Skipping bandit scan"
fi
```

### Scanner Execution Failure
```bash
bandit -r . -f json || {
    echo "Error: bandit scan failed"
    echo "Check bandit.log for details"
    # Continue with other scanners
}
```

### Invalid Project Structure
```bash
if [[ ! -f "pyproject.toml" ]] && [[ ! -f "package.json" ]]; then
    echo "Warning: Cannot detect project type"
    echo "Running generic security checks only"
    run_generic_checks
fi
```

## Best Practices

### 1. Run Before Every PR
```bash
# Add to pre-commit hook or CI
/security-review || {
    echo "Security issues found!"
    echo "Fix before creating PR"
    exit 1
}
```

### 2. Focus on Critical First
```markdown
Priority order:
1. CRITICAL: Fix immediately
2. HIGH: Fix before merge
3. MEDIUM: Create follow-up ticket
4. LOW: Nice to have
```

### 3. Don't Commit Secrets
```bash
# Use environment variables
export DATABASE_URL="..."

# Use secret management
# AWS Secrets Manager, HashiCorp Vault, etc.

# Never in code:
password = "hardcoded123"  # BAD
```

### 4. Keep Dependencies Updated
```bash
# Python
pip-audit --fix

# TypeScript
npm audit fix
```

## Examples

### Example 1: Python Project (FastAPI)

**Input:**
```bash
$ /security-review
```

**Output:**
```markdown
# Security Review Report

Language: Python (FastAPI)

## Automated Scans

### Bandit: 3 issues
- [B201] Flask debug mode (HIGH)
- [B105] Hardcoded password (CRITICAL)
- [B608] SQL injection (CRITICAL)

### pip-audit: 2 vulnerable dependencies
- urllib3==1.26.0 (CVE-2021-33503)
- requests==2.25.0 (CVE-2021-33503)

## Secrets Detection

CRITICAL: Found 1 potential secret:
- src/config.py:15 - AWS Access Key

## OWASP Top 10

A01 Broken Access Control: WARN
- Found 5 unprotected routes

A03 Injection: CRITICAL
- 2 SQL injection points in src/db/queries.py

A06 Vulnerable Components: HIGH
- 2 vulnerable dependencies

## Security Score: 45/100

## Critical Findings (Must Fix)

1. SQL Injection in src/db/queries.py:42
   - Using string concatenation for query
   - Fix: Use parameterized queries

2. Hardcoded AWS key in src/config.py:15
   - Exposed in version control
   - Fix: Use environment variables

## Recommendations

1. Migrate to parameterized SQL queries
2. Move secrets to environment variables
3. Update vulnerable dependencies
4. Add authorization to unprotected routes
5. Enable security logging
```

### Example 2: TypeScript Project (Next.js)

**Input:**
```bash
$ /security-review
```

**Output:**
```markdown
# Security Review Report

Language: TypeScript (Next.js)

## Automated Scans

### npm audit: 8 vulnerabilities
- 2 critical
- 4 high
- 2 moderate

### ESLint Security: 5 issues
- detect-non-literal-regexp (MEDIUM)
- detect-object-injection (LOW)

## Secrets Detection

No secrets detected

## OWASP Top 10

A03 Injection: WARN
- 1 XSS point: dangerouslySetInnerHTML usage

A06 Vulnerable Components: CRITICAL
- next@12.0.0 has known vulnerabilities
- Upgrade to next@13.5.0+

## Security Score: 70/100

## Critical Findings

1. Outdated Next.js version
   - Current: 12.0.0
   - Latest: 14.0.0
   - Fix: npm install next@latest

## High Findings

1. XSS vulnerability in src/components/Comment.tsx
   - Using dangerouslySetInnerHTML
   - Fix: Use DOMPurify or avoid raw HTML

## Recommendations

1. Update Next.js to latest version
2. Run `npm audit fix` for auto-fixable issues
3. Sanitize HTML before rendering
4. Add Content Security Policy headers
```

## Integration with Workflow

```bash
# Step 1-3: Context, Planning, Implementation
/fetch-ticket-context PROJ-123
/analyze-requirements PROJ-123
/code-implementation PROJ-123

# Step 4: Code quality
/code-quality-check

# Step 5: Security review (THIS SKILL)
/security-review

# If security issues found:
# - Fix critical/high issues
# - Re-run security scan
# - Document accepted risks for medium/low

# Step 6: Create PR (only if security passes)
/create-pr PROJ-123
```

## Troubleshooting

**Issue: "Bandit not found"**
- Install: `pip install bandit`
- Or skip: `--skip-bandit flag`

**Issue: "npm audit fails"**
- Update npm: `npm install -g npm@latest`
- Clear cache: `npm cache clean --force`

**Issue: "Too many false positives"**
- Configure bandit: `.bandit` file
- Configure eslint: `.eslintrc.json`
- Use `--exclude` flags

**Issue: "Scan takes too long"**
- Limit scope: `/security-review src/`
- Skip tests: `--exclude tests/`
- Use faster tools only

## References

- Bandit Documentation: https://bandit.readthedocs.io/
- npm audit: https://docs.npmjs.com/cli/v8/commands/npm-audit
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Python Security Best Practices: `.claude/skills/mastering-python-skill/references/production/security.md`
