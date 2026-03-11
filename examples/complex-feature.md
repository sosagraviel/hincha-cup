# Example: Complex Feature Implementation (Architect Mode)

**Feature**: Migrate Authentication System from Keycloak to Custom JWT

**Risk Level**: HIGH (Score: 78/100)
**Strategy**: ARCHITECT
**Implementation Time**: ~12 hours (split across 2 days)
**Autonomous**: ⚠️ Partial (68% confidence, requires architecture review)

---

## Overview

This example demonstrates a high-risk feature requiring upfront architecture review and human oversight. The AI agentic framework generates a comprehensive architecture plan, but flags it for mandatory review before proceeding.

### What Makes This High Risk?

🚨 **Breaking Changes**: Complete auth system migration
🚨 **System-Wide Impact**: Affects all authenticated endpoints
🚨 **Data Migration**: Migrate user sessions and tokens
🚨 **Security Critical**: Authentication/authorization core functionality
⚠️ **Multiple Dependencies**: Frontend, backend, database, session store

---

## Ticket Example

```markdown
**PROJ-789**: Migrate from Keycloak to Custom JWT Authentication

**Description**:
Replace Keycloak authentication with custom JWT-based system for:
- Reduced infrastructure complexity (eliminate Keycloak container)
- Better control over token format and claims
- Simplified deployment (one less service to manage)

**Requirements**:
- Replace Keycloak authentication with JWT
- Implement JWT generation, validation, refresh
- Migrate existing user sessions to JWT
- Update all authenticated endpoints
- Maintain backward compatibility during migration
- Zero downtime deployment

**Acceptance Criteria**:
- [ ] JWT generation with RS256 signing
- [ ] JWT validation middleware
- [ ] Token refresh endpoint
- [ ] All endpoints use JWT auth (not Keycloak)
- [ ] Existing users can continue using app
- [ ] Migration script for user sessions
- [ ] Rollback plan documented
- [ ] 90%+ test coverage
- [ ] Security review passed

**Technical Notes**:
- Use RS256 asymmetric signing
- Store refresh tokens in Redis
- 15min access token expiry, 7 day refresh token
- Include custom claims: userId, roles, permissions
```

---

## Step-by-Step Workflow

### 1. Risk Assessment (1 minute)

```bash
$ node utils/select-strategy.js \
    --ticket PROJ-789 \
    --context ticket-context.json
```

**Output**:
```json
{
  "ticketKey": "PROJ-789",
  "riskScore": 78,
  "riskLevel": "HIGH",
  "strategy": "ARCHITECT",
  "factors": {
    "impact": {
      "score": 85,
      "affectedSystems": ["backend", "frontend", "database", "redis", "auth", "ALL_ENDPOINTS"],
      "breakingChanges": true,
      "userImpact": "HIGH",
      "reason": "Complete authentication system migration affects ALL users"
    },
    "complexity": {
      "score": 75,
      "technicalComplexity": "High - Security critical, migration required",
      "technologiesInvolved": [
        "NestJS", "JWT", "RS256", "Redis", "TypeORM", "React",
        "Token refresh logic", "Session migration"
      ],
      "estimatedFiles": 28,
      "reason": "System-wide changes, data migration, security implications"
    },
    "uncertainty": {
      "score": 70,
      "ambiguousRequirements": false,
      "unknownDependencies": ["Keycloak session format", "Existing token storage"],
      "estimationDifficulty": "HIGH",
      "reason": "Migration unknowns, backward compatibility complexity"
    }
  },
  "reasoning": "HIGH RISK: Complete auth system migration with breaking changes. Affects all authenticated endpoints and requires data migration. Security critical. Mandatory architecture review required.",
  "mitigationSteps": [
    "⚠️ MANDATORY: Architecture review before implementation",
    "Create detailed migration plan with rollback strategy",
    "Implement feature flag for gradual rollout",
    "Test with subset of users first (canary deployment)",
    "Prepare rollback script to revert to Keycloak",
    "Security audit of JWT implementation",
    "Load test JWT performance vs Keycloak",
    "Document migration runbook",
    "Create monitoring alerts for auth failures",
    "Plan zero-downtime deployment strategy"
  ]
}
```

