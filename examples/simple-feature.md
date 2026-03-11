# Example: Simple Feature Implementation (Low Risk)

**Feature**: Add Dark Mode Toggle to Settings Page

**Risk Level**: LOW (Score: 22/100)
**Strategy**: DIRECT
**Implementation Time**: ~1.5 hours
**Autonomous**: ✅ Yes (95% confidence)

---

## Overview

This example demonstrates a low-risk, straightforward feature implementation that requires minimal planning. The AI agentic framework handles this completely autonomously with zero user prompts.

### What Makes This Low Risk?

✅ **Clear Requirements**: Toggle button with localStorage persistence
✅ **Known Tech Stack**: React, Tailwind CSS, localStorage API
✅ **No Breaking Changes**: Pure addition, no existing code modified
✅ **Single System**: Frontend only
✅ **Well-Understood Pattern**: Common UI feature

---

## Ticket Example

```markdown
**PROJ-101**: Add Dark Mode Toggle

**Description**:
Add a dark mode toggle to the settings page that:
- Displays a toggle switch in the settings panel
- Persists user preference in localStorage
- Applies dark theme immediately when toggled
- Uses existing Tailwind dark mode classes

**Acceptance Criteria**:
- [ ] Toggle appears in Settings page
- [ ] Clicking toggle switches between light/dark
- [ ] Preference persists across page reloads
- [ ] All UI components respect dark mode
```

---

## Step-by-Step Autonomous Workflow

### 1. Risk Assessment (30 seconds)

```bash
$ node utils/select-strategy.js \
    --ticket PROJ-101 \
    --context ticket-context.json
```

**Output**:
```json
{
  "ticketKey": "PROJ-101",
  "riskScore": 22,
  "riskLevel": "LOW",
  "strategy": "DIRECT",
  "factors": {
    "impact": {
      "score": 20,
      "affectedSystems": ["frontend"],
      "breakingChanges": false
    },
    "complexity": {
      "score": 25,
      "technicalComplexity": "Low - standard UI component",
      "technologiesInvolved": ["React", "Tailwind", "localStorage"]
    },
    "uncertainty": {
      "score": 20,
      "ambiguousRequirements": false,
      "unknownDependencies": []
    }
  },
  "reasoning": "Simple UI addition with clear requirements and no breaking changes",
  "mitigationSteps": [
    "Add unit tests for toggle component",
    "Test localStorage persistence",
    "Verify dark mode classes work across all pages"
  ]
}
```

✅ **Strategy Selected**: DIRECT (implement immediately, no planning needed)

---

### 2. Autonomous Planning (1 minute)

```bash
$ node utils/auto-plan.js \
    --ticket PROJ-101 \
    --context ticket-context.json
```

**Output**:
```json
{
  "ticketKey": "PROJ-101",
  "confidence": {
    "score": 95,
    "approvalNeeded": false,
    "factors": {
      "clearRequirements": 40,
      "knownTechStack": 30,
      "noBreakingChanges": 20,
      "lowRisk": 5
    }
  },
  "fileChanges": [
    {
      "path": "services/web-frontend/src/features/settings/SettingsPage.tsx",
      "operation": "MODIFY",
      "purpose": "Add dark mode toggle to settings panel"
    },
    {
      "path": "services/web-frontend/src/hooks/useDarkMode.ts",
      "operation": "CREATE",
      "purpose": "Custom hook for dark mode state management"
    },
    {
      "path": "services/web-frontend/src/components/molecules/DarkModeToggle/index.tsx",
      "operation": "CREATE",
      "purpose": "Toggle component with Tailwind dark mode"
    }
  ],
  "implementationSteps": [
    {
      "phase": "Setup",
      "step": 1,
      "description": "Create useDarkMode hook with localStorage",
      "files": ["hooks/useDarkMode.ts"]
    },
    {
      "phase": "Implementation",
      "step": 2,
      "description": "Create DarkModeToggle component",
      "files": ["components/molecules/DarkModeToggle/index.tsx"]
    },
    {
      "phase": "Integration",
      "step": 3,
      "description": "Add toggle to SettingsPage",
      "files": ["features/settings/SettingsPage.tsx"]
    },
    {
      "phase": "Testing",
      "step": 4,
      "description": "Add unit tests for toggle and hook",
      "files": [
        "components/molecules/DarkModeToggle/DarkModeToggle.spec.tsx",
        "hooks/useDarkMode.spec.ts"
      ]
    }
  ]
}
```

✅ **95% Confidence**: Plan auto-approved, no user intervention needed!

---

### 3. Implementation (45 minutes)

**File 1**: `hooks/useDarkMode.ts`

```typescript
import { useEffect, useState } from 'react';

export const useDarkMode = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  return { darkMode, setDarkMode };
};
```

**File 2**: `components/molecules/DarkModeToggle/index.tsx`

```typescript
import { useDarkMode } from '@/hooks/useDarkMode';

export const DarkModeToggle = () => {
  const { darkMode, setDarkMode } = useDarkMode();

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Dark Mode
      </span>
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full
          transition-colors focus:outline-none focus:ring-2
          focus:ring-blue-500 focus:ring-offset-2
          ${darkMode ? 'bg-blue-600' : 'bg-gray-200'}
        `}
        role="switch"
        aria-checked={darkMode}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full
            bg-white transition-transform
            ${darkMode ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
    </div>
  );
};
```

**File 3**: Update `features/settings/SettingsPage.tsx`

```typescript
import { DarkModeToggle } from '@/components/molecules/DarkModeToggle';

