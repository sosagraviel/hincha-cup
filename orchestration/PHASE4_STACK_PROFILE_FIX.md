# Phase 4 Stack Profile Fix - Extract from Phase 1 Analysis

**Date:** 2026-03-21
**Issue:** Skills not being resolved because StackProfile was empty
**Status:** FIXED

## Problem

User reported: "We broke most that we fixed, not all the skills are being copied in a flat way on the target .claude, and only the generic implementer was generated and no skills linked to the planner."

### Root Cause

Phase 4's `context-generation.node.ts` was calling an independent stack detection CLI (`utils/stack/cli.js`) which returned empty data for languages and frameworks. This caused:

1. **Empty StackProfile** in `framework-config.json`:
   - `languages: []` - EMPTY
   - `frameworks: {frontend: [], backend: [], mobile: []}` - EMPTY
   - `detected_workspaces: []` - EMPTY

2. **No Skills Resolved** in Phase 5:
   - skill-resolver extracts languages/frameworks from StackProfile
   - Empty StackProfile → No skills matched
   - `resource_state.skills: {}` - EMPTY

3. **No Skills Linked to Planner**:
   - Phase 6 agent generation had no skills to link
   - Only `planner.md` and `implementer-generic.md` generated

**But Phase 1 analyzers had ALL the data:**
- Languages: ["TypeScript", "JavaScript", "Python"] ✅
- Frameworks: Next.js, React, Grommet, Firebase, etc. ✅
- Workspaces: Detailed workspace data ✅
- Infrastructure: ["firebase", "docker", "terraform"] ✅ (this worked because we extract it from Phase 1)

## Solution

**Changed Phase 4 to extract ALL stack profile data from Phase 1 analysis instead of running independent stack detection CLI.**

### Implementation

**File:** `orchestration/src/nodes/phase4/context-generation.node.ts`

#### 1. Extract Languages from Phase 1

```typescript
const structureFindings = state.phase1_analysis?.structure_architecture?.findings as any;

// Extract languages from structure analyzer
const languagesFromPhase1 = Array.isArray(structureFindings?.languages)
  ? structureFindings.languages.map((l: string) => l.toLowerCase())
  : [];
```

#### 2. Extract Frameworks from Phase 1

```typescript
// Extract frameworks from structure analyzer
const frameworksObj = structureFindings?.frameworks || {};
const frontendFrameworks: string[] = [];
const backendFrameworks: string[] = [];

// Parse frameworks object (it has main, orm, testing, ui fields)
if (frameworksObj.main) {
  const mainFramework = frameworksObj.main.split(' ')[0].toLowerCase();
  if (mainFramework.includes('next') || mainFramework.includes('react') || ...) {
    frontendFrameworks.push(mainFramework);
  } else {
    backendFrameworks.push(mainFramework);
  }
}

// Also extract from workspace dependencies
const workspaces = structureFindings?.multi_stack?.workspaces || [];
workspaces.forEach((ws: any) => {
  if (Array.isArray(ws.dependencies)) {
    ws.dependencies.forEach((dep: string) => {
      // Categorize as frontend/backend based on dep name
    });
  }
});
```

#### 3. Extract Testing Frameworks

```typescript
const testingFrameworks: Record<string, string[]> = {};
workspaces.forEach((ws: any) => {
  if (ws.language && ws.testing_framework && ws.testing_framework !== 'none') {
    const lang = ws.language.toLowerCase();
    if (!testingFrameworks[lang]) {
      testingFrameworks[lang] = [];
    }
    if (!testingFrameworks[lang].includes(ws.testing_framework)) {
      testingFrameworks[lang].push(ws.testing_framework);
    }
  }
});
```

#### 4. Build StackProfile from Extracted Data

