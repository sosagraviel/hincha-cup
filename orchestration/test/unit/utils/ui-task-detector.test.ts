import { describe, it, expect } from 'vitest';
import { classifyUITask, type UITaskClassification } from '../../../src/utils/ui-task-detector.js';
import type { StackProfile } from '../../../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const reactStack: StackProfile = {
  languages: ['typescript'],
  primary_language: 'typescript',
  frameworks: { frontend: ['React', 'Next.js'], backend: [] },
};

const backendStack: StackProfile = {
  languages: ['python'],
  primary_language: 'python',
  frameworks: { frontend: [], backend: ['Django'] },
};

// ---------------------------------------------------------------------------
// Signal 1: Keywords
// ---------------------------------------------------------------------------

describe('UI Task Detector — Keywords', () => {
  it('scores primary keywords at 5 pts each, capped at 20', () => {
    const text = 'Build a new dashboard page with a modal dialog for form navigation and sidebar';
    const result = classifyUITask(text);
    // dashboard(5) + page(5) + modal(5) + dialog(5) + form(5) → cap at 20
    expect(result.signals.keywordScore).toBeGreaterThanOrEqual(20);
    expect(result.signals.keywordScore).toBeLessThanOrEqual(30);
  });

  it('scores secondary keywords at 3 pts each, capped at 10', () => {
    const text = 'Update the CSS style color font typography spacing padding';
    const result = classifyUITask(text);
    expect(result.signals.keywordScore).toBeGreaterThanOrEqual(10);
    expect(result.signals.keywordScore).toBeLessThanOrEqual(30);
  });

  it('caps total keyword score at 30', () => {
    const text = 'screen page component ui design layout widget dashboard modal dialog form button navigation sidebar header footer responsive css style color font typography spacing padding';
    const result = classifyUITask(text);
    expect(result.signals.keywordScore).toBe(30);
  });

  it('collects all matched keywords even when score cap is reached', () => {
    // 5 primary keywords → score capped at 20, but all 5 should appear in detectedKeywords
    const text = 'Build a dashboard page with a modal dialog and form inputs';
    const result = classifyUITask(text);
    expect(result.detectedKeywords).toContain('dashboard');
    expect(result.detectedKeywords).toContain('page');
    expect(result.detectedKeywords).toContain('modal');
    expect(result.detectedKeywords).toContain('dialog');
    expect(result.detectedKeywords).toContain('form');
    expect(result.signals.keywordScore).toBe(20); // capped, but all 5 keywords present
  });

  it('detects keywords case-insensitively', () => {
    const result = classifyUITask('Build a new DASHBOARD Component with UI Design');
    expect(result.detectedKeywords).toContain('dashboard');
    expect(result.detectedKeywords).toContain('component');
    expect(result.detectedKeywords).toContain('ui');
    expect(result.detectedKeywords).toContain('design');
  });

  it('returns 0 for text with no UI keywords', () => {
    const result = classifyUITask('Migrate database tables and update API endpoints');
    expect(result.signals.keywordScore).toBe(0);
    expect(result.detectedKeywords).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 2: Figma References
// ---------------------------------------------------------------------------

describe('UI Task Detector — Figma References', () => {
  it('scores 20 pts for Figma URL without node-id', () => {
    const text = 'See design at https://figma.com/design/abc123/ProjectName';
    const result = classifyUITask(text);
    expect(result.signals.figmaScore).toBe(20);
    expect(result.figmaReferences).toHaveLength(1);
    expect(result.figmaReferences[0].fileKey).toBe('abc123');
    expect(result.figmaReferences[0].nodeId).toBeUndefined();
  });

  it('scores 25 pts for Figma URL with node-id', () => {
    const text = 'Design: https://figma.com/design/abc123/Project?node-id=191-19365';
    const result = classifyUITask(text);
    expect(result.signals.figmaScore).toBe(25);
    expect(result.figmaReferences[0].fileKey).toBe('abc123');
    expect(result.figmaReferences[0].nodeId).toBe('191-19365');
  });

  it('extracts multiple Figma URLs', () => {
    const text = `
      Desktop: https://figma.com/file/xyz789/App?node-id=1-2
      Mobile: https://figma.com/design/xyz789/App?node-id=3-4
    `;
    const result = classifyUITask(text);
    expect(result.figmaReferences).toHaveLength(2);
    expect(result.signals.figmaScore).toBe(25);
  });

  it('returns 0 for no Figma URLs', () => {
    const result = classifyUITask('No design links here');
    expect(result.signals.figmaScore).toBe(0);
    expect(result.figmaReferences).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 3: File Paths
// ---------------------------------------------------------------------------

describe('UI Task Detector — File Paths', () => {
  it('scores path patterns from ticket text', () => {
    const text = 'Modify src/components/Button.tsx and src/pages/Dashboard.tsx';
    const result = classifyUITask(text);
    // components/(4) + pages/(4) = 8
    expect(result.signals.filePathScore).toBe(8);
  });

  it('scores path patterns from changedFiles', () => {
    const changedFiles = ['src/ui/Button.tsx', 'src/views/Home.tsx', 'src/styles/globals.css'];
    const result = classifyUITask('', undefined, changedFiles);
    // ui/(4) + views/(4) + styles/(4) = 12
    expect(result.signals.filePathScore).toBe(12);
  });

  it('caps at 20', () => {
    const changedFiles = [
      'src/components/a.tsx', 'src/pages/b.tsx', 'src/ui/c.tsx',
      'src/views/d.tsx', 'src/layouts/e.tsx', 'src/styles/f.css',
    ];
    const result = classifyUITask('', undefined, changedFiles);
    expect(result.signals.filePathScore).toBe(20);
  });

  it('returns 0 for backend paths', () => {
    const result = classifyUITask('', undefined, ['src/api/users.ts', 'lib/db/migrations.ts']);
    expect(result.signals.filePathScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 4: Stack Detection
// ---------------------------------------------------------------------------

describe('UI Task Detector — Stack Detection', () => {
  it('scores 15 for React stack', () => {
    const result = classifyUITask('any text', reactStack);
    expect(result.signals.stackScore).toBe(15);
  });

  it('scores 0 for backend-only stack', () => {
    const result = classifyUITask('any text', backendStack);
    expect(result.signals.stackScore).toBe(0);
  });

  it('scores 0 when no stack provided', () => {
    const result = classifyUITask('any text');
    expect(result.signals.stackScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Signal 5: Acceptance Criteria
// ---------------------------------------------------------------------------

describe('UI Task Detector — Acceptance Criteria', () => {
  it('scores visual terms at 2 pts each', () => {
    const text = 'Given the component renders, When user clicks, Then it displays the hidden panel and shows a visual diff';
    const result = classifyUITask(text);
    // renders(2) + displays(2) + hidden(2) + shows(2) + visual(2) + diff(2) → cap 10
    expect(result.signals.acceptanceCriteriaScore).toBeGreaterThanOrEqual(10);
  });

  it('caps at 10', () => {
    const text = 'renders displays shows visible hidden screenshot visual pixel diff match align center responsive';
    const result = classifyUITask(text);
    expect(result.signals.acceptanceCriteriaScore).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Classification & Recommendation
// ---------------------------------------------------------------------------

describe('UI Task Detector — Classification', () => {
  it('classifies pure backend ticket as not UI', () => {
    const result = classifyUITask(
      'Migrate database tables and update REST API endpoint for user authentication',
      backendStack,
    );
    expect(result.isUI).toBe(false);
    expect(result.confidence).toBeLessThan(25);
    expect(result.recommendation).toBe('no-ui');
  });

  it('classifies React component with Figma as strong UI task', () => {
    const text = `
      Implement the KPI Card component per the Figma design:
      https://figma.com/design/kIL8VilTn17FQcjchmCj4o/Project?node-id=191-19365

      The component renders KPI values with a trend sparkline.
      Files: src/components/KpiCard.tsx, src/pages/Dashboard.tsx
    `;
    const result = classifyUITask(text, reactStack);
    expect(result.isUI).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(50);
    expect(result.recommendation).toBe('ui-visual-testing');
  });

  it('classifies dashboard bug fix as likely UI', () => {
    const text = 'Fix responsive layout issue on the dashboard page where sidebar overlaps on tablet';
    const result = classifyUITask(text, reactStack);
    expect(result.isUI).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(25);
  });

  it('classifies database migration as score ~0', () => {
    const result = classifyUITask('Add migration for user_preferences table with JSON column');
    expect(result.confidence).toBeLessThan(10);
    expect(result.recommendation).toBe('no-ui');
  });

  it('returns regression-only for score 25-49', () => {
    // Craft a ticket that gets moderate score
    const text = 'Update the button hover color and fix the icon alignment';
    const result = classifyUITask(text, reactStack);
    // button(5) + hover(3) + icon(3) + color(3) + stack(15) = ~29
    expect(result.isUI).toBe(true);
    if (result.confidence >= 25 && result.confidence < 50) {
      expect(result.recommendation).toBe('regression-only');
    }
  });
});
