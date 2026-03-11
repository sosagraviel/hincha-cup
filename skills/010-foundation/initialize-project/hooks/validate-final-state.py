#!/usr/bin/env python3

"""
VALIDATE FINAL STATE HOOK

Triggered at skill completion (Stop hook)
Validates all 6 phases completed successfully and logs final metrics
Exit code: 0 (informational only, doesn't block)
"""

import sys
import json
import os
from pathlib import Path
from datetime import datetime

def get_project_path():
    """Get project path from environment or current directory"""
    return os.environ.get('PROJECT_PATH', os.getcwd())

def check_all_phases_complete(project_path):
    """Check that all 6 phases completed"""
    results = {
        'phase1': False,
        'phase2': False,
        'phase3': False,
        'phase4': False,
        'phase5': False,
        'phase6': False
    }

    project = Path(project_path)
    temp_dir = project / '.claude-temp'

    # Phase 1: Check analyzer outputs
    phase1_dir = temp_dir / 'phase1-outputs'
    if phase1_dir.exists():
        analyzer_files = list(phase1_dir.glob('*.json'))
        results['phase1'] = len(analyzer_files) >= 4

    # Phase 2: Check consolidation
    consolidation_file = temp_dir / 'consolidation.json'
    results['phase2'] = consolidation_file.exists()

    # Phase 3: Check synthesis
    synthesis_file = temp_dir / 'synthesis-raw.md'
    results['phase3'] = synthesis_file.exists()

    # Phase 4: Check files written
    claude_md = project / '.claude' / 'CLAUDE.md'
    project_context = project / '.claude' / 'skills' / 'project-context' / 'SKILL.md'
    results['phase4'] = claude_md.exists() and project_context.exists()

    # Phase 5: Check resources
    skills_dir = project / '.claude' / 'skills'
    agents_dir = project / '.claude' / 'agents'
    results['phase5'] = skills_dir.exists() and agents_dir.exists()

    # Phase 6: Check metrics
    metrics_file = temp_dir / 'metrics.json'
    results['phase6'] = metrics_file.exists()

    return results

def collect_metrics(project_path):
    """Collect final metrics"""
    project = Path(project_path)
    metrics = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'project_path': str(project_path)
    }

    # CLAUDE.md metrics
    claude_md = project / '.claude' / 'CLAUDE.md'
    if claude_md.exists():
        with open(claude_md, 'r') as f:
            claude_lines = len(f.readlines())
        metrics['claude_md_lines'] = claude_lines
        metrics['claude_md_bytes'] = claude_md.stat().st_size
    else:
        metrics['claude_md_lines'] = 0
        metrics['claude_md_bytes'] = 0

    # project-context metrics
    project_context = project / '.claude' / 'skills' / 'project-context' / 'SKILL.md'
    if project_context.exists():
        with open(project_context, 'r') as f:
            context_lines = len(f.readlines())
        metrics['project_context_lines'] = context_lines
        metrics['project_context_bytes'] = project_context.stat().st_size
    else:
        metrics['project_context_lines'] = 0
        metrics['project_context_bytes'] = 0

    # Skills count
    skills_dir = project / '.claude' / 'skills'
    if skills_dir.exists():
        metrics['skills_count'] = len(list(skills_dir.rglob('SKILL.md')))
    else:
        metrics['skills_count'] = 0

    # Agents count
    agents_dir = project / '.claude' / 'agents'
    if agents_dir.exists():
        metrics['agents_count'] = len(list(agents_dir.glob('*.md')))
    else:
        metrics['agents_count'] = 0

    # Commands count
    commands_dir = project / '.claude' / 'commands'
    if commands_dir.exists():
        metrics['commands_count'] = len(list(commands_dir.glob('*.md')))
    else:
        metrics['commands_count'] = 0

    return metrics

def save_final_metrics(project_path, phase_results, metrics):
    """Save final metrics to file"""
    project = Path(project_path)
    temp_dir = project / '.claude-temp'
    temp_dir.mkdir(parents=True, exist_ok=True)

    final_metrics = {
        'validation': {
            'all_phases_complete': all(phase_results.values()),
            'phases': phase_results
        },
        'metrics': metrics
    }

    metrics_file = temp_dir / 'final-metrics.json'
    with open(metrics_file, 'w') as f:
        json.dump(final_metrics, f, indent=2)

    return metrics_file

def main():
    """Main hook execution"""
    project_path = get_project_path()

    print("=" * 72)
    print("  FINAL STATE VALIDATION")
    print("=" * 72)
    print()

    # Check all phases
    print("Checking phase completion...")
    phase_results = check_all_phases_complete(project_path)

    for phase_num, completed in phase_results.items():
        status = "✓" if completed else "✗"
        print(f"  {status} {phase_num}")

    all_complete = all(phase_results.values())
    print()

    if all_complete:
        print("✓ All 6 phases completed successfully")
    else:
        incomplete = [p for p, c in phase_results.items() if not c]
        print(f"⚠ Incomplete phases: {', '.join(incomplete)}")

    print()

    # Collect metrics
    print("Collecting metrics...")
    metrics = collect_metrics(project_path)

    print()
    print("Final metrics:")
    print(f"  CLAUDE.md:       {metrics['claude_md_lines']} lines, {metrics['claude_md_bytes']} bytes")
    print(f"  project-context: {metrics['project_context_lines']} lines, {metrics['project_context_bytes']} bytes")
    print(f"  Skills:          {metrics['skills_count']}")
    print(f"  Agents:          {metrics['agents_count']}")
    print(f"  Commands:        {metrics['commands_count']}")
    print()

    # Save metrics
    metrics_file = save_final_metrics(project_path, phase_results, metrics)
    print(f"Metrics saved to: {metrics_file}")
    print()

    # Success criteria check
    print("Success criteria:")
    criteria_met = 0
    criteria_total = 5

    # 1. All phases complete
    if all_complete:
        print("  ✓ All phases complete")
        criteria_met += 1
    else:
        print("  ✗ Not all phases complete")

    # 2. CLAUDE.md length
    if 80 <= metrics['claude_md_lines'] <= 200:
        print(f"  ✓ CLAUDE.md length OK ({metrics['claude_md_lines']} lines)")
        criteria_met += 1
    else:
        print(f"  ✗ CLAUDE.md length out of range ({metrics['claude_md_lines']} lines)")

    # 3. project-context length
    if 250 <= metrics['project_context_lines'] <= 400:
        print(f"  ✓ project-context length OK ({metrics['project_context_lines']} lines)")
        criteria_met += 1
    else:
        print(f"  ✗ project-context length out of range ({metrics['project_context_lines']} lines)")

    # 4. Skills count
    if metrics['skills_count'] >= 10:
        print(f"  ✓ Skills count OK ({metrics['skills_count']})")
        criteria_met += 1
    else:
        print(f"  ⚠ Low skills count ({metrics['skills_count']}, recommended: 10+)")

    # 5. Agents count
    if metrics['agents_count'] >= 3:
        print(f"  ✓ Agents count OK ({metrics['agents_count']})")
        criteria_met += 1
    else:
        print(f"  ✗ Insufficient agents ({metrics['agents_count']}, min: 3)")

    print()
    print(f"Success: {criteria_met}/{criteria_total} criteria met")
    print()

    print("=" * 72)
    print("  INITIALIZATION COMPLETE")
    print("=" * 72)

    # Always exit 0 (informational only)
    sys.exit(0)

if __name__ == '__main__':
    main()
