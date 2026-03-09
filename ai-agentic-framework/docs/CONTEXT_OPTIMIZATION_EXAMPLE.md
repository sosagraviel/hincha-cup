# Context Optimization Example

**Purpose**: Real-world example showing the impact of the Context Management System on skill linking and context window usage.

**Date**: 2026-03-09
**Version**: 1.0
**Project**: Gira (TypeScript + NestJS + React + PostgreSQL)

---

## Table of Contents

1. [Stack Profile](#stack-profile)
2. [Before Context Management](#before-context-management)
3. [After Context Management](#after-context-management)
4. [Impact Analysis](#impact-analysis)
5. [Multi-Language Example](#multi-language-example)

---

## Stack Profile

**Detected Stack** (Gira Project):
```json
{
  "languages": [
    { "name": "typescript", "confidence": "high", "detectedBy": "tsconfig.json" }
  ],
  "backend_frameworks": [
    { "name": "nestjs", "version": "11.0.11", "confidence": "high" }
  ],
  "frontend_frameworks": [
    { "name": "react", "version": "19.1.0", "confidence": "high" }
  ],
  "testing": [
    { "name": "jest", "type": "unit", "confidence": "high" },
    { "name": "playwright", "type": "e2e", "confidence": "high" }
  ],
  "infrastructure": {
    "docker": true,
    "ci_cd": "github-actions"
  }
}
```

---

## Before Context Management

### Problem: Every agent received ALL 22+ skills regardless of relevance

#### Implementer Agent (Before)

```yaml
---
name: implementer-typescript
description: Implement TypeScript code
model: sonnet
skills:
  # Universal
  - project-context

  # Languages (ALL, not just TypeScript)
  - mastering-typescript
  - mastering-python-skill          # ❌ Not relevant
  - mastering-go-skill               # ❌ Not relevant
  - mastering-java-skill             # ❌ Not relevant
  - mastering-rust-skill             # ❌ Not relevant
  - mastering-ruby-skill             # ❌ Not relevant

  # Frontend Frameworks (ALL, not just React)
  - react-frontend
  - atomic-design-react
  - vue-frontend                     # ❌ Not relevant
  - angular-patterns                 # ❌ Not relevant
  - svelte-patterns                  # ❌ Not relevant

  # Backend Frameworks (ALL, not detected)
  - nestjs-patterns                  # ⚠️ Relevant but not properly selected
  - express-patterns                 # ❌ Not relevant
  - fastapi-patterns                 # ❌ Not relevant
  - django-patterns                  # ❌ Not relevant
  - flask-patterns                   # ❌ Not relevant

  # Testing (Not needed for implementer)
  - jest-coverage-automation         # ❌ Should be tester-only
  - playwright-e2e-automation        # ❌ Should be tester-only
  - pytest-patterns                  # ❌ Not relevant

  # Planning (Not needed for implementer)
  - analyze-requirements             # ❌ Should be planner-only
  - design-doc-mermaid               # ❌ Should be planner-only
  - architect-agent                  # ❌ Should be planner-only
---
```

**Total Skills**: 22 skills
**Relevant Skills**: 5 skills (project-context, mastering-typescript, react-frontend, atomic-design-react, nestjs-patterns)
**Signal-to-Noise Ratio**: 22.7% (5/22)
**Wasted Context**: 77.3%

---

## After Context Management

### Solution: Intelligent skill linking based on agent role and stack detection

#### Planner Agent (After)

```yaml
---
name: planner
description: Create detailed implementation plans with full architecture awareness
model: opus
skills:
  # Universal
  - project-context

  # Planning Core
  - analyze-requirements
  - design-doc-mermaid
  - architect-agent

  # Language Mastery (ALL detected languages for architecture awareness)
  - mastering-typescript

  # Infrastructure Awareness
  - developing-with-docker
---
```

**Total Skills**: 6 skills
**Relevant Skills**: 6 skills (100% relevant)
**Signal-to-Noise Ratio**: 100%
**Context Reduction**: 73% (from 22 to 6 skills)

**Rationale**: Planner needs architecture awareness across ALL detected languages to create coherent implementation plans that span the entire stack.

---

#### Implementer Agent (After)

```yaml
---
name: implementer-typescript
description: Implement TypeScript code following team conventions
model: sonnet
skills:
  # Universal
  - project-context

  # Language Mastery (ONLY TypeScript)
  - mastering-typescript

  # Frontend Framework (ONLY detected framework: React)
  - react-frontend
  - atomic-design-react
---
```

**Total Skills**: 4 skills
**Relevant Skills**: 4 skills (100% relevant)
**Signal-to-Noise Ratio**: 100%
**Context Reduction**: 82% (from 22 to 4 skills)

**Rationale**: Implementer only needs skills for its specific language and detected frameworks. No planning, testing, or other language skills needed.

**Not Linked** (and why):
- ❌ Python, Go, Java, Rust, Ruby - Not the implementer's language
- ❌ Vue, Angular, Svelte - Not detected frameworks
- ❌ Express, FastAPI, Django - Not detected frameworks
- ❌ Jest, Playwright, Pytest - Testing framework skills belong to tester agents
- ❌ analyze-requirements, design-doc-mermaid - Planning skills belong to planner agent

---

#### Tester-Unit Agent (After)

```yaml
---
name: tester-unit-typescript
description: Write unit + integration tests with Jest
model: sonnet
skills:
  # Universal
  - project-context

  # Quality Core
  - code-quality-check

  # Language Mastery (ONLY TypeScript)
  - mastering-typescript

  # Testing Framework (ONLY detected unit test framework: Jest)
  - jest-coverage-automation
---
```

**Total Skills**: 4 skills
**Relevant Skills**: 4 skills (100% relevant)
**Signal-to-Noise Ratio**: 100%
**Context Reduction**: 82% (from 22 to 4 skills)

**Rationale**: Unit tester needs language mastery, quality skills, and unit testing framework only. No E2E, planning, or other language skills.

---

#### Tester-E2E Agent (After)

```yaml
---
name: tester-e2e-typescript
description: Write end-to-end tests with Playwright
model: sonnet
skills:
  # Universal
  - project-context

  # Quality Core
  - code-quality-check

  # Language Mastery (ONLY TypeScript)
  - mastering-typescript

  # E2E Framework (ONLY detected E2E framework: Playwright)
  - playwright-e2e-automation
---
```

**Total Skills**: 4 skills
**Relevant Skills**: 4 skills (100% relevant)
**Signal-to-Noise Ratio**: 100%
**Context Reduction**: 82% (from 22 to 4 skills)

---

#### Security Reviewer Agent (After)

```yaml
---
name: security-reviewer-typescript
description: Review TypeScript code for security vulnerabilities
model: sonnet
skills:
  # Universal
  - project-context

  # Security Core
  - security-review

  # Language Mastery (ONLY primary language: TypeScript)
  - mastering-typescript
---
```

**Total Skills**: 3 skills
**Relevant Skills**: 3 skills (100% relevant)
**Signal-to-Noise Ratio**: 100%
**Context Reduction**: 86% (from 22 to 3 skills)

---

## Impact Analysis

### Per-Agent Context Savings

| Agent | Before | After | Reduction | Signal/Noise Before | Signal/Noise After |
|-------|--------|-------|-----------|---------------------|-------------------|
| **Planner** | 22 skills | 6 skills | 73% | 27% | 100% |
| **Implementer** | 22 skills | 4 skills | 82% | 23% | 100% |
| **Tester-Unit** | 22 skills | 4 skills | 82% | 18% | 100% |
| **Tester-E2E** | 22 skills | 4 skills | 82% | 18% | 100% |
| **Security** | 22 skills | 3 skills | 86% | 14% | 100% |
| **Average** | 22 skills | 4.2 skills | **81%** | **20%** | **100%** |

### Total Workflow Context Savings

**Before Context Management**:
```
Total skills loaded across workflow: 5 agents × 22 skills = 110 skill loads
Relevant skills: 5 agents × 4-6 skills = ~23 skill loads
Wasted context: 110 - 23 = 87 skill loads (79% waste)
```

**After Context Management**:
```
Total skills loaded across workflow: 6 + 4 + 4 + 4 + 3 = 21 skill loads
Relevant skills: 21 skill loads
Wasted context: 0 skill loads (0% waste)
```

**Overall Improvement**:
- **Context Reduction**: 81% (110 → 21 skill loads)
- **Waste Elimination**: 100% (87 → 0 wasted skill loads)
- **Signal-to-Noise**: 20% → 100% (5× improvement)

---

## Multi-Language Example

### Project: Full-Stack Application with TypeScript Backend + Python ML Scripts

**Stack Profile**:
```json
{
  "languages": [
    { "name": "typescript", "confidence": "high" },
    { "name": "python", "confidence": "high" }
  ],
  "backend_frameworks": [
    { "name": "nestjs", "version": "11.0.11" }
  ],
  "frontend_frameworks": [
    { "name": "react", "version": "19.1.0" }
  ],
  "testing": [
    { "name": "jest", "type": "unit" },
    { "name": "pytest", "type": "unit" },
    { "name": "playwright", "type": "e2e" }
  ]
}
```

### Agents Generated

#### Planner (Architecture Awareness for BOTH Languages)

```yaml
---
name: planner
skills:
  - project-context
  - analyze-requirements
  - design-doc-mermaid
  - architect-agent
  - mastering-typescript      # ALL languages
  - mastering-python-skill    # ALL languages
  - developing-with-docker
---
```

**Total**: 7 skills (includes both TypeScript and Python for architecture planning)

---

#### Implementer-TypeScript (TypeScript ONLY)

```yaml
---
name: implementer-typescript
skills:
  - project-context
  - mastering-typescript      # ONLY TypeScript
  - react-frontend
  - atomic-design-react
---
```

**Total**: 4 skills (NO Python skills)

---

#### Implementer-Python (Python ONLY)

```yaml
---
name: implementer-python
skills:
  - project-context
  - mastering-python-skill    # ONLY Python
---
```

**Total**: 2 skills (NO TypeScript skills)

---

#### Tester-Unit-TypeScript (TypeScript + Jest ONLY)

```yaml
---
name: tester-unit-typescript
skills:
  - project-context
  - code-quality-check
  - mastering-typescript      # ONLY TypeScript
  - jest-coverage-automation  # ONLY Jest
---
```

**Total**: 4 skills (NO Python or Pytest)

---

#### Tester-Unit-Python (Python + Pytest ONLY)

```yaml
---
name: tester-unit-python
skills:
  - project-context
  - code-quality-check
  - mastering-python-skill    # ONLY Python
  - pytest-patterns           # ONLY Pytest
---
```

**Total**: 4 skills (NO TypeScript or Jest)

---

#### Tester-E2E-TypeScript (Frontend E2E ONLY)

```yaml
---
name: tester-e2e-typescript
skills:
  - project-context
  - code-quality-check
  - mastering-typescript
  - playwright-e2e-automation
---
```

**Total**: 4 skills

---

#### Security-Reviewer-TypeScript (Primary Language)

```yaml
---
name: security-reviewer-typescript
skills:
  - project-context
  - security-review
  - mastering-typescript      # Primary language only
---
```

**Total**: 3 skills (NO Python - uses primary language for security review)

---

### Multi-Language Orchestration Flow

**Ticket**: `PROJ-123: Implement ML model inference endpoint`

**Affected Files**:
- `services/backend/src/ml/inference.controller.ts` (TypeScript)
- `scripts/ml/train_model.py` (Python)

**Agent Execution**:

```
1. planner (7 skills: TS + Python mastery)
   → Creates unified plan covering both languages
   → Output: Implementation plan with file-to-language mapping

2. implementer-typescript (4 skills: TS + React)
   → Implements inference.controller.ts
   → NO Python context pollution

3. implementer-python (2 skills: Python only)
   → Implements train_model.py
   → NO TypeScript context pollution

4. tester-unit-typescript (4 skills: TS + Jest)
   → Tests TypeScript controller

5. tester-unit-python (4 skills: Python + Pytest)
   → Tests Python training script

6. tester-e2e-typescript (4 skills: TS + Playwright)
   → Tests E2E inference flow

7. security-reviewer-typescript (3 skills: TS + security)
   → Reviews security across both languages
```

**Total Context**:
- **Before**: 7 agents × 22 skills = 154 skill loads (85% waste)
- **After**: 7 + 4 + 2 + 4 + 4 + 4 + 3 = 28 skill loads (0% waste)
- **Reduction**: 82% (154 → 28 skill loads)

---

## Key Takeaways

1. **Role-Based Filtering**: Each agent receives only skills relevant to its specific role
2. **Language Isolation**: Implementers get ONLY their language (no cross-language pollution)
3. **Framework Specificity**: React OR Vue OR Angular (never all three)
4. **Planning Architecture Awareness**: Planner gets ALL languages for coherent cross-stack planning
5. **Multi-Language Coordination**: Separate agents per language, orchestrated by planner
6. **Massive Context Reduction**: 70-85% reduction in context window usage per agent
7. **Perfect Signal-to-Noise**: 100% of linked skills are relevant (vs 20% before)

---

**Version**: 1.0
**Last Updated**: 2026-03-09
**Related Documentation**:
- [ARCHITECTURE.md](./ARCHITECTURE.md#4-context-management-system)
- [SKILLS_AND_AGENTS_MAP.md](../SKILLS_AND_AGENTS_MAP.md)
- [README.md](../README.md#-smart-context-management-new)
