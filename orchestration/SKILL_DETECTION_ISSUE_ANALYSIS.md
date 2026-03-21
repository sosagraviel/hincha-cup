# Skill Detection Issue - Root Cause Analysis

## Problem Statement

In the stride-origin project:
1. **Docker** - NOT detected (should be in infrastructure but no `infrastructure` field exists in stack_profile)
2. **Firebase** - Packages detected in workspaces (`firebase`, `firebase-functions`, `firebase-admin`) but skills NOT copied/linked
3. **Google Cloud** - Packages detected in workspaces (`@google-cloud/firestore`, `@google-cloud/kms`, `@google-cloud/storage`) but skills NOT copied/linked

## Root Cause #1: extractDetectedStack() Doesn't Extract from Workspaces

### Current Implementation
`orchestration/src/utils/skill-resolver.ts:57-88`

```typescript
function extractDetectedStack(stackProfile: StackProfile): Set<string> {
  const detected = new Set<string>();

  // ✅ Extracts from: stackProfile.languages
  if (stackProfile.languages) {
    stackProfile.languages.forEach(lang => detected.add(lang.toLowerCase()));
  }

  // ✅ Extracts from: stackProfile.frameworks.frontend/backend/mobile
  if (stackProfile.frameworks) {
    if (stackProfile.frameworks.frontend) { /* ... */ }
    if (stackProfile.frameworks.backend) { /* ... */ }
    if (stackProfile.frameworks.mobile) { /* ... */ }
  }

  // ✅ Extracts from: stackProfile.testing_frameworks
  if (stackProfile.testing_frameworks) { /* ... */ }

  // ❌ MISSING: Does NOT extract from stackProfile.detected_workspaces!

  return detected;
}
```

### What's Missing

The `stack_profile.detected_workspaces` array contains ALL detected packages:

```json
{
  "detected_workspaces": [
    {
      "path": "firebase",
      "frameworks": [
        "firebase",                    // ← Should trigger using-firebase skill
        "firebase-functions",
        "firebase-admin",
        "@google-cloud/firestore",    // ← Should trigger mastering-gcloud-commands skill
        "ts-node",
        "eslint"
      ]
    },
    {
      "path": "packages/stride-lib",
      "frameworks": [
        "@google-cloud/firestore",
        "@google-cloud/kms",
        "@google-cloud/storage",
        "firebase-admin",
        "firebase-functions",
        "googleapis"                   // ← Should trigger mastering-gcloud-commands skill
      ]
    }
  ]
}
```

**Current behavior:** These packages are NEVER added to the `detected` Set!

## Root Cause #2: Trigger Matching Uses Exact Match (Not Substring)

### Current Matching Logic
`orchestration/src/utils/skill-resolver.ts:93-114`

```typescript
function matchesTriggers(skill: SkillConfig, detectedStack: Set<string>) {
  for (const trigger of skill.triggers) {
    const triggerNormalized = trigger.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (detectedStack.has(triggerNormalized)) {  // ← Exact match only!
      matchedTriggers.push(trigger);
    }
  }
}
```

### The Problem with Exact Matching

**Example: Google Cloud packages**

Skill trigger: `"google-cloud"` → normalized: `"googlecloud"`

Detected packages:
- `"@google-cloud/firestore"` → normalized: `"googlecloudfirestore"`
- `"@google-cloud/kms"` → normalized: `"googlecloudkms"`
- `"@google-cloud/storage"` → normalized: `"googlecloudstorage"`

**Match check:** `detectedStack.has("googlecloud")` → ❌ FALSE!

None of the packages match because:
- `"googlecloud"` !== `"googlecloudfirestore"`
- `"googlecloud"` !== `"googlecloudkms"`
- `"googlecloud"` !== `"googlecloudstorage"`

**Example: Firebase packages**

Skill trigger: `"firebase"` → normalized: `"firebase"`

Detected packages:
- `"firebase"` → normalized: `"firebase"` ✅ MATCH!
- `"firebase-functions"` → normalized: `"firebasefunctions"` ❌ NO MATCH
- `"firebase-admin"` → normalized: `"firebaseadmin"` ❌ NO MATCH

Only the exact "firebase" package matches, not the related packages.

## Root Cause #3: Stack Profile Missing Infrastructure Field

Looking at the `stack_profile` structure:

```json
{
  "languages": ["javascript", "typescript", "python"],
  "frameworks": {
    "frontend": ["next", "react"],
    "backend": ["express", "Flask"],
    "mobile": []
  },
  "testing_frameworks": { ... },
  "detected_workspaces": [ ... ],
  "file_counts": {},
  "primary_language": "typescript"
}
```

