# Pillar 4: Visual Testing Pipeline

Dual-mode (Figma + Screenshot) visual comparison with an iterative fix loop. Implemented as a standalone skill and integrated into `implement-ticket` Phase 6.

**Skill:** `skills/030-quality-assurance/ui-visual-testing/` (Archetype A — Workflow)

```
skills/030-quality-assurance/ui-visual-testing/
  SKILL.md
  references/
    figma-mapping.md              # Convention docs for ui-visual-testing.json
    renderer-adapters.md          # Per-framework screenshot quirks
    playwright-components.md      # Isolated component testing with Playwright CT
  templates/
    ui-visual-testing.json        # Starter mapping template
```

---

## CLI Interface

```
/ui-visual-testing [--ticket KEY] [--base-url URL] [--max-iterations N] [--mapping PATH] [--mode figma|screenshot|both]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--ticket` | Current branch slug | Used for artifact folder naming |
| `--base-url` | `http://localhost:3000` | Base URL of running dev server |
| `--max-iterations` | From config or `3` | Max fix-and-retry cycles |
| `--mapping` | Auto-detect | Explicit path to `ui-visual-testing.json` |
| `--mode` | Auto-detect | Force specific mode(s) |

### Exit Codes

| Code | Meaning |
|------|---------|
| `PASS` | All active comparisons within threshold |
| `FAIL` | Max iterations reached with failing frames |
| `SKIP` | No mapping found or no Figma access (not an error) |

---

## Pipeline Steps

```
Step 1: Resolve Configuration
  └─> Locate ui-visual-testing.json (component dir → project root)
  └─> If NOT found and pipeline needs it → ASK USER to create
      └─> Offer auto-generation from ticket context (routes, viewports, Figma refs)
      └─> Never silently skip — always surface the gap

Step 2: Determine Active Modes
  └─> Figma mode ON if:
      ├─> Config has figmaNodeIds for screen entries
      ├─> Ticket body contains Figma URLs
      ├─> Ticket frontmatter has figma: field
      └─> Acceptance criteria reference Figma
  └─> Screenshot mode ON if:
      ├─> Modifying existing screen (route exists, before snapshots available)
      └─> Config entry has modes: ["screenshot"]

Step 3: Figma Mode — Fetch Design Context (if active)
  └─> Invoke figma-design-fetcher skill (cascading access strategy)
  └─> Outputs to .claude-tmp/ui-validation/{ticketKey}/figma/:
      ├─> {label}.png              (frame export at 2x)
      ├─> {label}-constraints.json (design constraints)
      └─> design-context.md        (human-readable summary)

Step 4: Screenshot Mode — Capture Before (if active)
  └─> Playwright: navigate to route, set viewport, wait for ready
  └─> Capture full-page or selector-scoped screenshot
  └─> Consider Playwright Components for isolated component captures
  └─> Save to .claude-tmp/ui-validation/{ticketKey}/before/

Step 5: Capture After / Actual Screenshots
  └─> Same Playwright capture process as Step 4
  └─> Save to .claude-tmp/ui-validation/{ticketKey}/after/

Step 6: Compare
  └─> Figma comparison: actual vs figma export (pixelmatch)
      └─> Threshold from config.thresholds.figma (default: 2%)
  └─> Regression comparison: before vs after (pixelmatch)
      └─> Threshold from config.thresholds.regression (default: 5%)
  └─> Generate visual-diff-report.json with results from both modes

Step 7: Iteration Loop (for failing frames)
  └─> For each frame exceeding threshold:
      ├─> Invoke visual-verifier agent with:
      │   ├─> Diff images
      │   ├─> Design constraints (if Figma mode)
      │   ├─> Changed files
      │   └─> Mode context
      ├─> Agent returns structured JSON fix plan
      ├─> Apply fixes via implementer
      ├─> Re-capture only affected frames
      ├─> Re-diff
      └─> Repeat up to maxIterations (from config, default 3)

Step 8: Final Verdict
  └─> PASS: all frames within threshold for all active modes
  └─> FAIL: max iterations reached with remaining failures
  └─> Report per-mode results in visual-diff-report.json
```

---

## Figma Design Fetcher Skill

**Location:** `skills/040-integrations/figma-design-fetcher/` (Archetype A — Workflow)

```
skills/040-integrations/figma-design-fetcher/
  SKILL.md
  references/
    figma-api-guide.md              # Figma REST API usage patterns
    design-token-extraction.md      # Extracting constraints/tokens from node data
```

### Cascading Access Strategy

The skill tries each access method in order, stopping at the first success:

