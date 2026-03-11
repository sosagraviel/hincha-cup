# Initialize-Project Analyzer Agents

This directory contains the 4 analyzer agents used in Phase 1 of the initialize-project skill. Each agent analyzes a different aspect of the codebase and produces structured JSON output.

## Overview

The initialize-project skill uses a **deterministic workflow** with 4 parallel analyzer agents:

1. **structure-architecture-analyzer** - Analyzes codebase structure, frameworks, and architecture patterns
2. **tech-stack-dependencies-analyzer** - Analyzes dependencies, CI/CD, deployment, and environment setup
3. **code-patterns-testing-analyzer** - Analyzes code patterns, conventions, and testing strategies
4. **data-flows-integrations-analyzer** - Analyzes data flows, authentication, and external integrations

All agents run in parallel during Phase 1 using the Task tool with `run_in_background: true`. Their outputs are validated against the JSON schema, then consolidated in Phase 2.

---

## Agent Inventory

### Phase 1: Parallel Analysis (Analyzer Agents)

| File | Agent Name | Model | Purpose |
|------|------------|-------|---------|
| 01-structure-architecture.md | structure-architecture-analyzer | haiku | Analyzes repository type, languages, frameworks, architecture patterns, file organization |
| 02-tech-stack-dependencies.md | tech-stack-dependencies-analyzer | haiku | Analyzes dependencies, CI/CD pipelines, deployment configuration, environment setup |
| 03-code-patterns-testing.md | code-patterns-testing-analyzer | haiku | Analyzes code patterns, conventions, testing strategies, code quality tools |
| 04-data-flows-integrations.md | data-flows-integrations-analyzer | haiku | Analyzes data flows, authentication, authorization, external integrations, API design |

### Phase 5: Synthesis (Synthesizer Agent)

The synthesizer agent (Opus model) is launched in Phase 3 to consolidate all 4 analyzer outputs into CLAUDE.md and project-context. It is defined in the workflow scripts, not in this directory.

---

## Output Contracts

All agents output JSON validated against `config/schemas/phase1-analysis.schema.json`.

### Common Structure

```json
{
  "agent_name": "string (one of 4 analyzer names)",
  "timestamp": "ISO 8601 timestamp",
  "findings": {
    /* agent-specific findings */
  },
  "needs_verification": [
    {"item": "description", "reason": "why"}
  ]
}
```

### Agent-Specific Findings

**Agent 01 (Structure & Architecture)**:
- repository_type, packages, languages, runtimes
- frameworks (backend, frontend, testing)
- architecture_pattern, file_placement, path_aliases
- database (type, ORM, migrations)

**Agent 02 (Tech Stack & Dependencies)**:
- dependencies (by_package, conflicts, lock_strategy)
- ci_cd (provider, config_files, commands, environments)
- deployment (target, config_files, runtime_config, scaling)
- environment (required_vars, environments, config_approach)
- databases, external_services, build_tools, monorepo

**Agent 03 (Code Patterns & Testing)**:
- naming_conventions (variables, functions, classes, files, constants)
- code_organization (component, module, test, config patterns)
- import_export, error_handling, async_patterns
- testing (frameworks, counts, organization, structure)
- test_patterns, test_coverage, code_quality
- pre_commit_hooks, code_review, documentation, security_patterns

**Agent 04 (Data Flows & Integrations)**:
- request_response_flow (framework, routes, middleware)
- data_transformation, state_management, caching, data_validation
- authentication (strategy, JWT/OAuth config, password hashing)
- authorization (strategy, roles, permissions)
- api_design (style, versioning, pagination)
- api_documentation, rate_limiting
- external_integrations, webhooks, event_systems
- background_jobs, realtime, error_handling

---

## Design Principles

1. **Parallelization**: All 4 agents run concurrently in Phase 1 for speed
2. **Specialization**: Each agent has a focused domain to prevent overlap
3. **Evidence-based**: All agents report only what they find, never assume
4. **Deterministic output**: JSON output validated against schema
5. **Limited verification**: Max 3 items in needs_verification array
6. **File references**: All findings include file paths and line numbers

---

## Workflow Integration

### Phase 1: Parallel Analysis
`scripts/phase1-analysis.sh` launches all 4 agents using Task tool with `run_in_background: true`, waits for completion, validates outputs against schema.

### Phase 2: Consolidation
`scripts/phase2-consolidation.sh` merges all 4 outputs using `scripts/helpers/merge-analyses.js`, identifies gaps, generates GAP questions for user.

### Phase 3: Synthesis
`scripts/phase3-synthesis.sh` invokes Opus synthesizer with consolidated input to generate CLAUDE.md and project-context.

### Validation
`hooks/validate-subagent-output.py` validates each agent output when it completes (SubagentStop hook).

---

## Usage

These agents are invoked by `scripts/orchestrate-initialization.sh`. Each agent:
- Uses tools: Read, Grep, Glob (NOT Bash)
- Runs in background for parallel execution
- Outputs JSON matching schema
- Has max 3 needs_verification items

See `SKILL.md` for the main entry point and workflow overview.

---

## Related Files

- **Orchestration**: `scripts/orchestrate-initialization.sh`
- **Phase Scripts**: `scripts/phase1-analysis.sh` through `scripts/phase6-validation.sh`
- **Validation**: `utils/validators/validate-agent-output.js`
- **Schema**: `config/schemas/phase1-analysis.schema.json`
- **Hook**: `hooks/validate-subagent-output.py`
- **Helpers**: `scripts/helpers/merge-analyses.js`, `scripts/helpers/parse-opus-output.js`

---

**Last Updated**: 2026-03-10
**Version**: 2.0.0 (Refactored for deterministic workflow)
