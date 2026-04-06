import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateAgentFile, assertAgentFileValid } from '../../../../../src/utils/shared/agent-factory/agent-validator.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('validateAgentFile', () => {
  const agentsDir = path.join(__dirname, '../../../../../agents');
  let tempDir: string;

  beforeAll(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-validator-test-'));
  });

  afterAll(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Valid Agent Files', () => {
    it('should validate structure-architecture-analyzer', () => {
      const result = validateAgentFile(
        path.join(agentsDir, '01-structure-architecture.md')
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.frontmatter?.name).toBe('structure-architecture-analyzer');
    });

    it('should validate tech-stack-dependencies-analyzer', () => {
      const result = validateAgentFile(
        path.join(agentsDir, '02-tech-stack-dependencies.md')
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate code-patterns-testing-analyzer', () => {
      const result = validateAgentFile(
        path.join(agentsDir, '03-code-patterns-testing.md')
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate data-flows-integrations-analyzer', () => {
      const result = validateAgentFile(
        path.join(agentsDir, '04-data-flows-integrations.md')
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate architect-synthesizer', () => {
      const result = validateAgentFile(
        path.join(agentsDir, '05-architect-synthesizer.md')
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate question-consolidator', () => {
      const result = validateAgentFile(
        path.join(agentsDir, '06-question-consolidator.md')
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Path Validation Errors', () => {
    it('should reject empty path', () => {
      const result = validateAgentFile('');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Agent path is required');
    });

    it('should reject missing file', () => {
      const result = validateAgentFile('/path/to/nonexistent.md');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });

    it('should reject non-markdown file', () => {
      const txtFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(txtFile, 'Hello world');

      const result = validateAgentFile(txtFile);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be markdown');
    });
  });

  describe('Frontmatter Parsing Errors', () => {
    it('should reject missing frontmatter', () => {
      const noFrontmatter = path.join(tempDir, 'no-frontmatter.md');
      fs.writeFileSync(noFrontmatter, '# My Agent\n\nThis is content without frontmatter.');

      const result = validateAgentFile(noFrontmatter);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('missing frontmatter');
    });

    it('should reject invalid YAML syntax', () => {
      const invalidYaml = path.join(tempDir, 'invalid-yaml.md');
      fs.writeFileSync(invalidYaml, `---
name: test-agent
description: [unclosed bracket
---

# Agent Content`);

      const result = validateAgentFile(invalidYaml);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid YAML');
    });
  });

  describe('Required Fields Validation', () => {
    it('should reject missing name field', () => {
      const missingName = path.join(tempDir, 'missing-name.md');
      fs.writeFileSync(missingName, `---
description: This is a test agent
---

# Agent Content`);

      const result = validateAgentFile(missingName);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should reject missing description field', () => {
      const missingDesc = path.join(tempDir, 'missing-description.md');
      fs.writeFileSync(missingDesc, `---
name: test-agent
---

# Agent Content`);

      const result = validateAgentFile(missingDesc);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('description'))).toBe(true);
    });

    it('should reject when both required fields are missing', () => {
      const missingBoth = path.join(tempDir, 'missing-both.md');
      fs.writeFileSync(missingBoth, `---
model: sonnet
---

# Agent Content`);

      const result = validateAgentFile(missingBoth);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
      expect(result.errors.some(e => e.includes('description'))).toBe(true);
    });
  });

  describe('Field Name Warnings', () => {
    it('should warn about unknown fields', () => {
      const unknownField = path.join(tempDir, 'unknown-field.md');
      fs.writeFileSync(unknownField, `---
name: test-agent
description: Test agent with unknown field
custom_unknown_field: some_value
---

# Agent Content`);

      const result = validateAgentFile(unknownField);
      expect(result.valid).toBe(true); // Still valid (warnings don't fail validation)
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Unknown field');
      expect(result.warnings[0]).toContain('custom_unknown_field');
    });

    it('should not warn about valid CLI fields', () => {
      const validFields = path.join(tempDir, 'valid-fields.md');
      fs.writeFileSync(validFields, `---
name: test-agent
description: Test agent with all valid fields
model: sonnet
tools: Read, Write, Edit
permissionMode: default
maxTurns: 10
user-prompt-submit-hook: ./hooks/validate.ts
---

# Agent Content`);

      const result = validateAgentFile(validFields);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should not warn about framework fields', () => {
      const frameworkFields = path.join(tempDir, 'framework-fields.md');
      fs.writeFileSync(frameworkFields, `---
name: test-agent
description: Test agent with framework fields
subagent_type: Explore
run_in_background: true
output_format: json
---

# Agent Content`);

      const result = validateAgentFile(frameworkFields);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('assertAgentFileValid', () => {
    it('should not throw for valid agent file', () => {
      const validAgent = path.join(agentsDir, '01-structure-architecture.md');
      expect(() => assertAgentFileValid(validAgent)).not.toThrow();
    });

    it('should throw for invalid agent file with clear error message', () => {
      const invalidAgent = path.join(tempDir, 'invalid-for-assert.md');
      fs.writeFileSync(invalidAgent, `---
model: sonnet
---

# Missing required fields`);

      expect(() => assertAgentFileValid(invalidAgent)).toThrow('Invalid agent file');
      expect(() => assertAgentFileValid(invalidAgent)).toThrow('Errors:');
      expect(() => assertAgentFileValid(invalidAgent)).toThrow('name');
    });

    it('should throw for non-existent file', () => {
      expect(() => assertAgentFileValid('/nonexistent/agent.md')).toThrow('not found');
    });
  });

  describe('Edge Cases', () => {
    it('should handle agent with empty frontmatter', () => {
      const emptyFrontmatter = path.join(tempDir, 'empty-frontmatter.md');
      fs.writeFileSync(emptyFrontmatter, `---
---

# Agent Content`);

      const result = validateAgentFile(emptyFrontmatter);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2); // Both name and description missing
    });

    it('should handle agent with comments in frontmatter', () => {
      const withComments = path.join(tempDir, 'with-comments.md');
      fs.writeFileSync(withComments, `---
name: test-agent
# This is a comment
description: Test agent
# Another comment
model: sonnet
---

# Agent Content`);

      const result = validateAgentFile(withComments);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle agent with very long description', () => {
      const longDesc = path.join(tempDir, 'long-description.md');
      const longDescription = 'A'.repeat(10000);
      fs.writeFileSync(longDesc, `---
name: test-agent
description: ${longDescription}
---

# Agent Content`);

      const result = validateAgentFile(longDesc);
      expect(result.valid).toBe(true);
      expect(result.frontmatter?.description).toHaveLength(10000);
    });
  });
});