```
1. Figma MCP
   └─> Check .claude/mcp.json for Figma MCP server configuration
   └─> If configured: use MCP tools (richest integration)

2. FIGMA_ACCESS_TOKEN (environment variable)
   └─> Check process.env.FIGMA_ACCESS_TOKEN
   └─> If set: use Figma REST API directly

3. Suggest MCP setup
   └─> If neither available: suggest user install Figma MCP
   └─> Wait for user confirmation, then retry step 1

4. Ask user to set token
   └─> Ask to set FIGMA_ACCESS_TOKEN in .env.local
   └─> echo "FIGMA_ACCESS_TOKEN=figd_xxxx" >> .env.local
   └─> Wait for confirmation, then retry step 2

5. Ask for manual exports
   └─> Ask: "Can you provide exported images of the component/screen?"
   └─> Instruct user to place PNGs in .claude-tmp/ui-validation/{ticketKey}/figma/
   └─> Image-only mode (no constraint extraction)

6. Fall back to screenshot-only
   └─> Disable Figma mode entirely — run regression mode only
```

### What the Skill Fetches

**Frame Images** — `GET /v1/images/{fileKey}?ids={nodeId}&format=png&scale=2`

**Node Properties** — `GET /v1/files/{fileKey}/nodes?ids={nodeId}`

Extracts: `layoutMode`, `padding`, `itemSpacing`, `absoluteBoundingBox`, `fills`, `strokes`, `style` (typography), `effects`, `cornerRadius`

**Document Styles** — `GET /v1/files/{fileKey}/styles` — maps Figma style IDs to named tokens

### Output Format (`{label}-constraints.json`)

```json
{
  "nodeId": "1:23",
  "label": "Dashboard – Desktop",
  "dimensions": { "width": 1440, "height": 900, "cornerRadius": 0 },
  "layout": {
    "mode": "VERTICAL",
    "padding": { "top": 24, "right": 32, "bottom": 24, "left": 32 },
    "gap": 16
  },
  "colors": [
    { "role": "background", "rgba": [255, 255, 255, 1], "cssVar": "--color-surface" }
  ],
  "typography": [
    { "role": "heading", "fontFamily": "Hanken Grotesk", "fontSize": 16, "fontWeight": 700 }
  ]
}
```

---

## Configuration Schema

### `ui-visual-testing.json` Lookup Order

1. `{componentDir}/ui-visual-testing.json` — co-located with the component
2. `{projectRoot}/ui-visual-testing.json` — project-wide fallback

**Location:** `orchestration/src/schemas/ui-visual-testing.schema.ts`

```typescript
export const UIVisualTestingConfigSchema = z.object({
  $schema: z.string().optional(),
  figma: z.object({
    fileKey: z.string().optional(),
    accessMethod: z.enum(['mcp', 'token', 'manual']).optional(),
  }).optional(),
  thresholds: z.object({
    figma: z.number().min(0).max(100).default(2),
    regression: z.number().min(0).max(100).default(5),
  }).default({ figma: 2, regression: 5 }),
  maxIterations: z.number().min(1).max(10).default(3),
  screens: z.array(z.object({
    label: z.string().min(1).max(100),
    figmaNodeId: z.string().optional(),
    route: z.string().min(1),
    viewport: z.object({
      width: z.number().min(320).max(3840),
      height: z.number().min(240).max(2160),
    }),
    captureSelector: z.string().optional(),
    waitForSelector: z.string().optional(),
    delay: z.number().min(0).max(30000).optional(),
    modes: z.array(z.enum(['figma', 'screenshot'])).default(['figma', 'screenshot']),
  })).min(1),
});
```

### Example Configuration

```json
{
  "$schema": "https://qubika-agentic-framework/schemas/ui-visual-testing.schema.json",
  "figma": { "fileKey": "kIL8VilTn17FQcjchmCj4o" },
  "thresholds": { "figma": 2, "regression": 5 },
  "maxIterations": 3,
  "screens": [
    {
      "label": "Set Password – Desktop",
      "figmaNodeId": "191-19365",
      "route": "/set-password?token=valid-test-token",
      "viewport": { "width": 1440, "height": 900 },
      "modes": ["figma", "screenshot"]
    },
    {
      "label": "Dashboard Overview",
      "route": "/dashboard",
      "viewport": { "width": 1440, "height": 900 },
      "captureSelector": "#main-content",
      "waitForSelector": "[data-loaded='true']",
      "delay": 1000,
      "modes": ["screenshot"]
    }
  ]
}
```

---

## Artifact Storage

All visual testing artifacts are stored under `.claude-tmp/ui-validation/{ticketKey}/`.

