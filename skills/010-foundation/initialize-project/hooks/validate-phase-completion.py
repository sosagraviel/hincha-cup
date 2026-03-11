#!/usr/bin/env python3

"""
VALIDATE PHASE COMPLETION HOOK

Triggered when a phase task completes (TaskCompleted hook)
Validates that phase outputs exist and are valid
Exit codes:
  0 - Phase completed successfully
  2 - Phase incomplete, block continuation
"""

import sys
import json
import os
from pathlib import Path

def get_project_path():
    """Get project path from environment or current directory"""
    return os.environ.get('PROJECT_PATH', os.getcwd())

def validate_phase1(project_path):
    """Validate Phase 1: Parallel Analysis"""
    errors = []
    warnings = []

    temp_dir = Path(project_path) / '.claude-temp'
    phase1_dir = temp_dir / 'phase1-outputs'

    # Check temp directory exists
    if not temp_dir.exists():
        errors.append(f"Temp directory not found: {temp_dir}")
        return {'valid': False, 'errors': errors, 'warnings': warnings}

    # Check phase1 outputs directory
    if not phase1_dir.exists():
        errors.append(f"Phase 1 outputs directory not found: {phase1_dir}")
        return {'valid': False, 'errors': errors, 'warnings': warnings}

    # Check for 4 analyzer outputs
    expected_outputs = [
        '01-structure-architecture.json',
        '02-tech-stack-dependencies.json',
        '03-code-patterns-testing.json',
        '04-data-flows-integrations.json'
    ]

    for output_file in expected_outputs:
        output_path = phase1_dir / output_file
        if not output_path.exists():
            errors.append(f"Missing analyzer output: {output_file}")
        else:
            # Check file size
            size = output_path.stat().st_size
            if size < 500:
                warnings.append(f"Small output file ({size} bytes): {output_file}")

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }

def validate_phase2(project_path):
    """Validate Phase 2: Consolidation"""
    errors = []
    warnings = []

    temp_dir = Path(project_path) / '.claude-temp'
    consolidation_file = temp_dir / 'consolidation.json'

    if not consolidation_file.exists():
        errors.append(f"Consolidation file not found: {consolidation_file}")
        return {'valid': False, 'errors': errors, 'warnings': warnings}

    # Check file size
    size = consolidation_file.stat().st_size
    if size < 1000:
        errors.append(f"Consolidation file too small: {size} bytes")

    # Validate JSON structure
    try:
        with open(consolidation_file, 'r') as f:
            data = json.load(f)

        # Check required fields
        required_fields = ['timestamp', 'agents_count', 'findings']
        for field in required_fields:
            if field not in data:
                errors.append(f"Consolidation missing field: {field}")

        # Check agents count
        if 'agents_count' in data and data['agents_count'] != 4:
            warnings.append(f"Expected 4 agents, got {data['agents_count']}")

    except json.JSONDecodeError as e:
        errors.append(f"Invalid JSON in consolidation: {str(e)}")

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }

def validate_phase3(project_path):
    """Validate Phase 3: Opus Synthesis"""
    errors = []
    warnings = []

    temp_dir = Path(project_path) / '.claude-temp'
    synthesis_file = temp_dir / 'synthesis-raw.md'

    if not synthesis_file.exists():
        errors.append(f"Synthesis output not found: {synthesis_file}")
        return {'valid': False, 'errors': errors, 'warnings': warnings}

    # Check file size
    size = synthesis_file.stat().st_size
    if size < 5000:
        errors.append(f"Synthesis output too small: {size} bytes")

    # Check for section markers
    with open(synthesis_file, 'r') as f:
        content = f.read()

    if '<!-- SECTION: CLAUDE.MD -->' not in content:
        errors.append("Missing CLAUDE.MD section marker")

    if '<!-- SECTION: PROJECT-CONTEXT -->' not in content:
        errors.append("Missing PROJECT-CONTEXT section marker")

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }

def validate_phase4(project_path):
    """Validate Phase 4: File Writing"""
    errors = []
    warnings = []

    project = Path(project_path)
    claude_md = project / '.claude' / 'CLAUDE.md'
    project_context = project / '.claude' / 'skills' / 'project-context' / 'SKILL.md'

    # Check CLAUDE.md
    if not claude_md.exists():
        errors.append(f"CLAUDE.md not found: {claude_md}")
    else:
        # Check line count
        with open(claude_md, 'r') as f:
            lines = len(f.readlines())
        if lines > 200:
            errors.append(f"CLAUDE.md exceeds 200 lines: {lines}")
        elif lines < 80:
            warnings.append(f"CLAUDE.md under 80 lines: {lines}")

    # Check project-context
    if not project_context.exists():
        errors.append(f"project-context not found: {project_context}")
    else:
        # Check line count
        with open(project_context, 'r') as f:
            lines = len(f.readlines())
        if lines > 400:
            errors.append(f"project-context exceeds 400 lines: {lines}")
        elif lines < 250:
            errors.append(f"project-context under 250 lines: {lines}")

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }

def validate_phase5(project_path):
    """Validate Phase 5: Resource Copying"""
    errors = []
    warnings = []

    project = Path(project_path)
    skills_dir = project / '.claude' / 'skills'
    agents_dir = project / '.claude' / 'agents'
    commands_dir = project / '.claude' / 'commands'

    # Check skills
    if not skills_dir.exists():
        errors.append(f"Skills directory not found: {skills_dir}")
    else:
        skills_count = len(list(skills_dir.rglob('SKILL.md')))
        if skills_count < 3:
            errors.append(f"Too few skills: {skills_count} (min: 3)")
        elif skills_count < 10:
            warnings.append(f"Fewer than 10 skills: {skills_count}")

    # Check agents
    if not agents_dir.exists():
        errors.append(f"Agents directory not found: {agents_dir}")
    else:
        agents_count = len(list(agents_dir.glob('*.md')))
        if agents_count < 3:
            errors.append(f"Too few agents: {agents_count} (min: 3)")

    # Check commands (optional)
    if not commands_dir.exists():
        warnings.append("Commands directory not found")

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }

def detect_current_phase():
    """Detect which phase just completed based on environment"""
    # This would be set by the orchestration script
    phase = os.environ.get('CURRENT_PHASE', '0')
    return int(phase)

def main():
    """Main hook execution"""
    project_path = get_project_path()
    current_phase = detect_current_phase()

    print(f"Validating Phase {current_phase} completion...")

    # Select validator based on phase
    validators = {
        1: validate_phase1,
        2: validate_phase2,
        3: validate_phase3,
        4: validate_phase4,
        5: validate_phase5
    }

    if current_phase not in validators:
        print(f"Unknown phase: {current_phase}")
        sys.exit(0)  # Don't block

    validator = validators[current_phase]
    result = validator(project_path)

    # Print results
    if result['valid']:
        print(f"✓ Phase {current_phase} validation passed")
        if result['warnings']:
            print("\nWarnings:")
            for warning in result['warnings']:
                print(f"  - {warning}")
        sys.exit(0)  # Allow continuation
    else:
        print(f"✗ Phase {current_phase} validation failed", file=sys.stderr)
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
