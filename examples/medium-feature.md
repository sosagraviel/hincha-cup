# Example: Medium Feature Implementation (Plan-First Strategy)

**Feature**: Add OAuth 2.0 Authentication Integration

**Risk Level**: MEDIUM (Score: 58/100)
**Strategy**: PLAN_FIRST
**Implementation Time**: ~4 hours
**Autonomous**: ✅ Yes (82% confidence with plan)

---

## Overview

This example demonstrates a medium-risk feature requiring upfront planning before implementation. The AI agentic framework creates a detailed plan, validates it, then executes autonomously.

### What Makes This Medium Risk?

⚠️ **Multiple Systems**: Backend, frontend, database, external OAuth provider
⚠️ **Security Implications**: Authentication/authorization changes
⚠️ **External Dependencies**: OAuth provider API
✅ **Clear Requirements**: OAuth 2.0 standard well-documented
✅ **Known Pattern**: Common authentication flow

---

## Ticket Example

```markdown
**PROJ-234**: Add OAuth 2.0 Authentication

**Description**:
Integrate OAuth 2.0 authentication to allow users to sign in with Google and GitHub.

**Requirements**:
- Support Google OAuth 2.0 (client ID/secret configured)
- Support GitHub OAuth 2.0 (client ID/secret configured)
- Store OAuth tokens securely in database
- Link OAuth accounts to existing user accounts
- Redirect to original page after authentication
- Handle OAuth errors gracefully

**Acceptance Criteria**:
- [ ] Users can click "Sign in with Google"
- [ ] Users can click "Sign in with GitHub"
- [ ] OAuth flow redirects back to app correctly
- [ ] User profile shows connected OAuth accounts
- [ ] Users can disconnect OAuth accounts
- [ ] All OAuth tokens encrypted at rest
- [ ] Unit + integration tests pass (80%+ coverage)

**Technical Notes**:
- Use Passport.js for OAuth integration
- Store tokens in oauth_tokens table
- Use existing Keycloak for session management
```

---

## Step-by-Step Autonomous Workflow

### 1. Risk Assessment (45 seconds)

```bash
$ node utils/select-strategy.js \
    --ticket PROJ-234 \
    --context ticket-context.json
```

**Output**:
```json
{
  "ticketKey": "PROJ-234",
  "riskScore": 58,
  "riskLevel": "MEDIUM",
  "strategy": "PLAN_FIRST",
  "factors": {
    "impact": {
      "score": 65,
      "affectedSystems": ["backend", "frontend", "database", "auth"],
      "breakingChanges": false,
      "userImpact": "MEDIUM"
    },
    "complexity": {
      "score": 55,
      "technicalComplexity": "Medium - OAuth 2.0 standard flow",
      "technologiesInvolved": ["NestJS", "Passport.js", "React", "PostgreSQL", "OAuth 2.0"],
      "estimatedFiles": 12
    },
    "uncertainty": {
      "score": 50,
      "ambiguousRequirements": false,
      "unknownDependencies": ["Google OAuth API", "GitHub OAuth API"],
      "estimationDifficulty": "MEDIUM"
    }
  },
  "reasoning": "Multi-system OAuth integration with security implications. Clear OAuth 2.0 standard but external dependencies. Requires planning.",
  "mitigationSteps": [
    "Create detailed implementation plan with OAuth flow diagram",
    "Test OAuth flow in development environment first",
    "Add comprehensive error handling for OAuth failures",
    "Encrypt tokens at rest using AES-256",
    "Add integration tests for full OAuth flow",
    "Security review of token storage"
  ]
}
```

✅ **Strategy Selected**: PLAN_FIRST (create plan before implementing)

---

### 2. Autonomous Planning (3 minutes)

```bash
$ node utils/auto-plan.js \
    --ticket PROJ-234 \
    --context ticket-context.json
```

**Output** (`.claude/plans/PROJ-234-plan.md`):

