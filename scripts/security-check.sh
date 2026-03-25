#!/bin/bash

###############################################################################
# Security Check Utility
#
# Validates security best practices for AI Store autonomous workflows
#
# Usage:
#   ./security-check.sh [--fix]
#
# Options:
#   --fix    Automatically fix issues where possible
#
# Exit codes:
#   0 = All checks passed
#   1 = Security issues found
#   2 = Critical security issues found
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
WARNINGS=0
FAILED=0
CRITICAL=0

# Options
FIX_MODE=false
if [[ "${1:-}" == "--fix" ]]; then
  FIX_MODE=true
fi

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASSED++))
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  ((WARNINGS++))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAILED++))
}

critical() {
  echo -e "${RED}🚨${NC} CRITICAL: $1"
  ((CRITICAL++))
}

info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

###############################################################################
# Check 1: Environment Variables & Secrets
###############################################################################

check_secrets() {
  section "1. Secrets & Environment Variables"

  # Check for hardcoded secrets in code
  info "Checking for hardcoded secrets..."

  local secret_patterns=(
    "password.*=.*['\"][^'\"]{8,}"
    "api[_-]?key.*=.*['\"][^'\"]{16,}"
    "secret.*=.*['\"][^'\"]{16,}"
    "token.*=.*['\"][^'\"]{16,}"
    "AKIA[0-9A-Z]{16}"  # AWS access key
    "AIza[0-9A-Za-z\\-_]{35}"  # Google API key
    "gh[pousr]_[0-9a-zA-Z]{36}"  # GitHub token
  )

  local found_secrets=false
  for pattern in "${secret_patterns[@]}"; do
    if grep -r -E "$pattern"  --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | grep -v "security-check.sh" | grep -q .; then
      critical "Potential hardcoded secret found: $pattern"
      grep -r -E "$pattern"  --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | grep -v "security-check.sh" | head -3
      found_secrets=true
    fi
  done

  if [ "$found_secrets" = false ]; then
    pass "No hardcoded secrets found in code"
  fi

  # Check .env files are gitignored
  if git check-ignore .env >/dev/null 2>&1; then
    pass ".env file is properly gitignored"
  else
    fail ".env file is NOT gitignored"
    if [ "$FIX_MODE" = true ]; then
      echo ".env" >> .gitignore
      info "Added .env to .gitignore"
    fi
  fi

  # Check if .env.example exists
  if [ -f ".env.example" ]; then
    pass ".env.example exists for documentation"
  else
    warn ".env.example not found (recommended for onboarding)"
  fi

  # Check environment variables are validated
  if grep -r "process\.env\." orchestration/src/ 2>/dev/null | grep -q .; then
    local has_validation=false
    if grep -r "throw.*Error.*environment" orchestration/src/ 2>/dev/null | grep -q .; then
      has_validation=true
    fi

    if [ "$has_validation" = true ]; then
      pass "Environment variables have validation"
    else
      warn "Environment variables used but no validation found"
    fi
  fi
}

###############################################################################
# Check 2: Input Validation
###############################################################################

check_input_validation() {
  section "2. Input Validation"

  # Check for command injection vulnerabilities
  info "Checking for command injection risks..."

  local unsafe_patterns=(
    "exec\(.*process\.argv"
    "execSync\(.*\$\{"
    "spawn\(.*\$\{"
    "eval\("
  )

  local found_unsafe=false
  for pattern in "${unsafe_patterns[@]}"; do
    if grep -r -E "$pattern" orchestration/src/ 2>/dev/null | grep -q .; then
      fail "Potential command injection: $pattern"
      grep -r -E "$pattern" orchestration/src/ 2>/dev/null | head -2
      found_unsafe=true
    fi
  done

  if [ "$found_unsafe" = false ]; then
    pass "No obvious command injection risks found"
  fi

  # Check for path traversal
  info "Checking for path traversal risks..."

  if grep -r "path\.join.*\.\." orchestration/src/ 2>/dev/null | grep -q .; then
    warn "Potential path traversal with '..' found"
    grep -r "path\.join.*\.\." orchestration/src/ 2>/dev/null | head -2
  else
    pass "No path traversal patterns found"
  fi

  # Check ticket key validation
  if grep -r "ticketKey" orchestration/src/ 2>/dev/null | grep -q .; then
    if grep -r "PROJ-[0-9]" orchestration/src/ 2>/dev/null | grep -q .; then
      pass "Ticket key format validation present"
    else
      warn "Ticket keys used but format validation not found"
    fi
  fi
}

###############################################################################
# Check 3: File Permissions
###############################################################################

