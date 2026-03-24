import { describe, it, expect, vi, beforeEach } from 'vitest';
import { phase1ContextNode } from '../../../../src/nodes/implement-ticket/phase1-context.node.js';
import type { ImplementTicketState } from '../../../../src/state/schemas/implement-ticket.schema.js';
import * as fs from 'fs';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('phase1ContextNode', () => {
  let mockState: ImplementTicketState;

  beforeEach(() => {
    vi.clearAllMocks();

    mockState = {
      ticket_id: 'TICKET-123',
      project_path: '/test/project',
      framework_path: '/test/framework',
      temp_dir: '/test/temp',
      input_source: 'input',
      input_value: 'Implement a new user authentication feature with JWT tokens. This should include login, logout, and token refresh endpoints. The authentication should integrate with the existing user database and follow security best practices including password hashing and rate limiting.',
      current_phase: 'phase1_context',
      errors: [],
    } as ImplementTicketState;

    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      if (path.includes('context-complete.json')) return false;
      if (path.includes('preflight-complete.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
      if (path.includes('ticket.md')) {
        return 'Implement a new user authentication feature with JWT tokens. This should include login, logout, and token refresh endpoints. The authentication should integrate with the existing user database and follow security best practices including password hashing and rate limiting.';
      }
      return '';
    });
  });

  describe('completion marker', () => {
    it('should skip if already complete', async () => {
      const completionData = {
        completed_at: '2024-01-01T00:00:00Z',
        ticket_id: 'TICKET-123',
        context_data: { full_context: 'Context' },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(completionData));

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
      expect(result.phase1_complete).toBe(true);
    });
  });

  describe('phase0 validation', () => {
    it('should fail if phase0 not complete', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('context-complete.json')) return false;
        if (path.includes('preflight-complete.json')) return false;
        return true;
      });

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
    });
  });

  describe('input source handling', () => {
    it('should handle input source', async () => {
      mockState.input_source = 'input';
      mockState.input_value = 'Implement a comprehensive user authentication system with JWT tokens, including login, logout, and token refresh endpoints. The implementation should integrate seamlessly with the existing user database and follow industry-standard security best practices including bcrypt password hashing, rate limiting, and secure session management.';

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
    });

    it('should handle markdown source', async () => {
      mockState.input_source = 'markdown';
      mockState.input_value = '/path/to/ticket.md';

      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('context-complete.json')) return false;
        if (path.includes('preflight-complete.json')) return true;
        if (path.includes('ticket.md')) return true;
        return false;
      });

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
    });

    it('should fail if markdown file not found', async () => {
      mockState.input_source = 'markdown';
      mockState.input_value = '/path/to/missing.md';

      vi.mocked(fs.existsSync).mockImplementation((path: any) => {
        if (path.includes('context-complete.json')) return false;
        if (path.includes('preflight-complete.json')) return true;
        if (path.includes('missing.md')) return false;
        return false;
      });

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
    });
  });

  describe('context validation', () => {
    it('should fail if context is empty', async () => {
      mockState.input_source = 'input';
      mockState.input_value = '';

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Context is empty');
    });

    it('should fail if context is too short', async () => {
      mockState.input_source = 'input';
      mockState.input_value = 'Short';

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Context too short');
    });

    it('should fail with unknown input source', async () => {
      mockState.input_source = 'unknown' as any;
      mockState.input_value = 'Some value';

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Unknown input source');
    });
  });

  describe('jira source handling', () => {
    beforeEach(() => {
      // Mock environment variables
      process.env.JIRA_EMAIL = 'test@example.com';
      process.env.JIRA_API_TOKEN = 'test-token';

      mockState.input_source = 'jira';
    });

    it('should fail with invalid Jira URL format', async () => {
      mockState.input_value = 'https://invalid-url.com';

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Invalid Jira URL format');
    });

    it('should fail without Jira credentials', async () => {
      delete process.env.JIRA_EMAIL;
      delete process.env.JIRA_API_TOKEN;

      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Jira authentication not configured');
    });

    it('should handle successful Jira fetch', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      const mockIssue = {
        fields: {
          summary: 'Test Issue',
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Test description' }]
              }
            ]
          },
          issuetype: { name: 'Story' },
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          assignee: { displayName: 'John Doe' },
          reporter: { displayName: 'Jane Smith' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-02T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
      expect(result.phase1_complete).toBe(true);
    });

    it('should handle Jira 401 authentication error', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      } as any);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('authentication failed');
    });

    it('should handle Jira 404 not found error', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('not found');
    });

    it('should handle Jira API errors', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as any);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Jira API error');
    });

    it('should handle network errors', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      const networkError = new Error('Network failure') as any;
      networkError.code = 'ENOTFOUND';

      global.fetch = vi.fn().mockRejectedValue(networkError);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('failed');
      expect(result.errors?.[0]).toContain('Cannot connect to Jira');
    });

    it('should handle Jira with acceptance criteria', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      const mockIssue = {
        fields: {
          summary: 'Test',
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Desc' }] }] },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: null,
          reporter: { displayName: 'Reporter' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          customfield_10000: 'AC1: Should do something\nAC2: Should do something else',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
      expect(result.phase1_complete).toBe(true);
    });

    it('should handle Jira with comments', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      const mockIssue = {
        fields: {
          summary: 'Test',
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Desc' }] }] },
          issuetype: { name: 'Bug' },
          status: { name: 'Open' },
          priority: { name: 'High' },
          assignee: { displayName: 'Assignee' },
          reporter: { displayName: 'Reporter' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: {
            comments: [
              {
                author: { displayName: 'Commenter' },
                created: '2024-01-01T12:00:00Z',
                body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This is a comment' }] }] }
              }
            ]
          }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
    });

    it('should detect Confluence links', async () => {
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';

      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'See ' },
                  { type: 'text', text: 'https://company.atlassian.net/wiki/spaces/DEV/pages/123', marks: [{ type: 'link', attrs: { href: 'https://company.atlassian.net/wiki/spaces/DEV/pages/123' } }] }
                ]
              }
            ]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Low' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('external-docs.md'),
        expect.any(String)
      );
    });
  });

  describe('disk persistence', () => {
    it('should write context to disk', async () => {
      await phase1ContextNode(mockState);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('return state', () => {
    it('should set current_phase to phase2_planning', async () => {
      const result = await phase1ContextNode(mockState);

      expect(result.current_phase).toBe('phase2_planning');
    });

    it('should set phase1_complete to true', async () => {
      const result = await phase1ContextNode(mockState);

      expect(result.phase1_complete).toBe(true);
    });
  });

  describe('formatAtlassianDocument (ADF formatting)', () => {
    beforeEach(() => {
      mockState.input_source = 'jira';
      mockState.input_value = 'https://company.atlassian.net/browse/PROJ-123';
      process.env.JIRA_EMAIL = 'test@example.com';
      process.env.JIRA_API_TOKEN = 'test-token';
    });

    it('should format paragraph nodes', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] }
            ]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format text with strong marks', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'bold text', marks: [{ type: 'strong' }] }]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format text with em marks', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'italic text', marks: [{ type: 'em' }] }]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format text with code marks', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'code text', marks: [{ type: 'code' }] }]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format heading nodes', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Heading Text' }]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format bulletList nodes', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] }
              ]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format orderedList nodes', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'orderedList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] }
              ]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format codeBlock nodes', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'codeBlock',
              attrs: { language: 'javascript' },
              content: [{ type: 'text', text: 'const x = 1;' }]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format blockquote nodes', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'blockquote',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted text' }] }]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format hardBreak nodes', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Line 1' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Line 2' }
              ]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle unknown node types with content', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'unknownType',
              content: [{ type: 'text', text: 'Unknown content' }]
            }]
          },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle empty ADF document', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: { type: 'doc', version: 1, content: [] },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle ADF acceptance criteria as object', async () => {
      const mockIssue = {
        fields: {
          summary: 'Test',
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Desc' }] }] },
          issuetype: { name: 'Story' },
          status: { name: 'Open' },
          priority: { name: 'Medium' },
          assignee: { displayName: 'User' },
          reporter: { displayName: 'User' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
          customfield_10000: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AC as ADF' }] }]
          },
          comment: { comments: [] }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIssue,
      } as any);

      await phase1ContextNode(mockState);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
