/**
 * Plan 16 §C.4 — hard Stop-hook validator for the structure
 * analyzer's automation-discovery responsibility.
 *
 * The structure analyzer is supposed to discover the project's
 * automation surface (Make / Just / Task / setup scripts /
 * devcontainer hooks) and emit it under `findings.automation`.
 * If it skips this — and the gira 2026-05-06 run showed it
 * frequently does — every downstream consumer (catalog builder,
 * synthesizer, wiki, skills) loses the wrapper signal and the
 * generated CLAUDE.md falls back to package-manager commands
 * that may not boot dependent services.
 *
 * This validator checks the project filesystem (via the Stop
 * hook's `cwd` field) for canonical wrapper files and rejects
 * the analyzer output when those files exist but
 * `findings.automation` is empty / missing for that bucket.
 *
 * Stack-agnostic: only generic file-presence checks at the repo
 * root. No language assumptions.
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';

export interface AutomationDiscoveryViolation {
  bucket:
    | 'makefiles'
    | 'justfiles'
    | 'taskfiles'
    | 'shell_scripts'
    | 'devcontainer'
    | 'readme_run_sections';
  files: string[];
  message: string;
}

interface ProbeSpec {
  bucket: AutomationDiscoveryViolation['bucket'];
  candidates: string[]; // paths relative to project root
  /** Friendly label used in the violation message. */
  label: string;
}

const PROBES: ProbeSpec[] = [
  {
    bucket: 'makefiles',
    candidates: ['Makefile', 'GNUmakefile', 'makefile'],
    label: 'Makefile',
  },
  {
    bucket: 'justfiles',
    candidates: ['Justfile', 'justfile', '.justfile'],
    label: 'Justfile',
  },
  {
    bucket: 'taskfiles',
    candidates: ['Taskfile.yml', 'Taskfile.yaml', 'Taskfile.dist.yml'],
    label: 'Taskfile',
  },
  {
    bucket: 'shell_scripts',
    candidates: [
      'scripts/setup',
      'scripts/bootstrap',
      'bin/setup',
      'bin/dev',
      'setup.sh',
      'bootstrap.sh',
      'dev.sh',
    ],
    label: 'setup-style shell script',
  },
  {
    bucket: 'devcontainer',
    candidates: ['.devcontainer/devcontainer.json', '.devcontainer.json'],
    label: 'devcontainer.json',
  },
];

/**
 * Run the automation-discovery hard validator.
 *
 * @param data - The structure analyzer's parsed JSON output.
 * @param cwd  - The project root path. When undefined (single-
 *               analyzer replay), the validator skips the
 *               filesystem check and returns no violations —
 *               better than failing open with a misleading error.
 * @returns Array of violations. Empty array = valid.
 */
export function detectAutomationDiscoveryViolations(
  data: unknown,
  cwd: string | undefined,
): AutomationDiscoveryViolation[] {
  if (!cwd || cwd.length === 0) return [];
  if (!isObject(data)) return [];

  const findings = isObject(data.findings) ? data.findings : {};
  const automation = isObject(findings.automation) ? findings.automation : {};

  const violations: AutomationDiscoveryViolation[] = [];

  for (const probe of PROBES) {
    const found = probe.candidates.filter((p) => fileExists(join(cwd, p)));
    if (found.length === 0) continue;

    const populated = isBucketPopulated(automation, probe.bucket);
    if (!populated) {
      violations.push({
        bucket: probe.bucket,
        files: found,
        message:
          `${probe.label}(s) exist at the project root (${found.join(', ')}) ` +
          `but \`findings.automation.${probe.bucket}\` is empty or missing. ` +
          `Read each file and emit its targets / recipes / tasks / commands.`,
      });
    }
  }

  // README run-sections — the heading-match check happens content-side,
  // not by file presence alone. Only flag when README.md exists AND
  // contains at least one canonical run-heading AND `readme_run_sections`
  // is empty.
  const readmePath = findReadmePath(cwd);
  if (readmePath) {
    const headingsPresent = readmeHasRunHeadings(readmePath);
    if (headingsPresent.length > 0) {
      const sections = findings.readme_run_sections;
      if (!Array.isArray(sections) || sections.length === 0) {
        violations.push({
          bucket: 'readme_run_sections',
          files: [readmePath, ...headingsPresent],
          message:
            `README.md contains canonical run-section headings ` +
            `(${headingsPresent.join(', ')}) but ` +
            `\`findings.readme_run_sections\` is empty or missing. Extract ` +
            `each section verbatim with \`heading\`, \`body\`, and ` +
            `\`fenced_blocks\`.`,
        });
      }
    }
  }

  return violations;
}