```markdown
# Implementation Plan: OAuth 2.0 Authentication

## Confidence: 82% ✅ AUTO-APPROVED

### Confidence Breakdown
- Clear Requirements: 38/40 (OAuth 2.0 standard well-defined)
- Known Tech Stack: 28/30 (Passport.js familiar, OAuth providers known)
- No Breaking Changes: 16/20 (Minor risk: existing auth flow unchanged)
- Low/Medium Risk: 0/10 (Medium risk due to security implications)

**Total**: 82/100 → AUTO-APPROVED (≥80%)

---

## Requirements

### Functional
1. Users can authenticate via Google OAuth 2.0
2. Users can authenticate via GitHub OAuth 2.0
3. OAuth accounts link to existing user records
4. Users can disconnect OAuth accounts
5. Redirect to original page after OAuth flow

### Non-Functional
1. OAuth tokens encrypted at rest (AES-256)
2. 80%+ test coverage
3. Handle OAuth errors gracefully
4. Response time <2s for OAuth callback

### Constraints
1. Use Passport.js for OAuth integration
2. Store tokens in dedicated oauth_tokens table
3. Leverage existing Keycloak for session management
4. Follow OAuth 2.0 RFC 6749 standard

---

## Affected Systems

| System | Impact | Changes |
|--------|--------|---------|
| Backend API | MEDIUM | New OAuth endpoints, Passport strategies, token encryption |
| Database | MEDIUM | New oauth_tokens table, user foreign key |
| Frontend | LOW | OAuth login buttons, account linking UI |
| Authentication | HIGH | OAuth provider integration, token refresh logic |

---

## OAuth 2.0 Flow Diagram

```
┌──────────┐                                    ┌─────────────┐
│  User    │                                    │   Google/   │
│ (Browser)│                                    │   GitHub    │
└────┬─────┘                                    └──────┬──────┘
     │                                                 │
     │ 1. Click "Sign in with Google"                │
     │ ────────────────────────────────>              │
     │                                                 │
     │ 2. GET /auth/google                            │
     │ ────────────────────────────────>              │
     │              (Backend redirects)               │
     │ 3. Redirect to Google OAuth consent            │
     │ ──────────────────────────────────────────────>│
     │                                                 │
     │ 4. User approves, Google redirects back        │
     │ <──────────────────────────────────────────────│
     │              (with auth code)                  │
     │                                                 │
     │ 5. GET /auth/google/callback?code=xyz          │
     │ ────────────────────────────────>              │
     │              (Backend exchanges code)          │
     │                     6. POST /oauth/token       │
     │              ──────────────────────────────────>│
     │                     7. Returns access token    │
     │              <──────────────────────────────────│
     │                                                 │
     │ 8. Create/link user, encrypt token, create session
     │ <────────────────────────────────              │
     │              (Set session cookie)              │
     │                                                 │
     │ 9. Redirect to original page                   │
     │ <────────────────────────────────              │
