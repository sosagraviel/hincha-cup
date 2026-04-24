import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  DebugStore,
  getInitializeProjectPhase,
  setActiveDebugStore,
} from '../../../../../src/services/framework/debug-store/index.js';
import { setActiveProvider } from '../../../../../src/utils/provider-paths.js';
import { Provider } from '../../../../../src/providers/types.js';

describe('DebugStore', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(path.join(tmpdir(), 'debug-store-'));
    setActiveProvider(Provider.CLAUDE);
    setActiveDebugStore(null);
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('creates a run folder with run.json', async () => {
    const store = await DebugStore.create({ projectPath, workflow: 'initialize-project' });
    const ctx = store.getRunContext();
    expect(ctx.runDir).toContain('initialize-project/debug/runs/');
    expect(existsSync(path.join(ctx.runDir, 'run.json'))).toBe(true);
    const manifest = JSON.parse(await readFile(path.join(ctx.runDir, 'run.json'), 'utf-8'));
    expect(manifest.runId).toBe(ctx.runId);
    expect(manifest.workflow).toBe('initialize-project');
  });

  it('writes per-attempt artifacts under phase/agent/attempt-N/<sessionId>/', async () => {
    const store = await DebugStore.create({ projectPath, workflow: 'initialize-project' });
    const phase = getInitializeProjectPhase('phase1');
    const writer = store.beginAttempt({
      ...phase,
      agentName: 'structure-architecture-analyzer',
      attemptNumber: 1,
      sessionId: 'session-abc',
    });
    await writer.writePromptInput('hello world');
    await writer.writeOutputRaw('{"a":1}');
    await writer.writeOutput('{"a":1}');
    await writer.mergeMeta({ provider: 'claude', outcome: 'success' });
    await writer.finalize('success', { code: 0 });

    const dir = writer.attemptDir;
    expect(dir).toContain(
      'phase-1-discovery/structure-architecture-analyzer/attempt-1/session-abc',
    );
    expect(existsSync(path.join(dir, 'prompt-input.txt'))).toBe(true);
    expect(existsSync(path.join(dir, 'output.raw.txt'))).toBe(true);
    expect(existsSync(path.join(dir, 'output.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'meta.json'))).toBe(true);

    const meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf-8'));
    expect(meta.agentName).toBe('structure-architecture-analyzer');
    expect(meta.outcome).toBe('success');
    expect(meta.phaseId).toBe('phase-1-discovery');
    expect(typeof meta.durationMs).toBe('number');
  });

  it('detects output format (.json / .md / .txt)', async () => {
    const store = await DebugStore.create({ projectPath, workflow: 'w' });
    const phase = getInitializeProjectPhase('phase1');
    const jsonWriter = store.beginAttempt({
      ...phase,
      agentName: 'a',
      attemptNumber: 1,
      sessionId: 's1',
    });
    await jsonWriter.writeOutput('{"a":1}');
    expect(existsSync(path.join(jsonWriter.attemptDir, 'output.json'))).toBe(true);

    const mdWriter = store.beginAttempt({
      ...phase,
      agentName: 'a',
      attemptNumber: 2,
      sessionId: 's2',
    });
    await mdWriter.writeOutput('# Heading\n\nBody paragraph.');
    expect(existsSync(path.join(mdWriter.attemptDir, 'output.md'))).toBe(true);

    const txtWriter = store.beginAttempt({
      ...phase,
      agentName: 'a',
      attemptNumber: 3,
      sessionId: 's3',
    });
    await txtWriter.writeOutput('plain text');
    expect(existsSync(path.join(txtWriter.attemptDir, 'output.txt'))).toBe(true);
  });

  it('prunes oldest runs when keep < count', async () => {
    await DebugStore.create({
      projectPath,
      workflow: 'initialize-project',
      startedAt: new Date(2026, 0, 1),
    });
    await DebugStore.create({
      projectPath,
      workflow: 'initialize-project',
      startedAt: new Date(2026, 0, 2),
    });
    await DebugStore.create({
      projectPath,
      workflow: 'initialize-project',
      startedAt: new Date(2026, 0, 3),
    });
    const deleted = await DebugStore.pruneRuns(projectPath, 'initialize-project', 2);
    expect(deleted.length).toBe(1);
  });
});
