import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectVersionControl } from '../../../../../src/nodes/initialize-project/phase4/helpers/version-control-extractor.js';

/**
 * Version-control extractor detects the VCS hosting platform from the git
 * `origin` remote URL. Pure I/O, never throws: a missing repo, missing remote,
 * or unrecognized host all yield `undefined`.
 *
 * Stack-agnostic — only inspects the git remote.
 */

describe('detectVersionControl', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vcs-extractor-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Initialise a git repo at tmpDir with a fixed `origin` remote URL. */
  const initRepoWithRemote = (url: string): void => {
    execSync('git init -q', { cwd: tmpDir });
    execSync(`git remote add origin "${url}"`, { cwd: tmpDir });
  };

  it('returns undefined for an empty path', () => {
    expect(detectVersionControl('')).toBeUndefined();
  });

  it('returns undefined when the directory is not a git repo', () => {
    expect(detectVersionControl(tmpDir)).toBeUndefined();
  });

  it('returns undefined when the repo has no origin remote', () => {
    execSync('git init -q', { cwd: tmpDir });
    expect(detectVersionControl(tmpDir)).toBeUndefined();
  });

  it('classifies an HTTPS GitHub remote as github', () => {
    initRepoWithRemote('https://github.com/thisisqubika/repo.git');
    expect(detectVersionControl(tmpDir)).toBe('github');
  });

  it('classifies an SSH GitHub remote as github', () => {
    initRepoWithRemote('git@github.com:thisisqubika/repo.git');
    expect(detectVersionControl(tmpDir)).toBe('github');
  });

  it('classifies a GitLab remote as gitlab (cloud and self-hosted)', () => {
    initRepoWithRemote('https://gitlab.com/org/repo.git');
    expect(detectVersionControl(tmpDir)).toBe('gitlab');
  });

  it('classifies a self-hosted GitLab remote as gitlab', () => {
    initRepoWithRemote('git@gitlab.internal.acme.dev:org/repo.git');
    expect(detectVersionControl(tmpDir)).toBe('gitlab');
  });

  it('classifies a dev.azure.com remote as azure-devops', () => {
    initRepoWithRemote('https://dev.azure.com/org/project/_git/repo');
    expect(detectVersionControl(tmpDir)).toBe('azure-devops');
  });

  it('classifies a legacy visualstudio.com remote as azure-devops', () => {
    initRepoWithRemote('https://org.visualstudio.com/project/_git/repo');
    expect(detectVersionControl(tmpDir)).toBe('azure-devops');
  });

  it('classifies a Bitbucket remote as bitbucket', () => {
    initRepoWithRemote('git@bitbucket.org:org/repo.git');
    expect(detectVersionControl(tmpDir)).toBe('bitbucket');
  });

  it('returns undefined for an unrecognized host', () => {
    initRepoWithRemote('https://git.sr.ht/~org/repo');
    expect(detectVersionControl(tmpDir)).toBeUndefined();
  });
});