```
.claude-tmp/ui-validation/{ticketKey}/
├── figma/
│   ├── {label}.png                      # Figma-exported frame image (2x)
│   ├── {label}-constraints.json         # Structured design constraints
│   └── design-context.md               # Human-readable design summary
├── before/
│   └── {label}-{viewport}.png           # Screenshot mode: before snapshots
├── after/
│   └── {label}-{viewport}.png           # Both modes: actual implementation
├── diffs/
│   ├── {label}-figma-diff.png           # Figma mode: diff highlight image
│   ├── {label}-regression-diff.png      # Screenshot mode: diff highlight image
│   └── visual-diff-report.json          # Combined results from both modes
└── iterations/
    └── iter-{N}/
        ├── fixes.json                   # Fix plan from visual-verifier agent
        └── re-capture/
            └── {label}-{viewport}.png   # Re-captured screenshots after fixes
```

### `visual-diff-report.json` Structure

```json
{
  "ticketKey": "DOP-207",
  "timestamp": "2026-03-25T14:30:00Z",
  "modes": {
    "figma": {
      "active": true,
      "threshold": 2,
      "comparisons": [
        {
          "label": "Set Password – Desktop",
          "viewport": "1440x900",
          "diffPixels": 1200,
          "totalPixels": 1296000,
          "diffPercent": 0.09,
          "passed": true,
          "diffImage": "diffs/set-password-desktop-figma-diff.png"
        }
      ],
      "overallPassed": true
    },
    "screenshot": {
      "active": true,
      "threshold": 5,
      "comparisons": [
        {
          "label": "Set Password – Desktop",
          "viewport": "1440x900",
          "diffPixels": 0,
          "totalPixels": 1296000,
          "diffPercent": 0,
          "passed": true
        }
      ],
      "overallPassed": true
    }
  },
  "overallVerdict": "PASS",
  "iterationsUsed": 1
}
```

---

## Visual-Verifier Agent Dual-Mode

**File:** `agents/templates/visual-verifier.template.md`

### Template Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `{{VISUAL_MODE}}` | `figma`, `screenshot`, `both` | Which comparison mode(s) are active |
| `{{FIGMA_IMAGES_PATH}}` | Directory path | Location of Figma-exported PNGs |
| `{{FIGMA_CONSTRAINTS}}` | JSON string | Structured design constraints |
| `{{DIFF_THRESHOLD}}` | Number | Pass threshold percentage |
| `{{EXPECTED_IMAGES}}` | Comma-separated paths | Figma exports or before-screenshots |
| `{{ACTUAL_IMAGES}}` | Comma-separated paths | Current implementation screenshots |

### Mode-Specific Analysis

**Figma Mode** — checks design token fidelity, typography accuracy, spacing/layout, dimension accuracy, component structure.

**Screenshot Mode** — checks regression detection, layout breakage, style regression, responsive issues.

### Output Schema

```json
{
  "mode": "figma | screenshot | both",
  "fixes": [
    {
      "mode": "figma",
      "fileName": "screenshot-name.png",
      "diffPercent": 8.5,
      "severity": "major",
      "problems": [
        {
          "issue": "Padding-left is 16px, Figma spec is 32px",
          "constraint": { "property": "paddingLeft", "expected": 32, "actual": 16 },
          "affectedFile": "src/widgets/overview-dashboard/ui/OverviewDashboard.tsx",
          "fix": {
            "description": "Change padding class from p-4 to p-8",
            "before": "<div className=\"p-4\">",
            "after": "<div className=\"p-8\">",
            "lineNumbers": "24-26"
          }
        }
      ]
    }
  ],
  "implementationPlan": [
    "1. Fix padding in OverviewDashboard.tsx line 24",
    "2. Fix text color in SectionHeader.tsx line 12"
  ]
}
```

---

## Screenshot Service Improvements

The following improvements were made to `orchestration/src/services/implement-ticket/screenshot.service.ts` as part of this pipeline.

### Bug Fixes

**P0 — Configurable pass percentage:** The `passPercentage` parameter was hardcoded to `5.0` regardless of the caller's setting. Fixed via `CompareOptions` union type — callers now pass `{ pixelThreshold, passPercentage, includeAA }`.

**P0 — Anti-aliasing:** Added `includeAA: false` to pixelmatch. Expected false-positive reduction: **30-60%**.

### New Methods

**`waitForPageReady(page, options)`** — Replaces fixed 2s wait. Waits for `networkidle`/`domcontentloaded`, optional CSS selector, optional delay.

**`captureWithConfig(page, baseUrl, screenEntry, prefix)`** — Config-driven capture using `ScreenEntry` from `ui-visual-testing.json`.

**`applyIgnoreRegions(img1Data, img2Data, width, regions)`** — Paints ignore regions with identical pixels on both images before comparison, eliminating dynamic content false positives.

### Priority Table

| Priority | Improvement | Impact |
|----------|-------------|--------|
| **P0** | Fix threshold/passPercentage bug | Configurable thresholds now work |
| **P0** | Add `includeAA: false` | ~30-60% false positive reduction |
| **P1** | Configurable wait strategy | Reliability — no arbitrary 2s waits |
| **P2** | Region masking | Eliminates dynamic content false positives |