/**
 * Format violations as agent-facing retry feedback. Returns a
 * `string[]` of lines so the caller can append to its existing
 * error array.
 */
export function formatAutomationDiscoveryViolations(
  violations: AutomationDiscoveryViolation[],
): string[] {
  if (violations.length === 0) return [];
  const out: string[] = [
    'AUTOMATION DISCOVERY GAP',
    '',
    '🔴 WHAT WENT WRONG:',
    "   The structure analyzer is required to discover the project's",
    '   automation surface (Make / Just / Task / setup scripts / devcontainer)',
    '   under `findings.automation`. The Stop hook checked the filesystem',
    '   and found wrapper files that your output does NOT represent.',
    '',
    '🟡 SPECIFIC VIOLATIONS:',
  ];
  for (const v of violations) {
    out.push(`   • [${v.bucket}] ${v.files.join(', ')}`, `       ${v.message}`);
  }
  out.push(
    '',
    '🟢 HOW TO FIX:',
    '   Re-Read each file listed above and re-emit your JSON with the',
    '   `findings.automation.<bucket>` populated. For Make / Just / Task',
    '   targets, capture { name, group?, description? } per target with',
    '   the description copied verbatim from the source comment. For',
    '   shell scripts, set `purpose` to one of setup / bootstrap / dev /',
    '   test / reset / unknown. For devcontainer hooks, copy',
    '   `postCreateCommand` and `postStartCommand` exactly. For README',
    '   run-sections, capture `path`, `heading` verbatim, `body` raw',
    '   markdown, and `fenced_blocks` (each fenced code block content).',
  );
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function isBucketPopulated(
  automation: Record<string, unknown>,
  bucket: AutomationDiscoveryViolation['bucket'],
): boolean {
  if (bucket === 'devcontainer') {
    const dc = automation.devcontainer;
    if (!isObject(dc)) return false;
    return typeof dc.postCreateCommand === 'string' || typeof dc.postStartCommand === 'string';
  }
  // makefiles / justfiles / taskfiles / shell_scripts → arrays
  const v = automation[bucket];
  return Array.isArray(v) && v.length > 0;
}

const README_FILENAMES = ['README.md', 'README.MD', 'Readme.md', 'readme.md', 'README.markdown'];

function findReadmePath(cwd: string): string | null {
  for (const name of README_FILENAMES) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}

const README_RUN_HEADINGS = [
  /^##\s+getting\s+started\b/im,
  /^##\s+setup\b/im,
  /^##\s+installation\b/im,
  /^##\s+quickstart\b/im,
  /^##\s+quick\s+start\b/im,
  /^##\s+running\s+locally\b/im,
  /^##\s+local\s+development\b/im,
  /^##\s+development\b/im,
  /^##\s+how\s+to\s+run\b/im,
];

function readmeHasRunHeadings(path: string): string[] {
  let body: string;
  try {
    body = readFileSafe(path);
  } catch {
    return [];
  }
  if (!body) return [];
  const matches: string[] = [];
  for (const re of README_RUN_HEADINGS) {
    const m = body.match(re);
    if (m) matches.push(m[0].trim());
  }
  return matches;
}

function readFileSafe(p: string): string {
  // Inline import to keep this module side-effect-light; readFileSync
  // is fine here since the hook is a short-lived process.
  const fs = require('fs') as typeof import('fs');
  return fs.readFileSync(p, 'utf-8');
}