🚨 **Strategy Selected**: ARCHITECT (architecture review required)

---

### 2. Architecture Planning (8 minutes)

```bash
$ node utils/auto-plan.js \
    --ticket PROJ-789 \
    --context ticket-context.json
```

**Output** (`.claude/plans/PROJ-789-plan.md`):

```markdown
# Architecture Plan: JWT Authentication Migration

## Confidence: 68% ⚠️ NEEDS REVIEW

### Confidence Breakdown
- Clear Requirements: 35/40 (Minor ambiguity: migration strategy)
- Known Tech Stack: 25/30 (JWT known, but Keycloak migration uncertain)
- No Breaking Changes: 0/20 (BREAKING: Complete auth system change)
- Low/Medium Risk: 0/10 (HIGH risk due to security + breaking changes)

**Total**: 68/100 → ⚠️ MANUAL ARCHITECTURE REVIEW REQUIRED (<80%)

---

## ⚠️ ARCHITECTURE REVIEW REQUIRED

**Why?**
- Complete authentication system migration (breaking change)
- Security-critical changes affecting all users
- Data migration with potential data loss risk
- System-wide impact across all authenticated endpoints
- High risk score: 78/100

**Review Checklist**:
- [ ] Architecture approach validated
- [ ] Migration strategy approved
- [ ] Rollback plan reviewed
- [ ] Zero-downtime deployment feasible
- [ ] Security implications assessed
- [ ] Performance impact acceptable
- [ ] Monitoring plan sufficient

---

## Architecture Overview

### Current State (Keycloak)

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Client  │────────>│ Keycloak │────────>│  Backend │
│ (React)  │<────────│  (Auth)  │<────────│ (NestJS) │
└──────────┘         └──────────┘         └──────────┘
                           │
                           v
                     ┌──────────┐
                     │   User   │
                     │ Database │
                     └──────────┘

Auth Flow:
1. User logs in → Keycloak
2. Keycloak validates → issues token
3. Client stores token
4. Client sends token to backend
5. Backend validates with Keycloak
```

### Proposed State (Custom JWT)

```
┌──────────┐                          ┌──────────┐
│  Client  │─────────────────────────>│  Backend │
│ (React)  │<─────────────────────────│ (NestJS) │
└──────────┘                          └──────────┘
                                            │
                                            v
                    ┌───────────┐     ┌──────────┐
                    │   Redis   │<────│   User   │
                    │ (Refresh  │     │ Database │
                    │  Tokens)  │     └──────────┘
                    └───────────┘

Auth Flow:
1. User logs in → Backend
2. Backend validates → generates JWT pair
3. Access token (15min) + Refresh token (7 days)
4. Client stores tokens
5. Client sends access token
6. Backend validates JWT (no external call)
7. Token expired? → Use refresh token
```

### Key Differences

| Aspect | Keycloak | Custom JWT |
|--------|----------|------------|
| **Token Validation** | External service call | Local (no network) |
| **Performance** | ~50ms per request | ~1ms per request |
| **Infrastructure** | Separate container | No extra service |
| **Customization** | Limited | Full control |
| **Complexity** | Higher (external service) | Lower (self-contained) |
| **Security** | Mature, battle-tested | Requires careful impl |

---

## Migration Strategy

### Phase 1: Dual Authentication (Week 1)

Support both Keycloak AND JWT simultaneously:

```typescript
// Middleware checks both
if (hasKeycloakToken(request)) {
  await validateKeycloak(request);
} else if (hasJWTToken(request)) {
  await validateJWT(request);
} else {
  throw UnauthorizedException();
}
```

- Deploy JWT system alongside Keycloak
- New logins get JWT tokens
- Existing users continue with Keycloak tokens
- Gradually migrate users via token refresh

### Phase 2: Soft Migration (Week 2-3)

Prompt users to re-login for JWT:

```typescript
// On Keycloak token, suggest JWT
if (isKeycloakToken(request)) {
  response.setHeader('X-Auth-Upgrade-Available', 'true');
  // Continue with Keycloak (backward compatible)
}
```

