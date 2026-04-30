#!/usr/bin/env bash
#
# Swift Project Setup Validator
#
# Checks that Swift / Xcode toolchain is properly configured for development.
# Run before starting a new project or onboarding to an existing one.
#
# Usage: ./validate-setup.sh
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "${YELLOW}!${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

echo "=========================================="
echo "Swift Project Setup Validator"
echo "=========================================="
echo ""

# Check 1: Xcode Command Line Tools
echo "Checking Xcode Command Line Tools..."
if xcode-select -p &>/dev/null; then
    XCODE_PATH=$(xcode-select -p)
    pass "Xcode CLT at $XCODE_PATH"
else
    fail "Xcode Command Line Tools not found — run: xcode-select --install"
fi

# Check 2: Swift version
echo ""
echo "Checking Swift..."
if command -v swift &>/dev/null; then
    SWIFT_VERSION=$(swift --version 2>&1 | grep -oE 'Swift version [0-9]+\.[0-9]+' | head -1)
    SWIFT_MAJOR=$(swift --version 2>&1 | grep -oE 'Swift version [0-9]+' | grep -oE '[0-9]+$' | head -1)
    if [[ "${SWIFT_MAJOR:-0}" -ge 6 ]]; then
        pass "$SWIFT_VERSION (recommended: 6.0+)"
    elif [[ "${SWIFT_MAJOR:-0}" -ge 5 ]]; then
        warn "$SWIFT_VERSION (Swift 6.0+ recommended for strict concurrency)"
    else
        fail "Swift version too old ($SWIFT_VERSION) — update via Xcode or swift.org"
    fi
else
    fail "Swift not found — install Xcode or the Swift toolchain from swift.org"
fi

# Check 3: Xcode version (if full Xcode is installed)
echo ""
echo "Checking Xcode..."
if command -v xcodebuild &>/dev/null; then
    XCODE_VERSION=$(xcodebuild -version 2>/dev/null | head -1)
    XCODE_MAJOR=$(xcodebuild -version 2>/dev/null | grep -oE 'Xcode [0-9]+' | grep -oE '[0-9]+$')
    if [[ "${XCODE_MAJOR:-0}" -ge 16 ]]; then
        pass "$XCODE_VERSION"
    else
        warn "$XCODE_VERSION (Xcode 16+ recommended)"
    fi
else
    info "Full Xcode not installed — CLI tools only (OK for server-side Swift)"
fi

# Check 4: Package.swift
echo ""
echo "Checking Package.swift..."
if [[ -f "Package.swift" ]]; then
    TOOLS_VERSION=$(grep -m1 'swift-tools-version' Package.swift | grep -oE '[0-9]+\.[0-9]+')
    pass "Package.swift found (tools-version: ${TOOLS_VERSION:-unknown})"

    # Check tools version
    TOOLS_MAJOR=$(echo "${TOOLS_VERSION:-0.0}" | cut -d. -f1)
    TOOLS_MINOR=$(echo "${TOOLS_VERSION:-0.0}" | cut -d. -f2)
    if [[ "${TOOLS_MAJOR:-0}" -ge 6 ]] || { [[ "${TOOLS_MAJOR:-0}" -ge 5 ]] && [[ "${TOOLS_MINOR:-0}" -ge 9 ]]; }; then
        pass "Modern tools version (${TOOLS_VERSION})"
    else
        warn "Consider updating swift-tools-version to 6.0 for strict concurrency support"
    fi
else
    info "No Package.swift — expected for Xcode-only iOS projects"
fi

# Check 5: Xcode project / workspace
echo ""
echo "Checking Xcode project..."
XCODEPROJ=$(find . -maxdepth 2 -name "*.xcodeproj" -not -path "*/.*" 2>/dev/null | head -1)
XCWORKSPACE=$(find . -maxdepth 2 -name "*.xcworkspace" -not -path "*/.*" -not -name "*.xcodeproj/*" 2>/dev/null | head -1)

if [[ -n "$XCWORKSPACE" ]]; then
    pass "Workspace found: $XCWORKSPACE"
elif [[ -n "$XCODEPROJ" ]]; then
    pass "Project found: $XCODEPROJ"
elif [[ -f "Package.swift" ]]; then
    info "Pure SPM project (no .xcodeproj)"
else
    warn "No Xcode project or Package.swift found"
fi

# Check 6: SwiftLint
echo ""
echo "Checking SwiftLint..."
if command -v swiftlint &>/dev/null; then
    SWIFTLINT_VERSION=$(swiftlint version)
    pass "SwiftLint $SWIFTLINT_VERSION"

    if [[ -f ".swiftlint.yml" ]]; then
        pass ".swiftlint.yml configuration found"
    else
        warn ".swiftlint.yml not found — using SwiftLint defaults"
    fi
else
    warn "SwiftLint not installed — install via: brew install swiftlint"
fi

# Check 7: SwiftFormat
echo ""
echo "Checking SwiftFormat..."
if command -v swiftformat &>/dev/null; then
    SWIFTFORMAT_VERSION=$(swiftformat --version)
    pass "SwiftFormat $SWIFTFORMAT_VERSION"

    if [[ -f ".swiftformat" ]]; then
        pass ".swiftformat configuration found"
    else
        info ".swiftformat not found — using SwiftFormat defaults"
    fi
else
    info "SwiftFormat not installed — install via: brew install swiftformat"
fi

# Check 8: Periphery (dead code detection)
echo ""
echo "Checking Periphery..."
if command -v periphery &>/dev/null; then
    PERIPHERY_VERSION=$(periphery version 2>/dev/null || echo "unknown")
    pass "Periphery $PERIPHERY_VERSION"
else
    info "Periphery not installed — install via: brew install peripheryapp/periphery/periphery"
fi

# Check 9: Git hooks
echo ""
echo "Checking Git hooks..."
if [[ -d ".git" ]]; then
    if [[ -f ".git/hooks/pre-commit" ]] && [[ -x ".git/hooks/pre-commit" ]]; then
        pass "Pre-commit hook found and executable"
    else
        info "No pre-commit hook — consider adding SwiftLint to pre-commit"
    fi
else
    info "Not a git repository"
fi

# Check 10: Dependencies resolved
echo ""
echo "Checking dependencies..."
if [[ -f "Package.swift" ]]; then
    if [[ -f "Package.resolved" ]]; then
        pass "Package.resolved found (dependencies pinned)"
    else
        warn "Package.resolved not found — run: swift package resolve"
    fi
elif [[ -f "Podfile" ]]; then
    if [[ -f "Podfile.lock" ]]; then
        pass "Podfile.lock found (CocoaPods dependencies pinned)"
    else
        warn "Podfile.lock not found — run: pod install"
    fi
fi

# Summary
echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
if [[ $ERRORS -eq 0 ]] && [[ $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo "Your Swift environment is properly configured."
    exit 0
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}Passed with $WARNINGS warning(s)${NC}"
    echo "Environment is functional but could be improved."
    exit 0
else
    echo -e "${RED}Failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo "Fix errors before proceeding."
    exit 1
fi