check_file_permissions() {
  section "3. File Permissions"

  # Check script files are executable
  local scripts=(
    "scripts/security-check.sh"
    "tests/test-autonomous-workflow.sh"
  )

  for script in "${scripts[@]}"; do
    if [ -f "$script" ]; then
      if [ -x "$script" ]; then
        pass "$script is executable"
      else
        fail "$script is not executable"
        if [ "$FIX_MODE" = true ]; then
          chmod +x "$script"
          info "Made $script executable"
        fi
      fi
    fi
  done

  # Check sensitive files are not world-readable
  local sensitive_files=(
    ".env"
    ".env.local"
    ".env.development"
  )

  for file in "${sensitive_files[@]}"; do
    if [ -f "$file" ]; then
      local perms=$(stat -f "%Lp" "$file" 2>/dev/null || stat -c "%a" "$file" 2>/dev/null)
      if [ "$perms" = "600" ] || [ "$perms" = "400" ]; then
        pass "$file has secure permissions ($perms)"
      else
        warn "$file has insecure permissions ($perms, should be 600)"
        if [ "$FIX_MODE" = true ]; then
          chmod 600 "$file"
          info "Changed $file permissions to 600"
        fi
      fi
    fi
  done
}

###############################################################################
# Check 4: Dependencies Security
###############################################################################

check_dependencies() {
  section "4. Dependencies Security"

  # Check if npm audit is available
  if command -v npm >/dev/null 2>&1; then
    info "Running npm audit..."

    if npm audit --audit-level=high 2>&1 | grep -q "found 0 vulnerabilities"; then
      pass "No high/critical vulnerabilities in dependencies"
    else
      local vuln_count=$(npm audit --audit-level=high 2>&1 | grep -o "[0-9]* vulnerabilities" | head -1 | awk '{print $1}')
      if [ -n "$vuln_count" ] && [ "$vuln_count" -gt 0 ]; then
        fail "Found $vuln_count high/critical vulnerabilities"
        info "Run 'npm audit fix' to fix automatically"
      fi
    fi
  else
    warn "npm not available, skipping dependency audit"
  fi

  # Check for package-lock.json
  if [ -f "package-lock.json" ]; then
    pass "package-lock.json exists (dependency locking)"
  else
    warn "package-lock.json not found (dependencies not locked)"
  fi
}

###############################################################################
# Check 5: Git Security
###############################################################################

check_git_security() {
  section "5. Git Security"

  # Check .git directory permissions
  if [ -d ".git" ]; then
    local git_perms=$(stat -f "%Lp" ".git" 2>/dev/null || stat -c "%a" ".git" 2>/dev/null)
    if [ "$git_perms" = "700" ] || [ "$git_perms" = "755" ]; then
      pass ".git directory has appropriate permissions"
    else
      warn ".git directory has unusual permissions: $git_perms"
    fi
  fi

  # Check for sensitive files in git history
  info "Checking for sensitive files in git..."

  local sensitive_patterns=(
    "\.env$"
    "\.env\.local$"
    "id_rsa$"
    "\.pem$"
    "\.key$"
  )

  local found_sensitive=false
  for pattern in "${sensitive_patterns[@]}"; do
    if git log --all --full-history --pretty=format: --name-only | grep -E "$pattern" | grep -q .; then
      critical "Sensitive file found in git history: $pattern"
      git log --all --full-history --pretty=format:"%H %s" --name-only | grep -E "$pattern" -B 1 | head -3
      found_sensitive=true
    fi
  done

  if [ "$found_sensitive" = false ]; then
    pass "No sensitive files found in git history"
  else
    info "To remove from history: git filter-branch or BFG Repo-Cleaner"
  fi

  # Check gitignore coverage
  local should_ignore=(
    "node_modules"
    ".env"
    ".env.local"
    "*.log"
    ".DS_Store"
  )

  for pattern in "${should_ignore[@]}"; do
    if grep -q "^$pattern" .gitignore 2>/dev/null; then
      pass "$pattern is gitignored"
    else
      warn "$pattern is not in .gitignore"
      if [ "$FIX_MODE" = true ]; then
        echo "$pattern" >> .gitignore
        info "Added $pattern to .gitignore"
      fi
    fi
  done
}

###############################################################################
# Check 6: Code Injection Prevention
###############################################################################