- Non-disruptive migration
- Users naturally migrate via re-login
- Monitor migration percentage

### Phase 3: Force Migration (Week 4)

After 95%+ migrated, force remaining users:

```typescript
// Reject old Keycloak tokens
if (isKeycloakToken(request)) {
  throw new UnauthorizedException('Please log in again');
}
```

- Clear communication to users
- Grace period for re-login
- Support available

### Phase 4: Cleanup (Week 5)

Remove Keycloak:

- Remove Keycloak container
- Delete Keycloak-related code
- Update documentation

---

## File Changes (28 files)

### Backend (18 files)

**JWT Implementation** (6 files):
1. CREATE `modules/auth/service/jwt.service.ts` (~180 lines)
2. CREATE `modules/auth/guards/jwt-auth.guard.ts` (~90 lines)
3. CREATE `modules/auth/strategies/jwt.strategy.ts` (~110 lines)
4. CREATE `modules/auth/presentation/token.controller.ts` (~150 lines)
5. CREATE `libs/crypto/jwt-signer.ts` (~200 lines)
6. CREATE `libs/crypto/rsa-key-pair.ts` (~80 lines)

**Migration Support** (4 files):
7. CREATE `modules/auth/service/migration.service.ts` (~220 lines)
8. CREATE `modules/auth/middleware/dual-auth.middleware.ts` (~130 lines)
9. CREATE `migrations/1234567890-add-jwt-fields.ts` (~60 lines)
10. CREATE `scripts/migrate-keycloak-users.ts` (~180 lines)

**Refresh Tokens** (3 files):
11. CREATE `modules/auth/database/models/refresh-token.model.ts` (~70 lines)
12. CREATE `modules/auth/repository/refresh-token.repository.ts` (~120 lines)
13. MODIFY `modules/auth/auth.module.ts` (+45 lines)

**Updates to All Controllers** (5 files):
14. MODIFY `modules/tickets/presentation/*.controller.ts` (Replace @UseGuards)
15. MODIFY `modules/projects/presentation/*.controller.ts`
16. MODIFY `modules/users/presentation/*.controller.ts`
17. MODIFY `modules/comments/presentation/*.controller.ts`
18. MODIFY `modules/notifications/presentation/*.controller.ts`

### Frontend (6 files)

19. CREATE `api/auth-jwt.ts` (~120 lines)
20. MODIFY `api/client.ts` (+30 lines) - JWT interceptor
21. CREATE `hooks/useTokenRefresh.ts` (~90 lines)
22. MODIFY `features/auth/LoginPage.tsx` (+15 lines)
23. CREATE `features/auth/SessionMigration.tsx` (~80 lines)
24. MODIFY `App.tsx` (+20 lines) - Migration banner

### Infrastructure (2 files)

25. MODIFY `docker-compose.yml` (Add feature flag env)
26. CREATE `deployment/jwt-migration-runbook.md` (~200 lines)

### Testing (2 files)

27. CREATE `test/auth/jwt-migration.e2e.spec.ts` (~250 lines)
28. CREATE `test/auth/jwt-security.spec.ts` (~180 lines)

---

## Implementation Steps (35 steps)

### Phase 1: JWT Foundation (Steps 1-10)

**Step 1**: Generate RSA key pair for JWT signing
- Command: `openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout > public.pem`

**Step 2**: Create JWT signer utility
- Files: `libs/crypto/jwt-signer.ts`
- Purpose: RS256 sign/verify with key rotation

**Step 3**: Create JWT service
- Files: `jwt.service.ts`
- Purpose: Generate access + refresh tokens

**Step 4**: Create JWT Passport strategy
- Files: `jwt.strategy.ts`
- Purpose: Validate JWT from request header

**Step 5**: Create JWT auth guard
- Files: `jwt-auth.guard.ts`
- Purpose: NestJS guard for @UseGuards(JwtAuthGuard)

**Step 6**: Create refresh token model
- Files: `refresh-token.model.ts`
- Purpose: Store refresh tokens in Redis

**Step 7**: Create refresh token repository
- Files: `refresh-token.repository.ts`
- Purpose: CRUD for refresh tokens with TTL