```

---

## File Changes (12 files)

### Backend (8 files)

1. **CREATE** `modules/auth/strategies/google.strategy.ts` (~80 lines)
   - Implement Google OAuth 2.0 Passport strategy

2. **CREATE** `modules/auth/strategies/github.strategy.ts` (~80 lines)
   - Implement GitHub OAuth 2.0 Passport strategy

3. **CREATE** `modules/auth/presentation/oauth.controller.ts` (~120 lines)
   - OAuth endpoints: /auth/google, /auth/github, callbacks

4. **CREATE** `modules/auth/database/models/oauth-token.model.ts` (~60 lines)
   - TypeORM entity for oauth_tokens table

5. **CREATE** `modules/auth/repository/oauth-token.repository.ts` (~90 lines)
   - Data access for OAuth tokens with encryption

6. **CREATE** `modules/auth/service/oauth.service.ts` (~150 lines)
   - Business logic: link accounts, encrypt tokens, refresh tokens

7. **MODIFY** `modules/auth/auth.module.ts` (+15 lines)
   - Register OAuth strategies and controller

8. **CREATE** `migrations/1234567890-create-oauth-tokens.ts` (~45 lines)
   - Database migration for oauth_tokens table

### Frontend (3 files)

9. **CREATE** `features/auth/OAuthButtons.tsx` (~80 lines)
   - Google/GitHub sign-in buttons

10. **MODIFY** `features/auth/LoginPage.tsx` (+10 lines)
    - Add OAuth buttons to login page

11. **CREATE** `features/settings/ConnectedAccounts.tsx` (~100 lines)
    - UI to view/disconnect OAuth accounts

### Shared (1 file)

12. **CREATE** `packages/shared/src/dtos/auth/oauth-provider.dto.ts` (~25 lines)
    - DTO for OAuth provider enum

---

## Implementation Steps (18 steps)

### Phase 1: Database Setup (2 steps)

**Step 1**: Create oauth_tokens migration
- **Files**: `migrations/1234567890-create-oauth-tokens.ts`
- **Purpose**: Create table with user_id, provider, access_token, refresh_token, expires_at
- **Validation**: Migration runs successfully, table created

**Step 2**: Create OAuthToken entity
- **Files**: `oauth-token.model.ts`
- **Purpose**: TypeORM entity with encryption decorators
- **Dependencies**: [1]

### Phase 2: Backend OAuth Integration (8 steps)

**Step 3**: Install Passport.js OAuth strategies
- **Command**: `pnpm add passport-google-oauth20 passport-github2`
- **Validation**: Dependencies in package.json

**Step 4**: Create Google OAuth strategy
- **Files**: `google.strategy.ts`
- **Purpose**: Passport strategy with client ID/secret from env
- **Dependencies**: [3]

**Step 5**: Create GitHub OAuth strategy
- **Files**: `github.strategy.ts`
- **Purpose**: Passport strategy with client ID/secret from env
- **Dependencies**: [3]

**Step 6**: Create OAuthToken repository
- **Files**: `oauth-token.repository.ts`
- **Purpose**: CRUD operations with AES-256 token encryption
- **Dependencies**: [2]

**Step 7**: Create OAuth service
- **Files**: `oauth.service.ts`
- **Purpose**: Link accounts, store tokens, refresh logic
- **Dependencies**: [6]

**Step 8**: Create OAuth controller
- **Files**: `oauth.controller.ts`
- **Purpose**: Endpoints for /auth/google, /auth/github, callbacks
- **Dependencies**: [4, 5, 7]

**Step 9**: Register in AuthModule
- **Files**: `auth.module.ts`
- **Purpose**: Import strategies, register controller
- **Dependencies**: [4, 5, 8]

**Step 10**: Add environment variables
- **Files**: `.env.development`
- **Variables**: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET

### Phase 3: Frontend Integration (4 steps)

**Step 11**: Create OAuthButtons component
- **Files**: `OAuthButtons.tsx`
- **Purpose**: Google/GitHub sign-in buttons
- **Dependencies**: None

**Step 12**: Add to LoginPage
- **Files**: `LoginPage.tsx`
- **Purpose**: Display OAuth buttons below login form
- **Dependencies**: [11]

**Step 13**: Create ConnectedAccounts component
- **Files**: `ConnectedAccounts.tsx`
- **Purpose**: List connected accounts, disconnect button
- **Dependencies**: None

**Step 14**: Add to SettingsPage
- **Files**: `SettingsPage.tsx`
- **Purpose**: Add connected accounts section
- **Dependencies**: [13]

### Phase 4: Testing (4 steps)

**Step 15**: Unit tests for OAuth service
- **Files**: `oauth.service.spec.ts`
- **Coverage**: 85%+
- **Dependencies**: [7]

**Step 16**: Integration tests for OAuth flow
- **Files**: `oauth.integration.spec.ts`
- **Coverage**: Full flow with mocked OAuth providers
- **Dependencies**: [8]

**Step 17**: Frontend unit tests
- **Files**: `OAuthButtons.spec.tsx`, `ConnectedAccounts.spec.tsx`
- **Coverage**: 80%+
- **Dependencies**: [11, 13]

**Step 18**: E2E test for OAuth flow
- **Files**: `oauth.e2e.spec.ts`
- **Scenario**: Complete OAuth flow with test user
- **Dependencies**: All

---

## Test Strategy

### Unit Tests (Target: 85% coverage)
- `oauth.service.spec.ts` - Test account linking, token encryption
- `oauth-token.repository.spec.ts` - Test CRUD with encryption
- `OAuthButtons.spec.tsx` - Test button rendering, click handlers
- `ConnectedAccounts.spec.tsx` - Test account display, disconnect

### Integration Tests (3 scenarios)
- **Google OAuth Flow**: Mock Google API, test full flow
- **GitHub OAuth Flow**: Mock GitHub API, test full flow
- **Account Linking**: Test linking OAuth to existing user

### E2E Tests (2 user flows)
- **New User OAuth Sign-in**: Complete flow creating new user
- **Existing User OAuth Link**: Link OAuth to existing account

---

## Success Criteria

| Criterion | Verification |
|-----------|--------------|
| Google OAuth works | E2E test passes, manual testing |
| GitHub OAuth works | E2E test passes, manual testing |
| Tokens encrypted | Check database, tokens not plaintext |
| Account linking | Integration test, check user_id FK |
| Error handling | Unit tests for all error cases |
| 80%+ coverage | Jest coverage report ≥80% |
| Security review | No plaintext tokens, secure redirect |

---

## Assumptions

1. **Google/GitHub OAuth credentials configured** (MEDIUM risk)
   - Validation: Check env vars before implementation

2. **Keycloak session management compatible** (LOW risk)
   - Validation: Test session creation after OAuth

3. **Users have unique email addresses** (MEDIUM risk)
   - Validation: Use email as account linking key

4. **OAuth providers return standard claims** (LOW risk)
   - Validation: Follow OAuth 2.0 RFC 6749

---

## Estimated Timeline

- Database setup: 30 minutes
- Backend integration: 2 hours
- Frontend integration: 45 minutes
- Testing: 45 minutes
- **Total**: ~4 hours

---

🤖 Plan generated automatically with 82% confidence
📊 Auto-approved (≥80% threshold)
```

