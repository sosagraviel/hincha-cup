import type { StackProfile } from '../schemas/index.js';

/**
 * UI Task Detector
 *
 * Deterministic classifier that scores whether a task involves UI work.
 * Produces a confidence score (0-100) and an isUI boolean.
 * Consumed by create-sdd-ticket, implement-ticket Phase 6, and standalone skills.
 *
 * Five signal categories, each with a weighted cap:
 *   1. Ticket Content Keywords (max 30)
 *   2. Figma References (max 25)
 *   3. File Path Signals (max 20)
 *   4. Stack Detection (max 15)
 *   5. Acceptance Criteria Visual References (max 10)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIMARY_UI_KEYWORDS = [
  'screen', 'page', 'component', 'ui', 'design', 'layout', 'widget',
  'dashboard', 'modal', 'dialog', 'form', 'button', 'navigation',
  'sidebar', 'header', 'footer', 'responsive', 'mobile', 'tablet', 'desktop',
] as const;

const SECONDARY_UI_KEYWORDS = [
  'css', 'style', 'color', 'font', 'typography', 'spacing', 'padding',
  'margin', 'border', 'animation', 'transition', 'hover', 'icon', 'image',
  'figma', 'mockup', 'wireframe', 'pixel',
] as const;

const UI_FILE_PATH_PATTERNS = [
  'components/', 'pages/', 'ui/', 'views/', 'layouts/',
  'styles/', 'css/', 'scss/', 'templates/',
] as const;

const FRONTEND_FRAMEWORKS = [
  'react', 'vue', 'angular', 'next.js', 'nuxt', 'svelte',
] as const;

const VISUAL_AC_TERMS = [
  'renders', 'displays', 'shows', 'visible', 'hidden', 'screenshot',
  'visual', 'pixel', 'diff', 'match', 'align', 'center', 'responsive',
] as const;

const FIGMA_URL_PATTERN = /https?:\/\/(?:www\.)?figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)(?:\/[^?\s]*)?(?:\?[^?\s]*node-id=([0-9]+-[0-9]+))?/gi;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface FigmaReference {
  url: string;
  fileKey: string;
  nodeId?: string;
}

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

// ---------------------------------------------------------------------------
// Signal Scoring Functions
// ---------------------------------------------------------------------------

/**
 * Signal 1: Ticket Content Keywords (max 30 points)
 * Primary keywords: 5 pts each, cap 20
 * Secondary keywords: 3 pts each, cap 10
 */
function scoreKeywords(text: string): { score: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];

  let primaryScore = 0;
  for (const kw of PRIMARY_UI_KEYWORDS) {
    if (lower.includes(kw)) {
      matched.push(kw);
      primaryScore += 5;
    }
  }
  primaryScore = Math.min(primaryScore, 20);

  let secondaryScore = 0;
  for (const kw of SECONDARY_UI_KEYWORDS) {
    if (lower.includes(kw)) {
      matched.push(kw);
      secondaryScore += 3;
    }
  }
  secondaryScore = Math.min(secondaryScore, 10);

  return { score: Math.min(primaryScore + secondaryScore, 30), matched };
}

/**
 * Signal 2: Figma References (max 25 points)
 * Figma URL presence: 20 pts
 * node-id parameter: +5 bonus
 */
function scoreFigmaReferences(text: string): { score: number; references: FigmaReference[] } {
  const references: FigmaReference[] = [];
  let hasNodeId = false;

  // Reset lastIndex for the global regex
  FIGMA_URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FIGMA_URL_PATTERN.exec(text)) !== null) {
    const ref: FigmaReference = {
      url: match[0],
      fileKey: match[1],
    };
    if (match[2]) {
      ref.nodeId = match[2];
      hasNodeId = true;
    }
    references.push(ref);
  }

  if (references.length === 0) {
    return { score: 0, references };
  }

  let score = 20;
  if (hasNodeId) {
    score += 5;
  }

  return { score: Math.min(score, 25), references };
}

/**
 * Signal 3: File Path Signals (max 20 points)
 * 4 points per matching path pattern, capped at 20
 */
function scoreFilePaths(text: string, changedFiles?: string[]): number {
  const lower = text.toLowerCase();
  const filePaths = changedFiles?.map(f => f.toLowerCase()) ?? [];
  let score = 0;

  for (const pattern of UI_FILE_PATH_PATTERNS) {
    if (lower.includes(pattern) || filePaths.some(f => f.includes(pattern))) {
      score += 4;
      if (score >= 20) break;
    }
  }

  return Math.min(score, 20);
}

/**
 * Signal 4: Stack Detection (max 15 points)
 * 15 points if any frontend framework detected, 0 otherwise
 */
function scoreStack(stackProfile?: StackProfile): number {
  if (!stackProfile) return 0;

  const frontendFrameworks = stackProfile.frameworks?.frontend ?? [];
  const hasFrontend = frontendFrameworks.some(fw =>
    FRONTEND_FRAMEWORKS.some(known =>
      fw.toLowerCase().includes(known.toLowerCase())
    )
  );

  return hasFrontend ? 15 : 0;
}

/**
 * Signal 5: Acceptance Criteria Visual References (max 10 points)
 * 2 points per matching term, capped at 10
 */
function scoreAcceptanceCriteria(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  for (const term of VISUAL_AC_TERMS) {
    if (lower.includes(term)) {
      score += 2;
    }
  }

  return Math.min(score, 10);
}

// ---------------------------------------------------------------------------
// Main Classifier
// ---------------------------------------------------------------------------

/**
 * Classify whether a task involves UI work.
 *
 * @param ticketContent - Full ticket text (title, description, AC, technical context)
 * @param stackProfile  - Project stack profile (optional)
 * @param changedFiles  - List of changed/affected file paths (optional)
 * @returns Classification result with score, signals, and recommendation
 */
export function classifyUITask(
  ticketContent: string,
  stackProfile?: StackProfile,
  changedFiles?: string[],
): UITaskClassification {
  const keywords = scoreKeywords(ticketContent);
  const figma = scoreFigmaReferences(ticketContent);
  const filePathScore = scoreFilePaths(ticketContent, changedFiles);
  const stackScore = scoreStack(stackProfile);
  const acScore = scoreAcceptanceCriteria(ticketContent);

  const confidence = keywords.score + figma.score + filePathScore + stackScore + acScore;

  let recommendation: UITaskClassification['recommendation'];
  if (confidence >= 50) {
    recommendation = 'ui-visual-testing';
  } else if (confidence >= 25) {
    recommendation = 'regression-only';
  } else {
    recommendation = 'no-ui';
  }

  return {
    isUI: confidence >= 25,
    confidence,
    signals: {
      keywordScore: keywords.score,
      figmaScore: figma.score,
      filePathScore,
      stackScore,
      acceptanceCriteriaScore: acScore,
    },
    figmaReferences: figma.references,
    detectedKeywords: keywords.matched,
    recommendation,
  };
}
