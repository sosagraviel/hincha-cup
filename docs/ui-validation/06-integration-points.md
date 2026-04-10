# Integration Points

How the UI Validation Pipeline connects to existing framework workflows.

---

## `implement-ticket` Phase 6 — Visual Verification

**File:** `orchestration/src/nodes/implement-ticket/phase6-visual.node.ts`

### Decision Flow

```
Phase 5 (Testing) complete
    │
    ▼
1. Check for ui-visual-testing.json
   ├─> In changed file directories (from Phase 4 output)
   └─> In project root
    │
    ├─> NOT FOUND
    │   ├─> Run UI Task Detector against ticket content
    │   │   ├─> isUI == true → ASK USER to create config
    │   │   │   ├─> User says yes → auto-generate from ticket context → proceed
    │   │   │   └─> User says no → skip visual verification
    │   │   └─> isUI == false → skip visual verification
    │   └─> Continue to Phase 7
    │
    └─> FOUND → proceed to mode detection
         │
         ▼
2. Determine active modes:

   FIGMA MODE — activated by ANY of:
   a. Config has figmaNodeIds in screen entries
   b. Ticket body contains Figma URLs (figma.com/design/...)
   c. Ticket markdown frontmatter has figma: field
   d. Acceptance criteria reference Figma designs
   e. Ticket metadata from Jira contains Figma links

   Note: Covers tickets from ANY source (--from-jira, --from-markdown, raw input)
   If Figma refs found in ticket but NOT in config → offer to update config

   SCREENSHOT MODE — activated by:
   a. Before snapshots exist (captured in Phase 3)
   b. Config entry has modes: ["screenshot"]
   c. Route already exists and is navigable
         │
         ▼
3. Invoke figma-design-fetcher (if Figma mode active)
   └─> Cascading access: MCP → Token → Setup → Manual → Skip
         │
         ▼
4. Delegate to ui-visual-testing skill
   └─> Passes: config, mode, ticket context, design constraints
         │
         ▼
5. Process verdict
   ├─> PASS → continue to Phase 7
   ├─> FAIL (interactive) → pause, ask engineer whether to proceed
   ├─> FAIL (autonomous) → include failure in PR description, continue
   └─> SKIP → log reason, continue to Phase 7
```

### Backward Compatibility

The existing before/after comparison logic remains **completely untouched** as the fallback path. The new pipeline only activates when `ui-visual-testing.json` is found OR the user explicitly opts in.

---

## `create-sdd-ticket` Phase 3 — Gap Detection

Strategy 5 (UI Task Detection) is added alongside the existing 4 strategies. See [Pillar 2](./03-pillar-2-ticket-creation.md) for full details.

---

## `implement-ticket` Phase 5 — UI Test Level Orchestration

Phase 5 (Testing) already runs unit, integration, and E2E tests via the TestOrchestrator. The UI testing pipeline extends this:

```
Phase 5 runs →
  1. TestOrchestrator runs existing tests (unchanged)
  2. If UI task detected:
     a. Check ticket DoD for required test levels
     b. If levels not specified → ask user (decision matrix as suggestion)
     c. For each required level:
        - Unit: verify tests exist + pass + coverage >= 80%
        - Component (CT): verify CT tests exist + pass
        - E2E: verify E2E tests exist + pass
     d. If tests missing for a required level → flag for implementer to generate
  3. Coverage gate: 80% minimum (existing)
```

---

## `implement-ticket` Phase 3 — Before Screenshots

Phase 3 (Environment Setup) already captures "before" screenshots when visual verification is flagged in the test plan. The pipeline reuses these as the baseline for screenshot mode. If Phase 3 didn't capture them, the `ui-visual-testing` skill captures them on-demand before implementation begins.

---

## `implement-ticket` Phase 4 — Design Context Feed

When Figma mode is active, the extracted design constraints (`design-context.md` and `{label}-constraints.json`) are passed to the implementer agent as additional context. This gives the implementer exact specifications (colors, dimensions, typography) to follow during code generation, reducing the need for visual fix iterations.