✅ **82% Confidence**: Plan auto-approved! Proceeding with implementation...

---

### 3. Autonomous Decision Making (logged throughout)

During implementation, framework makes autonomous decisions:

**Decision 1**: Library Selection
```json
{
  "decision": "Use passport-google-oauth20 for Google OAuth",
  "reasoning": "Official Passport.js strategy, 2.5M weekly downloads, well-maintained",
  "confidence": 95,
  "alternatives": [
    { "option": "google-auth-library", "score": 75 },
    { "option": "custom implementation", "score": 30 }
  ]
}
```

**Decision 2**: Token Encryption
```json
{
  "decision": "Use AES-256-GCM for token encryption",
  "reasoning": "Industry standard, authenticated encryption, performance efficient",
  "confidence": 92,
  "alternatives": [
    { "option": "AES-256-CBC", "score": 80 },
    { "option": "ChaCha20-Poly1305", "score": 85 }
  ]
}
```

**Decision 3**: Error Handling
```json
{
  "decision": "Return user-friendly error page with retry button",
  "reasoning": "OAuth errors often transient, retry usually succeeds",
  "confidence": 88
}
```

---

### 4. Implementation (2.5 hours)

**Key Implementation Files**:

**Backend**: `oauth.service.ts` (excerpt)

```typescript
import { Injectable } from '@nestjs/common';
import { OAuthTokenRepository } from '../repository/oauth-token.repository';
import * as crypto from 'crypto';

@Injectable()
export class OAuthService {
  private readonly ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY;

  constructor(
    private readonly oauthTokenRepo: OAuthTokenRepository
  ) {}

  async linkOAuthAccount(userId: string, provider: string, tokens: any) {
    const encrypted = this.encryptTokens(tokens);

    return this.oauthTokenRepo.create({
      userId,
      provider,
      accessToken: encrypted.accessToken,
      refreshToken: encrypted.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    });
  }

  private encryptTokens(tokens: any) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.ENCRYPTION_KEY, 'hex');

    const encryptToken = (token: string) => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    };

    return {
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
    };
  }

  async refreshAccessToken(tokenId: string) {
    const token = await this.oauthTokenRepo.findById(tokenId);
    const decrypted = this.decryptToken(token.refreshToken);

    // OAuth provider refresh logic...
  }
}
```

**Frontend**: `OAuthButtons.tsx`