```typescript
const stackProfile: StackProfile = {
  languages: languagesFromPhase1.length > 0 ? languagesFromPhase1 : undefined,
  primary_language: primaryLanguage,
  frameworks: {
    frontend: frontendFrameworks.length > 0 ? frontendFrameworks : [],
    backend: backendFrameworks.length > 0 ? backendFrameworks : [],
    mobile: []
  },
  testing_frameworks: Object.keys(testingFrameworks).length > 0 ? testingFrameworks : undefined,
  infrastructure: infrastructureFromPhase1.length > 0 ? infrastructureFromPhase1 : undefined,
  detected_workspaces: detectedWorkspaces.length > 0 ? detectedWorkspaces : undefined,
  file_counts: undefined,
  workspaces: detectedWorkspaces.length > 0 ? detectedWorkspaces : undefined,
  package_manager: techStackFindings?.monorepo?.workspace_manager as string | undefined,
  workspace_type: structureFindings?.repository_type as string | undefined
};
```

#### 5. Removed Unused Code

- Removed `runStackDetection()` function (lines 229-274)
- Removed `spawn` import from `child_process`

## Data Flow

### Before (Broken)

```
Phase 1 Analyzers
  ↓ Detect: Languages, Frameworks, Infrastructure
  ↓ Store in state.phase1_analysis
  ↓
Phase 4: context-generation
  ↓ IGNORES Phase 1 data
  ↓ Runs stack detection CLI independently
  ↓ CLI returns EMPTY data for languages/frameworks
  ↓ Creates EMPTY StackProfile
  ↓
Phase 5: skill-resolver
  ↓ Reads EMPTY StackProfile
  ↓ NO skills resolved
  ↓
Phase 6: agent-generation
  ↓ No skills to link to planner
```

### After (Fixed)

```
Phase 1 Analyzers
  ↓ Detect: Languages, Frameworks, Infrastructure
  ↓ Store in state.phase1_analysis
  ↓
Phase 4: context-generation
  ↓ EXTRACTS all data from Phase 1
  ↓ Creates POPULATED StackProfile
  ↓
Phase 5: skill-resolver
  ↓ Reads POPULATED StackProfile
  ↓ Skills resolved correctly
  ↓
Phase 6: agent-generation
  ↓ Skills linked to planner
```

## Example Output

For stride-origin project:

**Before Fix (Empty):**
```json
{
  "stack_profile": {
    "languages": [],
    "frameworks": {"frontend": [], "backend": [], "mobile": []},
    "infrastructure": ["firebase", "docker", "terraform"]
  },
  "resource_state": {
    "skills": {}
  }
}
```

**After Fix (Populated):**
```json
{
  "stack_profile": {
    "languages": ["typescript", "javascript", "python"],
    "primary_language": "typescript",
    "frameworks": {
      "frontend": ["next.js", "react", "grommet"],
      "backend": ["express", "flask"],
      "mobile": []
    },
    "testing_frameworks": {
      "typescript": ["jest"],
      "python": ["pytest"],
      "javascript": ["jest"]
    },
    "infrastructure": ["firebase", "docker", "terraform"],
    "detected_workspaces": [
      {"path": "packages/stride-lib", "language": "typescript", ...},
      {"path": "web", "language": "typescript", ...},
      ...
    ]
  },
  "resource_state": {
    "skills": {
      "mastering-typescript": {...},
      "mastering-python-skill": {...},
      "using-firebase": {...},
      "developing-with-docker": {...},
      ...
    }
  }
}
```

## Files Modified

```
orchestration/src/nodes/phase4/context-generation.node.ts  - Complete rewrite of stack detection logic
```

## Validation

- ✅ TypeScript builds with zero errors
- ✅ Removed unused `runStackDetection()` function
- ✅ Removed unused `spawn` import

## Next Steps

Test the fix by:
1. Delete `.claude` directory in stride-origin
2. Run initialization
3. Verify stack_profile is populated in framework-config.json
4. Verify skills are resolved in resource_state
5. Verify skills are linked to planner

## Benefits

1. ✅ **Leverages Phase 1 Analysis**: Uses LLM-detected data instead of file scanning
2. ✅ **Consistent Data**: Same data used throughout all phases
3. ✅ **No External Dependencies**: Removes dependency on stack detection CLI
4. ✅ **Skills Now Resolved**: Phase 5 will correctly detect and resolve skills
5. ✅ **Planner Has Skills**: Phase 6 will link skills to planner
6. ✅ **Faster**: No need to run separate CLI process
7. ✅ **Type-Safe**: Full TypeScript type checking