**Missing fields:**
- `infrastructure` (for docker, kubernetes, terraform, etc.)
- `cloud_platforms` (for aws, gcp, azure CLI tools)
- `databases` (postgres, mysql, firestore, etc.)

Even if Docker was detected, there's no place to store it in the stack_profile structure!

## Why Skills Weren't Copied/Linked

### Firebase Skill

**Skill config:**
```json
{
  "name": "using-firebase",
  "triggers": ["firebase"],
  "compatible_languages": ["typescript", "javascript"]
}
```

**What happened:**
1. ✅ Packages detected: `firebase`, `firebase-functions`, `firebase-admin` in workspaces
2. ❌ `extractDetectedStack()` didn't extract from workspaces → detected Set is empty
3. ❌ `matchesTriggers("firebase", detected)` → no match
4. ❌ Skill NOT resolved → NOT copied → NOT linked

### Google Cloud Skill

**Skill config:**
```json
{
  "name": "mastering-gcloud-commands",
  "triggers": ["gcloud", "google-cloud"],
  "compatible_languages": []
}
```

**What happened:**
1. ✅ Packages detected: `@google-cloud/firestore`, `@google-cloud/kms`, `@google-cloud/storage`, `googleapis`
2. ❌ `extractDetectedStack()` didn't extract from workspaces
3. Even if it did:
   - `@google-cloud/firestore` → `"googlecloudfirestore"`
   - Trigger `"google-cloud"` → `"googlecloud"`
   - ❌ Exact match fails: `"googlecloud"` !== `"googlecloudfirestore"`
4. ❌ Skill NOT resolved → NOT copied → NOT linked

### Docker Skill

**Skill config:**
```json
{
  "name": "developing-with-docker",
  "triggers": ["docker", "dockerfile"],
  "compatible_languages": []
}
```