```typescript
export const OAuthButtons = () => {
  const handleOAuthClick = (provider: 'google' | 'github') => {
    const currentUrl = window.location.href;
    window.location.href = `${API_BASE_URL}/auth/${provider}?returnTo=${encodeURIComponent(currentUrl)}`;
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => handleOAuthClick('google')}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border rounded-lg hover:bg-gray-50"
      >
        <GoogleIcon />
        <span>Sign in with Google</span>
      </button>

      <button
        onClick={() => handleOAuthClick('github')}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border rounded-lg hover:bg-gray-50"
      >
        <GitHubIcon />
        <span>Sign in with GitHub</span>
      </button>
    </div>
  );
};
```

---

### 5. Smart Test Selection (15 seconds)

```bash
$ node utils/smart-test-selection.js \
    --base origin/main \
    --head HEAD \
    --ticket PROJ-234
```

**Output**:
```json
{
  "summary": {
    "totalTests": 234,
    "criticalTests": 18,
    "relatedTests": 12,
    "unrelatedTests": 204,
    "estimatedTimeReduction": "87%"
  },
  "testSelection": {
    "critical": [
      "auth/oauth.service.spec.ts",
      "auth/oauth-token.repository.spec.ts",
      "auth/oauth.controller.spec.ts",
      "auth/oauth.integration.spec.ts",
      "features/auth/OAuthButtons.spec.tsx",
      "features/settings/ConnectedAccounts.spec.tsx",
      "e2e/oauth-flow.spec.ts",
      // ... (11 more auth-related tests)
    ]
  }
}
```

✅ **87% Time Reduction**: Run 30 tests instead of 234!

---

### 6. Testing (45 minutes)

**Test Results**:
```bash
$ pnpm test

Backend Unit Tests:
PASS oauth.service.spec.ts (12 tests)
PASS oauth-token.repository.spec.ts (8 tests)
PASS oauth.controller.spec.ts (10 tests)

Backend Integration Tests:
PASS oauth.integration.spec.ts (6 tests)
  ✓ Google OAuth flow with mock provider
  ✓ GitHub OAuth flow with mock provider
  ✓ Account linking to existing user
  ✓ Token refresh flow
  ✓ Error handling for invalid tokens
  ✓ Disconnect OAuth account

Frontend Tests:
PASS OAuthButtons.spec.tsx (5 tests)
PASS ConnectedAccounts.spec.tsx (7 tests)

E2E Tests:
PASS oauth-flow.e2e.spec.ts (4 tests)
  ✓ New user sign-in with Google
  ✓ Existing user link GitHub
  ✓ Redirect to original page after OAuth
  ✓ Handle OAuth error gracefully

Tests:       52 passed, 52 total
Coverage:    87.3% (statements: 234/268, branches: 45/52)
Time:        18.432s
```

✅ **All Tests Passed**: 87% coverage (exceeds 80% target)!

---

### 7. Self-Healing Tests (2 auto-fixes)

**Auto-Fix 1**: Import Path Error
```
Error: Cannot find module '@/types/oauth'
```

**Healing**:
```typescript
// Before
import { OAuthProvider } from '@/types/oauth';

// After (auto-fixed)
import { OAuthProvider } from '@livonit/shared';
```

**Auto-Fix 2**: Async/Await Missing
```
Error: A promise was expected but none was returned
```

**Healing**:
```typescript
// Before
it('should link OAuth account', () => {
  service.linkOAuthAccount(userId, 'google', tokens);
});

// After (auto-fixed)
it('should link OAuth account', async () => {
  await service.linkOAuthAccount(userId, 'google', tokens);
});
```

✅ **Both fixes succeeded**, tests re-run automatically

---

### 8. PR Creation (automatic)

**Generated PR**:

