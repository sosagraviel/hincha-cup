# Pillar 1: UI Task Detection

A shared, deterministic function that classifies whether a task involves UI work. Produces a confidence score (0-100) and an `isUI` boolean. Consumed by `create-sdd-ticket`, `implement-ticket`, and the standalone skill.

**Location:** `orchestration/src/utils/ui-task-detector.ts`

---

## Algorithm: Signal-Based Scoring

The detector evaluates five signal categories, each contributing a weighted score capped at its maximum.

### Signal 1: Ticket Content Keywords (max 30 points)

**Primary keywords** (5 points each, max 20):
`screen`, `page`, `component`, `UI`, `design`, `layout`, `widget`, `dashboard`, `modal`, `dialog`, `form`, `button`, `navigation`, `sidebar`, `header`, `footer`, `responsive`, `mobile`, `tablet`, `desktop`

**Secondary keywords** (3 points each, max 10):
`CSS`, `style`, `color`, `font`, `typography`, `spacing`, `padding`, `margin`, `border`, `animation`, `transition`, `hover`, `icon`, `image`, `figma`, `mockup`, `wireframe`, `pixel`

Detection is case-insensitive and applies to the entire ticket body (title, description, acceptance criteria, technical context, implementation notes).

### Signal 2: Figma References (max 25 points)

- Presence of `figma.com/design/` or `figma.com/file/` URL pattern: **20 points**
- Presence of `node-id=` parameter in any Figma URL: **+5 bonus**
- Total capped at 25

Also extracts all matched Figma URLs for downstream use (fileKey + nodeId parsing).

### Signal 3: File Path Signals (max 20 points)

Scans the ticket's "Files to Create/Modify" section, technical approach, or `changedFiles` input for directory patterns:

`components/`, `pages/`, `ui/`, `views/`, `layouts/`, `styles/`, `css/`, `scss/`, `templates/`

**4 points each**, capped at 20.

### Signal 4: Stack Detection (max 15 points)

Checks the project's detected stack profile for frontend frameworks:
`React`, `Vue`, `Angular`, `Next.js`, `Nuxt`, `Svelte`

If any detected: **15 points**. Otherwise: **0 points**.

Note: Stack detection alone does not classify a task as UI — it's a supporting signal.

### Signal 5: Acceptance Criteria Visual References (max 10 points)

Scans BDD scenarios and acceptance criteria for visual behavior terms:
`renders`, `displays`, `shows`, `visible`, `hidden`, `screenshot`, `visual`, `pixel`, `diff`, `match`, `align`, `center`, `responsive`

**2 points each**, capped at 10.

---

## Classification Threshold

| Score | Classification | Recommendation |
|-------|---------------|----------------|
| >= 50 | Strong UI task | `ui-visual-testing` (both modes) |
| 25-49 | Likely UI task | `regression-only` (screenshot mode) |
| < 25  | Not UI | `no-ui` |

`isUI = true` when score **>= 25**.

---

## Interface

```typescript
export interface UITaskClassification {
  isUI: boolean;
  confidence: number;
  signals: {
    keywordScore: number;
    figmaScore: number;
    filePathScore: number;
    stackScore: number;
    acceptanceCriteriaScore: number;
  };
  figmaReferences: FigmaReference[];
  detectedKeywords: string[];
  recommendation: 'ui-visual-testing' | 'regression-only' | 'no-ui';
}

export interface FigmaReference {
  url: string;
  fileKey: string;
  nodeId?: string;
}

export function classifyUITask(
  ticketContent: string,
  stackProfile?: StackProfile,
  changedFiles?: string[]
): UITaskClassification;
```

---

## Examples

| Ticket Type | Expected Score | Breakdown |
|------------|---------------|-----------|
| Pure backend API endpoint | ~0-15 | No UI keywords, no Figma, backend paths only |
| React component with Figma link | ~70-85 | Keywords (20) + Figma (25) + paths (12) + stack (15) + AC (8) |
| Bug fix on existing dashboard | ~35-50 | Keywords (15) + paths (8) + stack (15) + AC (4) |
| Database migration | ~0 | Zero signals |