**What happened:**
1. ❌ Docker NOT detected by stack analyzer (Dockerfile exists but wasn't detected)
2. ❌ No `infrastructure` field in stack_profile to store it
3. ❌ Not in detected Set
4. ❌ Skill NOT resolved → NOT copied → NOT linked

## Verification: What Actually Got Extracted

Based on the framework-config.json:

**Extracted by current logic:**
```javascript
detected = Set([
  // From languages
  "javascript", "typescript", "python",

  // From frameworks.frontend
  "next", "react",

  // From frameworks.backend
  "express", "flask",

  // From testing_frameworks
  "jest", "playwright", "pytest", "unittest", "gotest"
])
```

**NOT extracted (but present in workspaces):**
```javascript
missing = [
  "firebase", "firebasefunctions", "firebaseadmin",
  "googlecloudfirestore", "googlecloudkms", "googlecloudstorage",
  "googleapis", "mobx", "grommet", "zod", "husky", etc.
]
```

## Impact Analysis

**Skills that SHOULD be included but AREN'T:**
1. ✅ `using-firebase` - firebase packages detected but NOT extracted
2. ✅ `mastering-gcloud-commands` - google-cloud packages detected but NOT extracted
3. ✅ `developing-with-docker` - Docker NOT detected at all
4. Potentially others depending on workspace packages

**Skills that ARE working:**
1. ✅ `mastering-typescript` - language detected correctly
2. ✅ `mastering-python-skill` - language detected correctly
3. ✅ `react-frontend` - framework.frontend detected correctly
4. ✅ `mastering-nextjs` - framework.frontend detected correctly
5. ✅ `jest-coverage-automation` - testing framework detected correctly
6. ✅ `playwright-e2e-automation` - testing framework detected correctly
7. ✅ `pytest-patterns` - testing framework detected correctly

---

## Proposed Solution

### Approach: Two-Phase Fix

**Phase 1: Extract from detected_workspaces**
Update `extractDetectedStack()` to iterate through `detected_workspaces[].frameworks`:

```typescript
function extractDetectedStack(stackProfile: StackProfile): Set<string> {
  const detected = new Set<string>();

  // ... existing language/framework/testing extraction ...

  // NEW: Extract from detected workspaces
  if (stackProfile.detected_workspaces) {
    for (const workspace of stackProfile.detected_workspaces) {
      if (workspace.frameworks && Array.isArray(workspace.frameworks)) {
        workspace.frameworks.forEach(fw => {
          detected.add(fw.toLowerCase().replace(/[^a-z0-9]/g, ''));
        });
      }
    }
  }

  return detected;
}
```

**Phase 2: Use Substring Matching for Triggers**

Update `matchesTriggers()` to support prefix/substring matching:

```typescript
function matchesTriggers(skill: SkillConfig, detectedStack: Set<string>): {
  matches: boolean;
  matchedTriggers: string[];
} {
  if (!skill.triggers || skill.triggers.length === 0) {
    return { matches: false, matchedTriggers: [] };
  }

  const matchedTriggers: string[] = [];

  for (const trigger of skill.triggers) {
    const triggerNormalized = trigger.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Option 1: Exact match (fast)
    if (detectedStack.has(triggerNormalized)) {
      matchedTriggers.push(trigger);
      continue;
    }

    // Option 2: Prefix match (for scoped packages like @google-cloud/*)
    for (const detected of detectedStack) {
      if (detected.startsWith(triggerNormalized)) {
        matchedTriggers.push(trigger);
        break; // Found a match, move to next trigger
      }
    }
  }

  return {
    matches: matchedTriggers.length > 0,
    matchedTriggers
  };
}
```

**Benefits:**
- ✅ `"firebase"` matches `"firebase"`, `"firebasefunctions"`, `"firebaseadmin"`
- ✅ `"googlecloud"` matches `"googlecloudfirestore"`, `"googlecloudkms"`, `"googlecloudstorage"`
- ✅ Backward compatible (exact matches still work)
- ✅ Handles scoped packages like `@google-cloud/*`, `@sentry/*`, etc.

### Alternative: Update Skill Triggers

Instead of substring matching, add more specific triggers:

```json
{
  "name": "using-firebase",
  "triggers": ["firebase", "firebase-functions", "firebase-admin"],
  ...
}
```

**Downside:** Requires maintaining exhaustive list of all related packages.

---

## Recommended Implementation Plan

1. **Fix #1: Extract from detected_workspaces** (simple, low risk)
   - Update `extractDetectedStack()` in `skill-resolver.ts:57-88`
   - Add iteration through `detected_workspaces[].frameworks`
   - Test: Verify firebase, google-cloud packages are now in detected Set

2. **Fix #2: Add prefix matching to matchesTriggers** (medium complexity)
   - Update `matchesTriggers()` in `skill-resolver.ts:93-114`
   - Try exact match first (fast path)
   - Fallback to prefix match for scoped packages
   - Test: Verify "google-cloud" trigger matches "@google-cloud/firestore"

3. **Fix #3: Stack Detector Enhancement** (separate issue, out of scope for current fix)
   - Add Docker detection in Phase 1 analyzers
   - Add `infrastructure` field to StackProfile
   - Store detected infrastructure tools (docker, kubernetes, terraform)
   - Can be deferred to future work

4. **Validation**
   - Re-run initialization on stride-origin
   - Verify skills copied:
     - ✅ using-firebase
     - ✅ mastering-gcloud-commands
   - Verify agent linking:
     - ✅ Planner has firebase skill
     - ✅ TypeScript implementer has firebase skill
     - ✅ Generic implementer has gcloud skill (empty compatible_languages)

---

## Testing Strategy

Create test cases for substring matching:

```typescript
describe('matchesTriggers with prefix matching', () => {
  it('should match exact trigger', () => {
    const detected = new Set(['firebase']);
    const skill = { triggers: ['firebase'] };
    expect(matchesTriggers(skill, detected).matches).toBe(true);
  });

  it('should match firebase scoped packages', () => {
    const detected = new Set(['firebasefunctions', 'firebaseadmin']);
    const skill = { triggers: ['firebase'] };
    expect(matchesTriggers(skill, detected).matches).toBe(true);
  });

  it('should match google-cloud scoped packages', () => {
    const detected = new Set(['googlecloudfirestore', 'googlecloudkms']);
    const skill = { triggers: ['googlecloud'] };
    expect(matchesTriggers(skill, detected).matches).toBe(true);
  });
});
```

---

## Questions for Clarification

1. **Substring vs Prefix matching?**
   - Prefix: `"firebase"` matches `"firebase*"` → Simple, fast
   - Substring: `"firebase"` matches `"*firebase*"` → More flexible but slower

2. **Should we also extract from databases, infrastructure if they exist in stack_profile?**
   - Currently these fields don't exist
   - Should we add them to StackProfile type definition?

3. **Docker detection - is this a priority?**
   - Requires changes to Phase 1 analyzers (stack detector)
   - OR we can detect from docker-compose.yml, Dockerfile presence
   - Should this be part of this fix or separate?