```markdown
## 🔐 Add OAuth 2.0 Authentication (Google & GitHub)

**Ticket**: [PROJ-234](https://jira.company.com/browse/PROJ-234)

### Summary
Integrates OAuth 2.0 authentication to allow users to sign in with Google and GitHub accounts.

### Implementation Plan
- **Risk Score**: 58/100 (MEDIUM)
- **Strategy**: PLAN_FIRST
- **Confidence**: 82% (AUTO-APPROVED)

### Changes
✅ **Backend**:
- OAuth 2.0 Passport strategies (Google, GitHub)
- OAuth controller with redirect callbacks
- AES-256-GCM token encryption
- Database migration for oauth_tokens table
- Business logic for account linking and token refresh

✅ **Frontend**:
- OAuth sign-in buttons on login page
- Connected accounts management UI
- Redirect to original page after OAuth

✅ **Security**:
- All tokens encrypted at rest (AES-256-GCM)
- Secure OAuth redirect flow
- Token refresh logic implemented

### Files Changed (12 files)
- **Created**: 9 files (681 lines)
- **Modified**: 3 files (+35 lines)

### Test Coverage
- Unit tests: ✅ 35/35 passed (87% coverage)
- Integration tests: ✅ 6/6 passed
- E2E tests: ✅ 4/4 passed
- **Total**: ✅ 45/45 tests passed

### Decisions Made
1. **Library**: passport-google-oauth20 (95% confidence)
2. **Encryption**: AES-256-GCM (92% confidence)
3. **Error Handling**: User-friendly retry page (88% confidence)

### Assumptions
1. Google/GitHub OAuth credentials configured (MEDIUM risk) ✅ Validated
2. Keycloak session compatible (LOW risk) ✅ Validated
3. Users have unique emails (MEDIUM risk) ✅ Validated

---

🤖 Generated with [AI Agentic Framework](https://github.com/your-org/qubika-agentic-framework)
📊 Confidence: 82% | ⏱️ Implementation: 3.8 hours | 🧪 Coverage: 87%
```

---

## Complete Timeline

| Phase | Planned | Actual | Status |
|-------|---------|--------|--------|
| Risk Assessment | 1m | 45s | ✅ Automated |
| Planning | 5m | 3m | ✅ Automated (82% confidence) |
| Implementation | 2.5h | 2.5h | ✅ Automated |
| Testing | 45m | 45m | ✅ Automated (87% coverage) |
| PR Creation | 1m | 30s | ✅ Automated |
| **TOTAL** | **~4h** | **~3.8h** | **✅ Zero user prompts!** |

---

## Key Takeaways

✅ **Medium Risk = Plan First**: 82% confidence after planning → auto-approved

✅ **Comprehensive Plan**: 18 implementation steps with dependencies

✅ **Autonomous Decisions**: 3 decisions logged with alternatives

✅ **Smart Testing**: 87% time reduction (30 tests vs 234 tests)

✅ **Self-Healing**: 2 test failures auto-fixed

✅ **Security First**: AES-256-GCM encryption, secure OAuth flow

✅ **Production Ready**: 87% test coverage, full E2E testing

---

## Comparison: Low vs Medium Risk

| Aspect | Low Risk (PROJ-101) | Medium Risk (PROJ-234) |
|--------|---------------------|------------------------|
| **Strategy** | DIRECT | PLAN_FIRST |
| **Planning Time** | 1m | 3m |
| **Plan Approval** | Auto (95%) | Auto (82%) |
| **Implementation** | 45m | 2.5h |
| **Files Changed** | 3 | 12 |
| **Systems Affected** | 1 (Frontend) | 4 (Backend, DB, Frontend, Auth) |
| **Tests Run** | 5 | 30 |
| **Decisions Logged** | 0 | 3 |
| **Assumptions Logged** | 2 | 3 |
| **User Prompts** | 0 | 0 |

---

## Try It Yourself

```bash
# 1. Create medium-risk ticket in Jira
# 2. Run autonomous workflow
node scripts/autonomous-workflow.sh PROJ-234

# 3. Framework will:
#    - Assess risk (MEDIUM)
#    - Generate plan (82% confidence)
#    - Auto-approve plan
#    - Implement OAuth
#    - Run smart tests
#    - Create PR with artifacts

# 4. Wake up to production-ready PR ☀️
```

---

**Previous Example**: [Simple Feature (Direct Strategy)](./simple-feature.md)
**Next Example**: [Complex Feature (Architect Mode)](./complex-feature.md)