**Step 8**: Create token controller
- Files: `token.controller.ts`
- Purpose: POST /auth/token/refresh endpoint

**Step 9**: Add JWT module to AuthModule
- Files: `auth.module.ts`
- Purpose: Register JWT strategy, guard, services

**Step 10**: Add feature flag
- Env: `FEATURE_JWT_AUTH_ENABLED=true`

### Phase 2: Dual Authentication (Steps 11-18)

**Step 11**: Create migration service
- Files: `migration.service.ts`
- Purpose: Check if user has migrated, convert tokens

**Step 12**: Create dual auth middleware
- Files: `dual-auth.middleware.ts`
- Purpose: Support both Keycloak AND JWT

**Step 13**: Update login endpoint
- Files: `auth.controller.ts`
- Purpose: Issue JWT instead of redirecting to Keycloak

**Step 14**: Add migration detection
- Files: `migration.service.ts`
- Purpose: Detect Keycloak token, suggest JWT upgrade

**Step 15**: Database migration
- Files: `migrations/add-jwt-fields.ts`
- Purpose: Add jwt_migrated_at, jwt_version fields

**Step 16**: Deploy dual auth to staging
- Validation: Both Keycloak and JWT work

**Step 17**: Load testing
- Test: 10,000 req/s with JWT vs Keycloak
- Expected: 50x performance improvement

**Step 18**: Security audit
- Review: JWT implementation, key storage, token expiry

### Phase 3: Frontend Migration (Steps 19-25)

**Step 19**: Create JWT API client
- Files: `api/auth-jwt.ts`
- Purpose: Login, logout, refresh endpoints

**Step 20**: Create token refresh hook
- Files: `hooks/useTokenRefresh.ts`
- Purpose: Auto-refresh tokens before expiry

**Step 21**: Update API client interceptor
- Files: `api/client.ts`
- Purpose: Add JWT Bearer token to requests

**Step 22**: Add migration banner
- Files: `features/auth/SessionMigration.tsx`
- Purpose: Prompt users to upgrade to JWT

**Step 23**: Update login page
- Files: `LoginPage.tsx`
- Purpose: Use JWT endpoint instead of Keycloak

**Step 24**: Add token storage
- Storage: localStorage (access token), httpOnly cookie (refresh token)

**Step 25**: Deploy frontend to staging

### Phase 4: Gradual Rollout (Steps 26-30)

**Step 26**: Deploy to production (dual auth)
- Rollout: 0% JWT (monitoring only)

**Step 27**: Enable JWT for new users
- Rollout: New logins → JWT, existing → Keycloak

**Step 28**: Monitor migration metrics
- Metrics: JWT adoption rate, auth failures, performance

**Step 29**: Prompt active users to migrate
- Banner: "Faster login available, please re-login"

**Step 30**: Wait for 95% migration
- Timeline: ~2-3 weeks

### Phase 5: Cleanup (Steps 31-35)

**Step 31**: Force remaining users to migrate
- Action: Reject Keycloak tokens after grace period

**Step 32**: Remove dual auth middleware
- Files: Delete `dual-auth.middleware.ts`

**Step 33**: Remove Keycloak dependencies
- Package: Uninstall passport-keycloak

**Step 34**: Remove Keycloak container
- Docker: Remove from docker-compose.yml

**Step 35**: Update documentation
- Docs: Remove Keycloak references, add JWT docs

---

## Rollback Plan

### Immediate Rollback (< 1 hour)

If JWT auth fails critically:

```bash
# 1. Set feature flag to disable JWT
export FEATURE_JWT_AUTH_ENABLED=false

# 2. Restart backend (falls back to Keycloak only)
docker-compose restart backend

# 3. Frontend: Remove JWT banner
# (No frontend deploy needed - backend rejects JWT)
```

### Data Rollback (< 4 hours)

If migration corrupted data:

```bash
# 1. Run rollback migration
pnpm migration:rollback

# 2. Restore Redis from backup
redis-cli --rdb /backup/redis-dump.rdb

# 3. Clear JWT tokens
redis-cli FLUSHDB

# 4. Restart services
docker-compose restart
```

---

## Security Considerations

### JWT Security Checklist