check_code_injection() {
  section "6. Code Injection Prevention"

  # Check for eval usage
  if grep -r "eval(" orchestration/src/ 2>/dev/null | grep -v "security-check.sh" | grep -q .; then
    critical "eval() usage found (code injection risk)"
    grep -r "eval(" orchestration/src/ 2>/dev/null | grep -v "security-check.sh" | head -3
  else
    pass "No eval() usage found"
  fi

  # Check for Function constructor
  if grep -r "new Function(" orchestration/src/ 2>/dev/null | grep -q .; then
    fail "Function constructor found (code injection risk)"
    grep -r "new Function(" orchestration/src/ 2>/dev/null | head -2
  else
    pass "No Function constructor usage found"
  fi

  # Check for unsafe JSON parsing
  if grep -r "JSON\.parse(.*req\."  2>/dev/null | grep -q .; then
    warn "Direct JSON.parse on request data (validate schema first)"
  else
    pass "No unsafe JSON parsing patterns found"
  fi
}

###############################################################################
# Check 7: Logging & Privacy
###############################################################################

check_logging() {
  section "7. Logging & Privacy"

  # Check for logging sensitive data
  info "Checking for sensitive data in logs..."

  local sensitive_log_patterns=(
    "console\.log.*password"
    "console\.log.*token"
    "console\.log.*secret"
    "console\.log.*apiKey"
  )

  local found_sensitive_log=false
  for pattern in "${sensitive_log_patterns[@]}"; do
    if grep -r -i -E "$pattern" orchestration/src/ 2>/dev/null | grep -v "security-check.sh" | grep -q .; then
      warn "Potential sensitive data logging: $pattern"
      grep -r -i -E "$pattern" orchestration/src/ 2>/dev/null | grep -v "security-check.sh" | head -2
      found_sensitive_log=true
    fi
  done

  if [ "$found_sensitive_log" = false ]; then
    pass "No sensitive data logging found"
  fi

  # Check log file permissions
  if [ -d "logs" ]; then
    for logfile in logs/*.log; do
      if [ -f "$logfile" ]; then
        local perms=$(stat -f "%Lp" "$logfile" 2>/dev/null || stat -c "%a" "$logfile" 2>/dev/null)
        if [ "$perms" = "600" ] || [ "$perms" = "644" ]; then
          pass "$logfile has secure permissions"
        else
          warn "$logfile has unusual permissions: $perms"
        fi
      fi
    done
  fi
}

###############################################################################
# Check 8: Access Control
###############################################################################

check_access_control() {
  section "8. Access Control"

  # Check if utilities validate user permissions
  if grep -r "process\.getuid" orchestration/src/ 2>/dev/null | grep -q .; then
    pass "User ID checks present"
  else
    info "No explicit user permission checks (may be intentional)"
  fi

  # Check for sudo usage
  if grep -r "sudo"  2>/dev/null | grep -v "security-check.sh" | grep -q .; then
    warn "sudo usage found (potential privilege escalation)"
    grep -r "sudo"  2>/dev/null | grep -v "security-check.sh" | head -2
  else
    pass "No sudo usage found"
  fi
}

###############################################################################
# Summary
###############################################################################

show_summary() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}Security Check Summary${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${GREEN}Passed:${NC}    $PASSED"
  echo -e "${YELLOW}Warnings:${NC}  $WARNINGS"
  echo -e "${RED}Failed:${NC}    $FAILED"
  echo -e "${RED}Critical:${NC}  $CRITICAL"
  echo ""

  local total=$((PASSED + WARNINGS + FAILED + CRITICAL))
  local score=$((PASSED * 100 / total))

  if [ "$CRITICAL" -gt 0 ]; then
    echo -e "${RED}🚨 CRITICAL ISSUES FOUND - Fix immediately!${NC}"
    return 2
  elif [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}❌ Security issues found - Review and fix${NC}"
    return 1
  elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Warnings found - Consider addressing${NC}"
    echo -e "Security Score: ${score}% (Good)"
    return 0
  else
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    echo -e "Security Score: ${score}% (Excellent)"
    return 0
  fi
}

###############################################################################
# Main
###############################################################################

main() {
  echo -e "${BLUE}"
  echo "╔═══════════════════════════════════════════════════════╗"
  echo "║         Agentic Framework Security Check Utility      ║"
  echo "║                                                       ║"
  echo "║  Validates security best practices for autonomous     ║"
  echo "║  workflows and prevents common vulnerabilities        ║"
  echo "╚═══════════════════════════════════════════════════════╝"
  echo -e "${NC}"

  if [ "$FIX_MODE" = true ]; then
    info "Running in FIX mode - will attempt to fix issues"
  fi

  check_secrets
  check_input_validation
  check_file_permissions
  check_dependencies
  check_git_security
  check_code_injection
  check_logging
  check_access_control

  show_summary
  return $?
}

# Run main
main
exit $?
