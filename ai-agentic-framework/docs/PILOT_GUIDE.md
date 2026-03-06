# AI Framework Pilot Guide

**Version**: 1.0
**Last Updated**: 2026-03-02
**Duration**: 3 weeks (2026-03-09 to 2026-03-29)
**Goal**: Validate 100% initialize-project accuracy and <1% implement-ticket failure rate in production

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Pilot Testing](#pre-pilot-testing)
3. [Project Selection](#project-selection)
4. [3-Week Pilot Timeline](#3-week-pilot-timeline)
5. [Daily Monitoring](#daily-monitoring)
6. [Issue Management](#issue-management)
7. [Data Collection](#data-collection)
8. [Rollout Decision](#rollout-decision)

---

## Overview

### Pilot Structure

- **Participants**: 7 pilot teams, 21 developers
- **Duration**: 3 weeks of active development
- **Target**: 43-54 tickets implemented across all teams
- **Success Criteria**:
  - Initialize-project accuracy ≥95%
  - Implement-ticket success rate ≥95%
  - Developer satisfaction (NPS) ≥8/10
  - Code quality: No regression
  - Critical issues (P0): 0 open

### Pre-Pilot Checklist

- [x] All 14 P0 improvements implemented (commit 932cde5)
- [x] 28/28 automated tests passing
- [ ] Test on 3 diverse projects (see below)
- [ ] Select 7 pilot projects
- [ ] Obtain management approval
- [ ] Set up monitoring infrastructure
- [ ] Create Slack channel (#ai-framework-pilot)
- [ ] Schedule kickoff meetings

---

## Pre-Pilot Testing

**Recommendation**: Test on 2-3 diverse projects before launching pilot (2-3 hours total).

### Test Case 1: Polyglot Full-Stack (FastAPI + React)

**Repository**: `fastapi/full-stack-fastapi-template`
**URL**: https://github.com/fastapi/full-stack-fastapi-template
**Why**: Tests Python + TypeScript polyglot detection, modern frameworks

**Steps**:
```bash
git clone https://github.com/fastapi/full-stack-fastapi-template.git
cd full-stack-fastapi-template
/initialize-project
```

**Validate**:
- ✅ Both Python and TypeScript detected
- ✅ FastAPI and React versions extracted
- ✅ PostgreSQL detected
- ✅ Monorepo structure identified (frontend/ and backend/ directories)
- ✅ No unsubstituted template variables (no `{{...}}` patterns)

### Test Case 2: Older Versions (NestJS 8 + React 17)

**Repository**: `laudspeaker/laudspeaker`
**URL**: https://github.com/laudspeaker/laudspeaker
**Why**: Tests version-specific advice for older frameworks

**Steps**:
```bash
git clone https://github.com/laudspeaker/laudspeaker.git
cd laudspeaker
/initialize-project
```

**Validate**:
- ✅ NestJS 8.x detected (not 11.x)
- ✅ React 17.x detected (not 19.x)
- ✅ Version-specific patterns in generated agents
- ✅ Monorepo with packages/ structure detected

### Test Case 3: Simple TypeScript Library (Non-Monorepo)

**Repository**: `raineorshine/npm-check-updates`
**URL**: https://github.com/raineorshine/npm-check-updates
**Why**: Tests non-monorepo detection, library (not web app)

**Steps**:
```bash
git clone https://github.com/raineorshine/npm-check-updates.git
cd npm-check-updates
/initialize-project
```

**Validate**:
- ✅ Detected as TypeScript library (not web app)
- ✅ No monorepo structure
- ✅ No frontend/backend distinction
- ✅ CLI tool patterns identified

**Fix Issues**: If any test fails, fix before pilot launch.

---

## Project Selection

### Selection Criteria (High Priority)

| Criterion | Requirement | Rationale |
|-----------|-------------|-----------|
| **Tech Stack Diversity** | Mix of NestJS, React, Python, old/new versions | Validates stack detection across frameworks |
| **Active Development** | Active PRs/commits in last 30 days | Ensures real-world testing |
| **Team Feedback Culture** | Known for constructive feedback | Quality pilot insights |
| **Availability** | 2-3 hours/week for 3 weeks | Pilot requires active participation |
| **Early Adopter Mindset** | Willing to try new tools | Pilot success depends on engaged users |

### Recommended 7 Projects

| Project | Stack | Type | Team Size | Complexity | Expected Tickets |
|---------|-------|------|-----------|------------|------------------|
| **A: E-commerce Platform** | NestJS 11 + React 19 | Monorepo (pnpm) | 4 | High | 8-10 |
| **B: SaaS Dashboard** | NestJS 8 + React 17 | Monorepo (yarn) | 3 | Medium | 6-8 |
| **C: API Gateway** | NestJS 11 + PostgreSQL | Single package | 2 | Medium | 5-6 |
| **D: TypeScript Library** | TypeScript + Node.js | Single package | 2 | Low | 3-4 |
| **E: React Dashboard** | React 19 + Vite | Single package | 3 | Medium | 6-8 |
| **F: Analytics Platform** | FastAPI + React 18 | Polyglot | 4 | High | 8-10 |
| **G: ML-Powered App** | FastAPI + Next.js 14 | Polyglot | 3 | High | 6-8 |

**Total**: 7 projects, 21 developers, 43-54 tickets over 3 weeks

### Coverage Matrix

**Tech Stack Coverage**:
- NestJS: 11 (Projects A, C), 8 (Project B)
- React: 19 (A, E), 18 (F), 17 (B)
- Next.js: 14 (G)
- FastAPI: F, G
- PostgreSQL: A, C, F, G
- Redis: A, B, F

**Project Type Coverage**:
- Monorepo (pnpm/yarn): A, B
- Single package: C, D, E
- Polyglot: F, G

**Complexity Coverage**:
- High: A, F, G (3 projects)
- Medium: B, C, E (3 projects)
- Low: D (1 project)

---

## 3-Week Pilot Timeline

### Week 0: Setup & Onboarding (2026-03-09 to 2026-03-13)

**Monday-Wednesday**: Kickoff meetings (7 teams, 1 hour each)

**Kickoff Meeting Agenda** (60 minutes):
1. **Introduction** (10 min): Framework overview, pilot goals, success criteria
2. **Demo: Initialize-Project** (15 min): Run live on their codebase, show generated CLAUDE.md
3. **Demo: Implement-Ticket** (20 min): Walk through phases, quality gates, rollback options
4. **Q&A** (10 min): Answer questions, address concerns
5. **Next Steps** (5 min): Share Quick Start Guide, add to Slack channel, set expectations

**Thursday-Friday**: First implementations (1-2 tickets per team)

### Week 1-3: Active Pilot

| Week | Target Tickets | Focus |
|------|----------------|-------|
| Week 1 | 2-3 tickets/team | Simple features, bug fixes (low risk) |
| Week 2 | 3-4 tickets/team | Medium complexity features |
| Week 3 | 3-5 tickets/team | Complex features, edge cases |

**Total**: 8-12 tickets per team over 3 weeks

### Weekly Check-ins (Every Friday, 3:00 PM)

**Week 1 Check-in** (2026-03-13):
- Review Week 1 metrics (tickets attempted, success rate, failures)
- Feedback session: What's working? What's frustrating?
- Issue triage: Prioritize fixes (P0/P1/P2)
- Week 2 planning

**Week 2 Check-in** (2026-03-20):
- Cumulative metrics (trending up/down?)
- Deep dive on failure patterns
- Feature requests (top 5)
- Week 3 planning

**Week 3 Check-in** (2026-03-27):
- Final metrics (total tickets, success rate, NPS, time saved)
- Success stories (2-3 impressive implementations)
- Pain points and limitations
- Send post-pilot survey (deadline: 2026-04-03)
- Schedule final review meeting (2026-04-05)

---

## Daily Monitoring

### Daily Checklist (Every Morning, 60-70 min)

**Pilot Lead Tasks**:

1. **Review Overnight Activity** (15 min)
   - Check Slack channel for new messages
   - Review error logs in Sentry
   - Check monitoring dashboard for anomalies

2. **Check Implementation Status** (15 min)
   - Tickets started yesterday?
   - Completed successfully?
   - Failed? (analyze failure reasons)

3. **Review Quality Metrics** (10 min)
   - Initialize-project accuracy (spot checks)
   - Implement-ticket success rate
   - Code quality (PR review feedback)

4. **Proactive Outreach** (20 min)
   - Message teams that had failures
   - Offer help for ongoing implementations
   - Share tips/workarounds in Slack

5. **Update Tracking Spreadsheet** (10 min)
   - Log new implementations
   - Update success/failure counts
   - Calculate current success rate

---

## Issue Management

### Severity Levels

| Level | Definition | Response Time | Examples |
|-------|------------|---------------|----------|
| **P0 (Critical)** | Framework broken, blocks all work | <2 hours | Checkpoint corruption, infinite loops, data loss |
| **P1 (High)** | Blocks specific use case | <24 hours | Stack detection failure, template errors |
| **P2 (Medium)** | Workaround available | <3 days | Suboptimal code generation, minor bugs |
| **P3 (Low)** | Nice to have | Post-pilot | Feature requests, polish |

### Issue Workflow

1. **Report** (Developer → Slack): `[P1] [Project A] Stack detection missed Redis`
2. **Triage** (Pilot Lead): Reproduce, assign severity, assign owner
3. **Fix** (Framework Engineer): Implement, test, deploy
4. **Verify** (Developer): Confirm fix, close issue
5. **Document** (Pilot Lead): Add to known issues, update FAQ

---

## Data Collection

### Tracking Spreadsheet (Google Sheets)

**Columns**:
- Date, Project, Ticket ID, Ticket Type, Complexity
- Start Time, End Time, Duration (auto-calculated)
- Status (Success/Failed/WIP)
- Failure Reason (if failed)
- Rollback Action (if failed)
- Code Quality (PR review score 1-5)
- Developer, Notes

**Sample Row**:
```
2026-03-10 | Project A | ECOM-456 | Feature | Medium | 10:15 | 11:02 | 47 min | Success | N/A | N/A | 4/5 | John | Generated unit tests correctly
```

### Developer Feedback Form (After Each Implementation)

Sent via Slack bot after each `/implement-ticket` completion:

1. How satisfied are you with this implementation? (1-10)
2. Did the framework understand your tech stack correctly? (Yes/No/Partial)
3. Did the implementation meet your expectations? (Yes/No/Partial)
4. How much time did the framework save you? (None / 10-30% / 30-50% / 50%+)
5. What went well? (Free text)
6. What could be improved? (Free text)
7. Would you use this framework again? (Yes/No/Maybe)

### Weekly Metrics Dashboard

**Key Metrics** (Grafana or Google Data Studio):
- Total implementations (count by week)
- Success rate: (Successful / Total) × 100%
- Failure breakdown (pie chart: Coverage, Linting, Tests, Timeout, Other)
- Average duration (mean time per ticket)
- Developer NPS (Net Promoter Score 0-10)
- Code quality (average PR review score 1-5)

---

## Rollout Decision

### Final Review Meeting (2026-04-05, 10:00 AM)

**Attendees**: Pilot lead, framework engineers, engineering management, pilot team representatives

**Agenda** (90 minutes):
1. Pilot overview (10 min)
2. Metrics presentation (20 min)
3. Success stories (15 min)
4. Failure analysis (15 min)
5. Lessons learned (15 min)
6. Rollout decision (10 min)
7. Next steps (5 min)

### Decision Criteria

#### Option 1: Full Rollout ✅

**Requirements** (All must pass):
- Initialize-project accuracy ≥95%
- Implement-ticket success rate ≥95%
- Developer satisfaction (NPS) ≥8/10
- Code quality: No regression
- Critical issues (P0): 0 open
- High issues (P1): <5 open

**Action**: Proceed to phased rollout (25% → 50% → 100% over 3 weeks)

#### Option 2: Extended Pilot ⚠️

**Triggers**:
- Success rate: 80-94% (not 95%+)
- NPS: 6-7/10 (not 8+)
- Open P1 issues: 5-10

**Action**:
1. Address P1 issues (1 week)
2. Extend pilot by 2 weeks
3. Re-evaluate against criteria

#### Option 3: Defer Rollout ❌

**Triggers**:
- Success rate: <80%
- NPS: <6/10
- Open P0 issues: >0
- Code quality regression

**Action**:
1. Pause pilot
2. Root cause analysis
3. Major framework rework
4. Re-pilot in 4-6 weeks

---

## Quick Start Guide (For Pilot Developers)

### Step 1: Initialize Your Project (First time only)

```bash
cd /path/to/your/project
/initialize-project
```

- Analyzes codebase, generates `.claude/CLAUDE.md`
- Review generated file for accuracy
- Report inaccuracies in #ai-framework-pilot

### Step 2: Implement a Ticket

```bash
/implement-ticket PROJ-123
```

- Replace `PROJ-123` with your Jira ticket key
- Expected duration: 15-60 minutes
- Framework will analyze → plan → implement → test → create PR

### Step 3: Review and Merge

- Review generated PR
- Ensure tests pass and coverage meets threshold
- Request changes if needed
- Merge when satisfied

### Step 4: Provide Feedback

- Fill out feedback form (Slack bot)
- Share learnings in #ai-framework-pilot
- Report issues: `[P1] [Project X] Issue description`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Stack detection missed X framework | Manually add to `.claude/CLAUDE.md`, report in Slack |
| Coverage gate failing repeatedly | Use rollback option 2 (WIP PR), fix tests manually |
| Infinite retry loop detected | Framework halts automatically, suggests manual intervention |
| Checkpoint corrupted | Should not happen (P0-7 fix), report immediately as P0 |
| Template variables not substituted | Framework bug, report as P1 |

---

## Communication Plan

### Pre-Pilot (2026-03-05)
- Email to all engineering teams: "AI Framework Pilot Starting Next Week"
- Slack announcement in #engineering
- Highlight selected pilot teams

### Mid-Pilot (2026-03-20)
- Week 2 update: Share early metrics and success stories
- Build excitement for full rollout

### Post-Pilot (2026-04-05)
- Final results announcement
- Rollout decision communicated
- Thank pilot teams publicly

### If Successful: Blog Post
- Title: "How We Achieved 95%+ Success Rate with AI-Assisted Development"
- Share learnings, metrics, case studies

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pilot teams too busy | Medium | High | Select backup teams, reduce ticket targets |
| Framework breaks production | Low | Critical | Only non-critical tickets, rollback capability |
| Developer resistance | Medium | Medium | Extra training, emphasize time savings |
| Edge cases not covered | High | Low | Issue tracking, quick hotfixes |
| Metrics don't improve | Low | High | Analyze failures, extend pilot |

---

**Document Version**: 1.0
**Owner**: Pilot Lead
**Status**: Ready for Execution
**Next Update**: After Week 1 Check-in (2026-03-13)