- [x] RS256 asymmetric signing (not HS256)
- [x] Short access token expiry (15 minutes)
- [x] Refresh tokens stored server-side (Redis)
- [x] Refresh tokens rotated on use
- [x] Private key stored in env (not in code)
- [x] Public key rotation strategy defined
- [x] Token revocation via Redis blacklist
- [x] Rate limiting on token refresh endpoint
- [x] Secure httpOnly cookies for refresh tokens
- [x] CSRF protection on token refresh

### Attack Vectors Mitigated

| Attack | Mitigation |
|--------|------------|
| Token theft | Short expiry + httpOnly cookies |
| Token replay | Refresh token rotation |
| Token forgery | RS256 asymmetric verification |
| Key compromise | Key rotation every 90 days |
| Brute force | Rate limiting (5 attempts/minute) |

---

## Testing Strategy

### Security Tests (8 scenarios)
- JWT signature verification
- Expired token rejection
- Tampered token rejection
- Refresh token rotation
- Token revocation
- Key rotation
- CSRF protection
- Rate limiting

### Migration Tests (6 scenarios)
- Keycloak → JWT token conversion
- Dual auth (both tokens work)
- Gradual user migration
- Force migration after deadline
- Rollback to Keycloak
- Data integrity after migration

### Performance Tests (4 scenarios)
- JWT validation speed (target: <1ms)
- Token refresh throughput
- Load test: 10,000 concurrent users
- Compare: Keycloak vs JWT latency

### E2E Tests (10 user flows)
- Login with JWT
- Auto token refresh
- Logout and token revocation
- Re-login after token expiry
- Migration banner interaction
- Force migration flow
- Rollback scenario
- Multiple devices
- Token theft recovery
- Concurrent sessions

**Target Coverage**: 90%+

---

## Monitoring & Alerts

### Metrics to Track

```typescript
// Auth success rate
auth.success_rate = successful_auths / total_auth_attempts

// JWT vs Keycloak distribution
auth.jwt_percentage = jwt_auths / total_auths
auth.keycloak_percentage = keycloak_auths / total_auths

// Migration progress
auth.migration.total_users
auth.migration.migrated_users
auth.migration.percentage

// Performance
auth.jwt.validation_time_ms (p50, p95, p99)
auth.token_refresh.time_ms
```

### Alerts

- ⚠️ Auth success rate < 95%
- ⚠️ JWT validation time > 5ms (p99)
- 🚨 Auth failures > 100/min
- 🚨 Token refresh failures > 10/min
- ℹ️ Migration progress < expected rate

---

## Success Criteria

| Criterion | Target | Verification |
|-----------|--------|--------------|
| Zero downtime | 0 minutes | Monitoring dashboard |
| Auth success rate | ≥99% | Metrics |
| Performance improvement | ≥20x | Load testing |
| Migration completion | 100% users | Database query |
| Test coverage | ≥90% | Jest report |
| Security audit | Pass | External audit |
| Rollback tested | Success | Staging test |

---

## Timeline

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: JWT Foundation | 3 days | 6 hours |
| Phase 2: Dual Auth | 2 days | 4 hours |
| Phase 3: Frontend | 1 day | 2 hours |
| Phase 4: Gradual Rollout | 2-3 weeks | Monitoring |
| Phase 5: Cleanup | 1 day | 2 hours |
| **Total Development** | **~7 days** | **~14 hours** |
| **Total Calendar** | **~4 weeks** | (incl. migration period) |

---

## Assumptions (High Risk)

1. **Keycloak session format is documented** (HIGH risk)
   - Validation: Review Keycloak docs, test migration script
   - Mitigation: Manual session migration if format unknown

2. **Users will re-login during migration period** (MEDIUM risk)
   - Validation: Monitor migration rate, prompt via banner
   - Mitigation: Force migration after grace period

3. **JWT performance is significantly better** (MEDIUM risk)
   - Validation: Load testing before rollout
   - Mitigation: Rollback if performance degraded

4. **No external systems depend on Keycloak tokens** (HIGH risk)
   - Validation: Audit all API clients, third-party integrations
   - Mitigation: Maintain Keycloak for external clients if needed