export const SettingsPage = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Existing settings... */}

        {/* New dark mode toggle */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Appearance</h2>
          <DarkModeToggle />
        </div>
      </div>
    </div>
  );
};
```

**Assumptions Logged** (automatic):
```json
[
  {
    "assumption": "All components use Tailwind dark: classes",
    "risk": "LOW",
    "validation": "Verify dark mode works across all pages"
  },
  {
    "assumption": "localStorage is available in all browsers",
    "risk": "LOW",
    "validation": "Add fallback for browsers without localStorage"
  }
]
```

---

### 4. Smart Test Selection (10 seconds)

```bash
$ node utils/smart-test-selection.js \
    --base origin/main \
    --head HEAD \
    --ticket PROJ-101
```

**Output**:
```json
{
  "summary": {
    "totalTests": 234,
    "criticalTests": 3,
    "relatedTests": 2,
    "unrelatedTests": 229,
    "estimatedTimeReduction": "98%"
  },
  "testSelection": {
    "critical": [
      {
        "file": "hooks/useDarkMode.spec.ts",
        "reason": "Tests changed file directly"
      },
      {
        "file": "components/molecules/DarkModeToggle/DarkModeToggle.spec.tsx",
        "reason": "Tests changed file directly"
      },
      {
        "file": "features/settings/SettingsPage.spec.tsx",
        "reason": "Tests modified component"
      }
    ],
    "related": [
      {
        "file": "e2e/settings.spec.ts",
        "reason": "E2E test for Settings page"
      },
      {
        "file": "hooks/index.spec.ts",
        "reason": "Tests hooks barrel export"
      }
    ]
  }
}
```

✅ **98% Time Reduction**: Only run 5 tests instead of 234!

---

### 5. Testing (15 minutes)

**Unit Tests**: `hooks/useDarkMode.spec.ts`

```typescript
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from './useDarkMode';

describe('useDarkMode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('should initialize with false when no saved preference', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.darkMode).toBe(false);
  });

  it('should toggle dark mode', () => {
    const { result } = renderHook(() => useDarkMode());

    act(() => {
      result.current.setDarkMode(true);
    });

    expect(result.current.darkMode).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');
  });

  it('should persist preference across re-renders', () => {
    localStorage.setItem('darkMode', 'true');
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.darkMode).toBe(true);
  });
});
```

**Test Results**:
```bash
$ pnpm --filter ./services/web-frontend test:unit

PASS hooks/useDarkMode.spec.ts
PASS components/molecules/DarkModeToggle/DarkModeToggle.spec.tsx
PASS features/settings/SettingsPage.spec.tsx

Tests:       9 passed, 9 total
Coverage:    100% (statements: 24/24, branches: 8/8, functions: 6/6, lines: 24/24)
Time:        2.341s
```

✅ **All Tests Passed**: 100% coverage achieved!

---

### 6. PR Creation (automatic)

**Generated PR Description**:

```markdown
## 🎨 Add Dark Mode Toggle

**Ticket**: [PROJ-101](https://jira.company.com/browse/PROJ-101)

### Summary
Adds a dark mode toggle to the settings page with localStorage persistence.

### Changes
- ✅ Created `useDarkMode` hook with localStorage state management
- ✅ Created `DarkModeToggle` component with Tailwind dark mode
- ✅ Integrated toggle into Settings page
- ✅ Added unit tests (100% coverage)

### Files Changed
- `hooks/useDarkMode.ts` (NEW, 23 lines)
- `components/molecules/DarkModeToggle/index.tsx` (NEW, 34 lines)
- `features/settings/SettingsPage.tsx` (MODIFIED, +8 lines)

### Test Coverage
- Unit tests: ✅ 9/9 passed
- Integration tests: ✅ 2/2 passed
- Coverage: ✅ 100%

### Risk Assessment
- **Risk Score**: 22/100 (LOW)
- **Strategy**: DIRECT
- **Breaking Changes**: None

### Assumptions Made
1. All components use Tailwind `dark:` classes (LOW risk)
2. localStorage is available in all browsers (LOW risk)

### Screenshots
[Dark mode toggle in settings]

---

🤖 Generated with [AI Agentic Framework](https://github.com/your-org/ai-agentic-framework)
📊 Confidence: 95% | ⏱️ Implementation: 1.2 hours
```

---

## Complete Timeline

| Phase | Time | Status |
|-------|------|--------|
| Risk Assessment | 30s | ✅ Automated |
| Planning | 1m | ✅ Automated (95% confidence) |
| Implementation | 45m | ✅ Automated |
| Testing | 15m | ✅ Automated (100% pass) |
| PR Creation | 30s | ✅ Automated |
| **TOTAL** | **~1 hour** | **✅ Zero user prompts!** |

---

## Key Takeaways

✅ **Low Risk = Full Autonomy**: 95% confidence → zero user intervention needed

✅ **Smart Testing**: 98% time reduction (5 tests vs 234 tests)

✅ **Comprehensive Output**: PR with artifacts, assumptions, risk assessment

✅ **Production Ready**: 100% test coverage, proper error handling

✅ **Overnight Capable**: Can queue 10+ similar tickets for overnight implementation

---

## Try It Yourself

```bash
# 1. Create similar ticket in Jira
# 2. Run autonomous workflow
node scripts/autonomous-workflow.sh PROJ-101

# 3. Go to sleep 😴
# 4. Wake up to merged PR ☀️
```

---

**Next Example**: [Medium-Risk Feature (Plan-First Strategy)](./medium-feature.md)
