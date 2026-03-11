#!/usr/bin/env python3

"""
VALIDATE SUBAGENT OUTPUT HOOK

Triggered when analyzer agents complete (SubagentStop hook)
Validates JSON output format and checks for quality issues
Exit codes:
  0 - Validation passed, allow continuation
  2 - Validation failed, block continuation
"""

import sys
import json
import os
from pathlib import Path

def validate_json_format(output):
    """Validate that output is valid JSON"""
    try:
        data = json.loads(output)
        return True, data, None
    except json.JSONDecodeError as e:
        return False, None, f"Invalid JSON: {str(e)}"

def validate_required_sections(data):
    """Check for required sections in analyzer output"""
    errors = []

    # Required top-level fields
    required_fields = ['agent_name', 'timestamp', 'findings']
    for field in required_fields:
        if field not in data:
            errors.append(f"Missing required field: {field}")

    # Validate agent_name is one of the expected analyzers
    expected_agents = [
        'structure-architecture-analyzer',
        'tech-stack-dependencies-analyzer',
        'code-patterns-testing-analyzer',
        'data-flows-integrations-analyzer'
    ]

    if 'agent_name' in data and data['agent_name'] not in expected_agents:
        errors.append(f"Unknown agent name: {data['agent_name']}")

    # Validate findings is an object
    if 'findings' in data and not isinstance(data['findings'], dict):
        errors.append("'findings' must be an object")

    return errors

def count_needs_verification(data):
    """Count NEEDS_VERIFICATION markers"""
    count = 0

    if 'needs_verification' in data:
        if isinstance(data['needs_verification'], list):
            count = len(data['needs_verification'])

    # Also check in findings
    if 'findings' in data:
        findings_str = json.dumps(data['findings'])
        count += findings_str.count('NEEDS_VERIFICATION')

    return count

def validate_agent_output(output):
    """Main validation function"""
    errors = []
    warnings = []

    # 1. Validate JSON format
    valid_json, data, json_error = validate_json_format(output)
    if not valid_json:
        return {
            'valid': False,
            'errors': [json_error],
            'warnings': []
        }

    # 2. Validate required sections
    section_errors = validate_required_sections(data)
    errors.extend(section_errors)

    # 3. Count NEEDS_VERIFICATION markers
    nv_count = count_needs_verification(data)
    if nv_count > 3:
        errors.append(f"Too many NEEDS_VERIFICATION markers: {nv_count} (max: 3)")
    elif nv_count > 0:
        warnings.append(f"Contains {nv_count} NEEDS_VERIFICATION marker(s)")

    # 4. Check if findings is empty or too sparse
    if 'findings' in data:
        if not data['findings']:
            warnings.append("Findings object is empty")
        elif len(data['findings']) < 3:
            warnings.append(f"Sparse findings: only {len(data['findings'])} categories")

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'data': data
    }

def main():
    """Main hook execution"""
    # Read stdin for agent output
    try:
        output = sys.stdin.read()
    except Exception as e:
        print(f"ERROR: Failed to read stdin: {str(e)}", file=sys.stderr)
        sys.exit(2)

    if not output or output.strip() == '':
        print("ERROR: Empty agent output", file=sys.stderr)
        sys.exit(2)

    # Validate
    result = validate_agent_output(output)

    # Print results
    if result['valid']:
        print("✓ Subagent output validation passed")
        if result['warnings']:
            print("\nWarnings:")
            for warning in result['warnings']:
                print(f"  - {warning}")
        sys.exit(0)  # Allow continuation
    else:
        print("✗ Subagent output validation failed", file=sys.stderr)
        print("\nErrors:", file=sys.stderr)
        for error in result['errors']:
            print(f"  - {error}", file=sys.stderr)

        if result['warnings']:
            print("\nWarnings:", file=sys.stderr)
            for warning in result['warnings']:
                print(f"  - {warning}", file=sys.stderr)

        sys.exit(2)  # Block continuation

if __name__ == '__main__':
    main()
