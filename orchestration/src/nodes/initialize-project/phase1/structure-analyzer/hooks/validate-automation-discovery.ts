/**
 * Stop-hook validator for the structure analyzer's automation-discovery
 * responsibility. The analyzer must discover the project's automation surface
 * (Make / Just / Task / setup scripts / devcontainer hooks) and emit it under
 * `findings.automation`. Skipping it leaves every downstream consumer
 * (catalog builder, synthesizer, wiki, skills) without the wrapper signal.
 *
 * Checks the project filesystem (via the Stop hook's `cwd` field) for
 * canonical wrapper files and rejects the analyzer output when those files
 * exist but the matching bucket is empty / missing.
 *
 * Stack-agnostic: generic file-presence checks at the repo root only.
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { formatValidationError } from '../../../shared/validation-codes/index.js';

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
  /** Paths relative to the project root. */
  candidates: string[];
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
 * @param cwd  - The project root path. When undefined, the validator skips
 *               the filesystem check and returns no violations.
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
 * Format violations as agent-facing retry feedback — one compressed
 * `VALIDATION_E010_*` line per violation. The long-form repair guidance
 * lives in the codes table (`formatValidationErrorLong`) for debug
 * rendering.
 */
export function formatAutomationDiscoveryViolations(
  violations: AutomationDiscoveryViolation[],
): string[] {
  if (violations.length === 0) return [];
  return violations.map((v) =>
    formatValidationError('E010_automation_discovery_gap', {
      bucket: v.bucket,
      violations: `${v.files.join(', ')} → ${v.message}`,
    }),
  );
}

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
  const fs = require('fs') as typeof import('fs');
  return fs.readFileSync(p, 'utf-8');
}
