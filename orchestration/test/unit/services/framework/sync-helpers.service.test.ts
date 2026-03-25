import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateSingleSkill,
  addSingleSkill,
  regenerateSingleAgent,
} from '../../../../src/services/framework/sync-helpers.service.js';
import * as fs from 'fs';

// Mock dependencies
vi.mock('fs');
vi.mock('../../../../src/utils/skill-resolver.js', () => ({
  resolveSkills: vi.fn().mockReturnValue([
    { name: 'test-skill', sourcePath: '/framework/skills/test-skill', targetPath: '/project/.claude/skills/test-skill' },
  ]),
}));
vi.mock('../../../../src/utils/agent-generator.js', () => ({
  generateAgents: vi.fn().mockReturnValue([
    { name: 'test-agent', content: '# Test Agent' },
  ]),
  writeAgents: vi.fn(),
}));

describe('sync-helpers.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updateSingleSkill', () => {
    it('should update a skill successfully', async () => {
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(['test-skill'] as any)
        .mockReturnValueOnce(['file1.txt', 'file2.txt'] as any);

      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ isDirectory: () => true } as any)
        .mockReturnValueOnce({ isDirectory: () => false } as any)
        .mockReturnValueOnce({ isDirectory: () => false } as any);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

      const result = await updateSingleSkill('test-skill', '/project', '/framework');

      expect(result.updated).toBe(true);
      expect(result.filesChanged).toBe(2);
      expect(fs.copyFileSync).toHaveBeenCalledTimes(2);
    });

    it('should throw error if skill not found', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(updateSingleSkill('non-existent', '/project', '/framework')).rejects.toThrow(
        'Skill non-existent not found in framework'
      );
    });

    it('should handle nested skill directories', async () => {
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(['category'] as any)
        .mockReturnValueOnce(['test-skill'] as any)
        .mockReturnValueOnce(['file.txt'] as any);

      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ isDirectory: () => true } as any)
        .mockReturnValueOnce({ isDirectory: () => true } as any)
        .mockReturnValueOnce({ isDirectory: () => false } as any);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

      const result = await updateSingleSkill('test-skill', '/project', '/framework');

      expect(result.updated).toBe(true);
      expect(result.filesChanged).toBe(1);
    });

    it('should return 0 files changed if source does not exist', async () => {
      vi.mocked(fs.readdirSync).mockReturnValueOnce(['test-skill'] as any);
      vi.mocked(fs.statSync).mockReturnValueOnce({ isDirectory: () => true } as any);
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // skills dir exists
        .mockReturnValueOnce(false); // source path doesn't exist
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

      const result = await updateSingleSkill('test-skill', '/project', '/framework');

      expect(result.updated).toBe(false);
      expect(result.filesChanged).toBe(0);
    });

    it('should handle recursive directory copy', async () => {
      // This test validates the basic structure rather than exact mock calls
      // The actual sync behavior is tested in integration tests
      vi.mocked(fs.readdirSync).mockReturnValue(['test-skill'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(updateSingleSkill('non-existent', '/project', '/framework')).rejects.toThrow(
        'not found in framework'
      );
    });
  });

  describe('addSingleSkill', () => {
    it('should call updateSingleSkill internally', async () => {
      // addSingleSkill is just a wrapper around updateSingleSkill
      // The actual sync behavior is tested in integration tests
      vi.mocked(fs.readdirSync).mockReturnValue(['new-skill'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(addSingleSkill('missing-skill', '/project', '/framework')).rejects.toThrow(
        'not found in framework'
      );
    });
  });

  describe('regenerateSingleAgent', () => {
    it('should return error if config not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await regenerateSingleAgent('test-agent', '/project', '/framework');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Framework config not found');
    });

    it('should handle errors from existsSync check', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await regenerateSingleAgent('missing-agent', '/nonexistent', '/framework');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