---

## ⚠️ RECOMMENDATION

**This migration requires**:
1. ✅ Architecture review by senior engineer
2. ✅ Security audit by security team
3. ✅ Load testing in staging environment
4. ✅ Rollback plan tested and validated
5. ✅ Monitoring dashboard prepared
6. ✅ Communication plan for users
7. ✅ On-call engineer during rollout

**Do NOT proceed autonomously**. Human oversight required throughout.

---

🤖 Plan generated automatically with 68% confidence
⚠️ **MANUAL REVIEW REQUIRED** (<80% threshold)
🚨 **HIGH RISK** - Architecture approval needed
```

⚠️ **68% Confidence**: Manual review required!

---

### 3. Human Review Phase

**Framework Action**: Sends notification to architect

```
🔔 Architecture Review Required

Ticket: PROJ-789 - JWT Authentication Migration
Risk: HIGH (78/100)
Confidence: 68% (below 80% auto-approval threshold)

Plan Generated: /plans/PROJ-789-plan.md

Action Required:
1. Review architecture plan
2. Validate migration strategy
3. Approve or request changes
4. Update plan if needed

Once approved, implementation can proceed autonomously.
```

**Architect Reviews Plan**: ✅ Approves with minor changes

```bash
# Architect updates confidence after review
node utils/auto-plan.js \
  --ticket PROJ-789 \
  --override-confidence 85 \
  --approved-by "john.architect@company.com"
```

✅ **85% Confidence** (after human review): Now approved for autonomous implementation!

---

### 4. Autonomous Implementation (12 hours, split over 2 days)

**Day 1** (6 hours): JWT foundation + dual auth

Implementation proceeds autonomously following the 35-step plan...

**Day 2** (6 hours): Frontend + testing

All tests automated, 92% coverage achieved...

---

### 5. Gradual Rollout (3 weeks, monitored)

Framework monitors migration metrics autonomously:

```bash
Week 1: 15% migrated (new users)
Week 2: 68% migrated (prompted active users)
Week 3: 97% migrated (almost complete)
Week 4: 100% migrated (forced remaining users)
```

---

## Key Takeaways

🚨 **High Risk = Manual Review**: 68% confidence → human approval required

✅ **After Approval = Autonomous**: Once approved, 35 steps execute automatically

📊 **Comprehensive Planning**: Migration strategy, rollback plan, monitoring

⏱️ **Phased Approach**: 4-week gradual rollout minimizes risk

🔒 **Security First**: Security audit, attack mitigation, key rotation

✅ **Production Ready**: 92% test coverage, rollback tested, monitoring in place

---

## Comparison: Low vs Medium vs High Risk

| Aspect | Low (PROJ-101) | Medium (PROJ-234) | High (PROJ-789) |
|--------|----------------|-------------------|-----------------|
| **Strategy** | DIRECT | PLAN_FIRST | ARCHITECT |
| **Initial Confidence** | 95% | 82% | 68% |
| **User Approval** | None | None | Required |
| **Planning Time** | 1m | 3m | 8m |
| **Implementation** | 45m | 2.5h | 12h |
| **Files Changed** | 3 | 12 | 28 |
| **Systems Affected** | 1 | 4 | 6 (ALL) |
| **Migration Required** | No | No | Yes (3 weeks) |
| **Rollback Plan** | Simple | Moderate | Complex |
| **Test Coverage** | 100% | 87% | 92% |
| **Autonomous** | 100% | 100% | After review |

---

## Try It Yourself

```bash
# 1. Create high-risk ticket in Jira
# 2. Run autonomous workflow
node scripts/autonomous-workflow.sh PROJ-789

# 3. Framework will:
#    - Assess risk (HIGH)
#    - Generate architecture plan
#    - REQUEST YOUR REVIEW ⚠️
#    - Wait for approval
#    - After approval: Implement autonomously
#    - Monitor rollout metrics

# 4. You review and approve plan
# 5. Implementation proceeds autonomously
```

---

**Previous Example**: [Medium Feature (Plan-First Strategy)](./medium-feature.md)
**Next Example**: [Autonomous Overnight Workflow](./autonomous-overnight.md)
