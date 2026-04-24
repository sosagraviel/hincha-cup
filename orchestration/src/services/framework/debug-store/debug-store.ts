import path from 'path';
import { mkdir, readFile, rm, writeFile, readdir, stat, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../../../utils/logger.js';
import { resolveTempPath } from '../../../utils/provider-paths.js';
import { Provider } from '../../../providers/types.js';
import { getActiveProvider } from '../../../utils/provider-paths.js';
import { composeRunFolderName } from './run-id.js';
import type {
  AttemptCoords,
  AttemptMeta,
  PhaseSlot,
  RunContext,
  RunManifest,
  ValidationErrorsFile,
  ValidationFailureEntry,
} from './types.js';

const MAX_STREAM_BYTES = 4 * 1024 * 1024; // 4 MB per stream (matches legacy cap)

function truncate(s: string | undefined, cap = MAX_STREAM_BYTES): string | undefined {
  if (s === undefined) return undefined;
  if (s.length <= cap) return s;
  return s.slice(0, cap) + `\n\n…[truncated ${s.length - cap} bytes]`;
}

function activeProviderTag(): 'claude' | 'codex' {
  return getActiveProvider() === Provider.CLAUDE ? 'claude' : 'codex';
}

/**
 * Debug artifact store — one instance per workflow run.
 *
 * Layout (rooted at projectPath):
 *
 *   .<provider>-temp/
 *     <workflow>/
 *       debug/
 *         runs/
 *           <run-folder>/
 *             run.json
 *             <phaseId>/
 *               <agentName>/
 *                 attempt-<N>/
 *                   <sessionId>/
 *                     ...artifacts
 *         latest -> runs/<run-folder>   (symlink, best-effort)
 *
 * Artifacts inside the attempt-session folder:
 *
 *   meta.json                 — AttemptMeta
 *   prompt-input.txt          — raw input prompt
 *   prompt-resolved.md        — fully-rendered prompt (agent body + input)
 *   agent-file.md             — snapshot of the agent template
 *   settings.json             — resolved Claude settings (if any)
 *   output.raw.txt            — exact model output bytes
 *   output.<ext>              — parsed output (json/md/txt) when known
 *   output-schema.json        — schema used for validation (if any)
 *   stdout.log                — subprocess stdout
 *   stderr.log                — subprocess stderr
 *   error.txt                 — short failure summary (failure only)
 *   validation-errors.json    — structured validation errors (failure only)
 *   transcript.jsonl          — native Claude JSONL or Codex rollout JSONL
 *   transcript.html           — self-contained rendered view
 *   events.jsonl              — normalized cross-provider event stream
 *
 * The store is the *only* code that knows about this layout; everything else
 * goes through `beginAttempt()` and the returned AttemptWriter.
 */
export class DebugStore {
  private constructor(public readonly context: RunContext) {}

  static async create(opts: {
    projectPath: string;
    workflow: string;
    provider?: 'claude' | 'codex';
    startedAt?: Date;
  }): Promise<DebugStore> {
    const provider = opts.provider ?? activeProviderTag();
    const startedAt = opts.startedAt ?? new Date();
    const workflowRoot = resolveTempPath(opts.projectPath, opts.workflow);
    const debugRoot = path.join(workflowRoot, 'debug');
    const runFolderName = composeRunFolderName(startedAt);
    const runDir = path.join(debugRoot, 'runs', runFolderName);
    await mkdir(runDir, { recursive: true });

    const context: RunContext = {
      runId: runFolderName,
      debugRoot,
      runDir,
      workflow: opts.workflow,
      projectPath: opts.projectPath,
      provider,
      startedAt: startedAt.toISOString(),
    };
    const store = new DebugStore(context);
    await store.writeRunManifest({
      runId: context.runId,
      workflow: context.workflow,
      projectPath: context.projectPath,
      provider: context.provider,
      debug: isDebugEnabled(),
      startedAt: context.startedAt,
    });
    await store.updateLatestPointer().catch(() => undefined);
    return store;
  }

  /**
   * Open an existing run (used by `--resume` in the future).
   */
  static async open(opts: {
    projectPath: string;
    workflow: string;
    runId: string;
  }): Promise<DebugStore | null> {
    const workflowRoot = resolveTempPath(opts.projectPath, opts.workflow);
    const debugRoot = path.join(workflowRoot, 'debug');
    const runDir = path.join(debugRoot, 'runs', opts.runId);
    if (!existsSync(runDir)) return null;
    const manifestPath = path.join(runDir, 'run.json');
    let manifest: RunManifest | null = null;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as RunManifest;
    } catch {
      manifest = null;
    }
    const context: RunContext = {
      runId: opts.runId,
      debugRoot,
      runDir,
      workflow: opts.workflow,
      projectPath: opts.projectPath,
      provider: manifest?.provider ?? activeProviderTag(),
      startedAt: manifest?.startedAt ?? new Date().toISOString(),
    };
    return new DebugStore(context);
  }

  getRunContext(): RunContext {
    return this.context;
  }

  getAttemptDir(coords: AttemptCoords): string {
    return path.join(
      this.context.runDir,
      coords.phaseId,
      coords.agentName,
      `attempt-${coords.attemptNumber}`,
      coords.sessionId,
    );
  }

  async writeRunManifest(manifest: RunManifest): Promise<void> {
    const manifestPath = path.join(this.context.runDir, 'run.json');
    try {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(
        `Failed to write run manifest at ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async readRunManifest(): Promise<RunManifest | null> {
    const manifestPath = path.join(this.context.runDir, 'run.json');
    try {
      return JSON.parse(await readFile(manifestPath, 'utf-8')) as RunManifest;
    } catch {
      return null;
    }
  }

  async updateRunManifest(patch: Partial<RunManifest>): Promise<void> {
    const existing = (await this.readRunManifest()) ?? {
      runId: this.context.runId,
      workflow: this.context.workflow,
      projectPath: this.context.projectPath,
      provider: this.context.provider,
      debug: isDebugEnabled(),
      startedAt: this.context.startedAt,
    };
    await this.writeRunManifest({ ...existing, ...patch });
  }

  /**
   * Best-effort `latest` symlink inside `debug/runs/`.
   */
  async updateLatestPointer(): Promise<void> {
    const latest = path.join(this.context.debugRoot, 'runs', 'latest');
    const target = this.context.runId;
    try {
      await rm(latest, { force: true });
    } catch {
      // ignore
    }
    try {
      const { symlink } = await import('fs/promises');
      await symlink(target, latest, 'dir');
    } catch {
      // Symlinks fail on some platforms — fine, `latest` is convenience only.
    }
  }

  /**
   * Open a writer for a single attempt. The writer encapsulates the layout
   * so callers never construct paths themselves.
   */
  beginAttempt(coords: AttemptCoords): AttemptWriter {
    return new AttemptWriter(this, coords);
  }

  /**
   * Enforce retention on `debug/runs/` by removing oldest run folders beyond
   * `keep`. Returns the list of deleted folders. Never throws.
   */
  static async pruneRuns(projectPath: string, workflow: string, keep: number): Promise<string[]> {
    if (keep <= 0) return [];
    const runsDir = path.join(resolveTempPath(projectPath, workflow), 'debug', 'runs');
    if (!existsSync(runsDir)) return [];
    try {
      const entries = await readdir(runsDir, { withFileTypes: true });
      const folders = await Promise.all(
        entries
          .filter((e) => e.isDirectory() && e.name !== 'latest' && e.name.startsWith('run-'))
          .map(async (e) => {
            const full = path.join(runsDir, e.name);
            const s = await stat(full).catch(() => null);
            return { name: e.name, full, mtime: s?.mtimeMs ?? 0 };
          }),
      );
      folders.sort((a, b) => a.mtime - b.mtime); // oldest first
      const excess = folders.length - keep;
      if (excess <= 0) return [];
      const toDelete = folders.slice(0, excess);
      const deleted: string[] = [];
      for (const f of toDelete) {
        try {
          await rm(f.full, { recursive: true, force: true });
          deleted.push(f.name);
        } catch {
          // best-effort
        }
      }
      return deleted;
    } catch {
      return [];
    }
  }
}

/**
 * Per-attempt writer. Methods are idempotent — later calls overwrite earlier
 * content on disk, which is what we want when both the agent impl and the
 * external retry layer write to the same attempt (they complete the picture
 * incrementally).
 */
export class AttemptWriter {
  readonly attemptDir: string;
  readonly startedAtMs: number;
  private metaCache: Partial<AttemptMeta> = {};

  constructor(
    private readonly store: DebugStore,
    readonly coords: AttemptCoords,
  ) {
    this.attemptDir = store.getAttemptDir(coords);
    this.startedAtMs = Date.now();
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.attemptDir, { recursive: true });
  }

  async writePromptInput(prompt: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'prompt-input.txt'), prompt, 'utf-8');
    } catch (err) {
      this.logFailure('prompt-input.txt', err);
    }
  }

  async writePromptResolved(prompt: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'prompt-resolved.md'), prompt, 'utf-8');
    } catch (err) {
      this.logFailure('prompt-resolved.md', err);
    }
  }

  async snapshotAgentFile(agentFilePath: string): Promise<void> {
    try {
      await this.ensureDir();
      await copyFile(agentFilePath, path.join(this.attemptDir, 'agent-file.md'));
    } catch (err) {
      this.logFailure('agent-file.md', err);
    }
  }

  async writeSettings(content: string | object): Promise<void> {
    try {
      await this.ensureDir();
      const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      await writeFile(path.join(this.attemptDir, 'settings.json'), body, 'utf-8');
    } catch (err) {
      this.logFailure('settings.json', err);
    }
  }

  async writeOutputRaw(raw: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'output.raw.txt'), truncate(raw) ?? '', 'utf-8');
    } catch (err) {
      this.logFailure('output.raw.txt', err);
    }
  }

  /**
   * Best-effort structured output write. Detects the format (JSON / Markdown /
   * plain text) and picks an appropriate filename. Always also writes the raw
   * bytes via writeOutputRaw() when the caller wants both.
   */
  async writeOutput(value: string): Promise<void> {
    try {
      await this.ensureDir();
      const ext = detectOutputExtension(value);
      await writeFile(path.join(this.attemptDir, `output.${ext}`), truncate(value) ?? '', 'utf-8');
    } catch (err) {
      this.logFailure('output.*', err);
    }
  }

  async writeOutputSchema(schema: object | string): Promise<void> {
    try {
      await this.ensureDir();
      const body = typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2);
      await writeFile(path.join(this.attemptDir, 'output-schema.json'), body, 'utf-8');
    } catch (err) {
      this.logFailure('output-schema.json', err);
    }
  }

  async writeStdout(text: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'stdout.log'), truncate(text) ?? '', 'utf-8');
    } catch (err) {
      this.logFailure('stdout.log', err);
    }
  }

  async writeStderr(text: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'stderr.log'), truncate(text) ?? '', 'utf-8');
    } catch (err) {
      this.logFailure('stderr.log', err);
    }
  }

  async writeErrorSummary(message: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'error.txt'), message, 'utf-8');
    } catch (err) {
      this.logFailure('error.txt', err);
    }
  }

  async writeValidationErrors(
    errors: string[] | ValidationFailureEntry[],
    rawText?: string,
  ): Promise<void> {
    try {
      await this.ensureDir();
      const normalized: ValidationFailureEntry[] = (errors as Array<unknown>).map((e) =>
        typeof e === 'string' ? { message: e } : (e as ValidationFailureEntry),
      );
      const doc: ValidationErrorsFile = {
        attemptNumber: this.coords.attemptNumber,
        agentName: this.coords.agentName,
        sessionId: this.coords.sessionId,
        capturedAt: new Date().toISOString(),
        errors: normalized,
        rawText,
      };
      await writeFile(
        path.join(this.attemptDir, 'validation-errors.json'),
        JSON.stringify(doc, null, 2),
        'utf-8',
      );
    } catch (err) {
      this.logFailure('validation-errors.json', err);
    }
  }

  async writeNativeTranscript(content: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'transcript.jsonl'), content, 'utf-8');
    } catch (err) {
      this.logFailure('transcript.jsonl', err);
    }
  }

  async writeNormalizedEvents(content: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'events.jsonl'), content, 'utf-8');
    } catch (err) {
      this.logFailure('events.jsonl', err);
    }
  }

  async writeRenderedHtml(html: string): Promise<void> {
    try {
      await this.ensureDir();
      await writeFile(path.join(this.attemptDir, 'transcript.html'), html, 'utf-8');
    } catch (err) {
      this.logFailure('transcript.html', err);
    }
  }

  async mergeMeta(patch: Partial<AttemptMeta>): Promise<void> {
    try {
      await this.ensureDir();
      const metaPath = path.join(this.attemptDir, 'meta.json');
      let existing: Partial<AttemptMeta> = {};
      try {
        existing = JSON.parse(await readFile(metaPath, 'utf-8')) as Partial<AttemptMeta>;
      } catch {
        existing = {};
      }
      const merged: Partial<AttemptMeta> = {
        ...existing,
        ...this.metaCache,
        ...patch,
        agentName: this.coords.agentName,
        sessionId: this.coords.sessionId,
        attemptNumber: this.coords.attemptNumber,
        phaseId: this.coords.phaseId,
        phaseNumber: this.coords.phaseNumber,
        phaseLabel: this.coords.phaseLabel,
        runId: this.store.context.runId,
        workflow: this.store.context.workflow,
      };
      this.metaCache = merged;
      await writeFile(metaPath, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (err) {
      this.logFailure('meta.json', err);
    }
  }

  async finalize(outcome: 'success' | 'failure', patch: Partial<AttemptMeta> = {}): Promise<void> {
    const endedAtMs = Date.now();
    await this.mergeMeta({
      outcome,
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: endedAtMs - this.startedAtMs,
      ...patch,
    });
  }

  private logFailure(artifact: string, err: unknown): void {
    logger.warn(
      `[debug-store] failed to write ${artifact} under ${this.attemptDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function detectOutputExtension(value: string): 'json' | 'md' | 'txt' {
  const trimmed = value.trim();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && looksLikeJson(trimmed)) return 'json';
  if (trimmed.startsWith('#') || /\n#\s/.test(trimmed) || /^---\n/.test(trimmed)) return 'md';
  return 'txt';
}

function looksLikeJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * FRAMEWORK_DEBUG is now a verbosity knob, not a capture gate. Debug artifacts
 * are always written. Callers can check this flag if they want *extra* verbose
 * output (kept for compatibility with code that still reads it).
 */
export function isDebugEnabled(): boolean {
  const raw = process.env.FRAMEWORK_DEBUG;
  if (!raw) return false;
  return raw !== '0' && raw.toLowerCase() !== 'false' && raw !== '';
}
