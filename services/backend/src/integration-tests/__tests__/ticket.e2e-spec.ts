import { httpClient } from '../helpers/http-client';
import { getAccessToken, TEST_USERS } from '../helpers/auth';

describe('Ticket & Comment API (e2e)', () => {
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  let acmeId: string;
  let pltProjectId: string;
  let existingTicketId: string;
  let createdTicketId: string;

  beforeAll(async () => {
    [aliceToken, bobToken, carolToken] = await Promise.all([
      getAccessToken(TEST_USERS.alice.email, TEST_USERS.alice.password),
      getAccessToken(TEST_USERS.bob.email, TEST_USERS.bob.password),
      getAccessToken(TEST_USERS.carol.email, TEST_USERS.carol.password)
    ]);

    // Discover org + project IDs
    const orgs = await httpClient.get('/organizations', {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    acmeId = orgs.data.find((o: any) => o.slug === 'acme').id;

    const projects = await httpClient.get(`/organizations/${acmeId}/projects`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    pltProjectId = projects.data.find((p: any) => p.key === 'PLT').id;
  });

  // ====== Board ======

  describe('GET /projects/:projectId/board', () => {
    it('should return board as a status-keyed object with ticket arrays', async () => {
      const res = await httpClient.get(`/projects/${pltProjectId}/board`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      // Board is Record<string, Ticket[]> keyed by status
      expect(typeof res.data).toBe('object');
      expect(Array.isArray(res.data)).toBe(false);

      const expectedStatuses = [
        'backlog',
        'todo',
        'in_progress',
        'in_review',
        'done'
      ];
      for (const status of expectedStatuses) {
        expect(res.data).toHaveProperty(status);
        expect(Array.isArray(res.data[status])).toBe(true);
      }

      // Find a ticket to use in later tests
      for (const status of expectedStatuses) {
        if (res.data[status].length > 0) {
          existingTicketId = res.data[status][0].id;
          break;
        }
      }

      expect(existingTicketId).toBeDefined();
    });

    it('should return 403 for non-project-member', async () => {
      const res = await httpClient.get(`/projects/${pltProjectId}/board`, {
        headers: { Authorization: `Bearer ${carolToken}` }
      });
      expect(res.status).toBe(403);
    });
  });

  // ====== Ticket List ======

  describe('GET /projects/:projectId/tickets', () => {
    it('should list tickets with pagination', async () => {
      const res = await httpClient.get(
        `/projects/${pltProjectId}/tickets?page=1&limit=5`,
        {
          headers: { Authorization: `Bearer ${aliceToken}` }
        }
      );

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('data');
      expect(res.data).toHaveProperty('meta');
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.meta.page).toBe(1);
    });
  });

  // ====== Ticket CRUD ======

  describe('POST /projects/:projectId/tickets', () => {
    it('should create a ticket as project member', async () => {
      const res = await httpClient.post(
        `/projects/${pltProjectId}/tickets`,
        {
          title: 'E2E Test Ticket',
          description: 'Created by integration test',
          priority: 'medium',
          status: 'backlog'
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      expect(res.data.title).toBe('E2E Test Ticket');
      expect(res.data.priority).toBe('medium');
      createdTicketId = res.data.id;
    });

    it('should reject ticket creation by non-project-member', async () => {
      const res = await httpClient.post(
        `/projects/${pltProjectId}/tickets`,
        {
          title: 'Unauthorized Ticket',
          priority: 'low'
        },
        { headers: { Authorization: `Bearer ${carolToken}` } }
      );
      expect(res.status).toBe(403);
    });

    it('should return 400 when title is missing', async () => {
      const res = await httpClient.post(
        `/projects/${pltProjectId}/tickets`,
        { priority: 'low' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when priority value is invalid', async () => {
      const res = await httpClient.post(
        `/projects/${pltProjectId}/tickets`,
        { title: 'Bad Priority', priority: 'super_urgent' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('GET /tickets/:id', () => {
    it('should return ticket details', async () => {
      const res = await httpClient.get(`/tickets/${createdTicketId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(createdTicketId);
      expect(res.data.title).toBe('E2E Test Ticket');
    });

    it('should return 404 for non-existent ticket', async () => {
      const res = await httpClient.get(
        '/tickets/00000000-0000-0000-0000-000000000000',
        {
          headers: { Authorization: `Bearer ${aliceToken}` }
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /tickets/:id', () => {
    it('should update ticket details', async () => {
      const res = await httpClient.patch(
        `/tickets/${createdTicketId}`,
        { title: 'E2E Ticket Updated', priority: 'high' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.title).toBe('E2E Ticket Updated');
      expect(res.data.priority).toBe('high');
    });
  });

  describe('PATCH /tickets/:id/status (move)', () => {
    it('should move ticket to a new status', async () => {
      const res = await httpClient.patch(
        `/tickets/${createdTicketId}/status`,
        { status: 'todo', order: 0 },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('todo');
    });

    it('should return 400 when status value is invalid', async () => {
      const res = await httpClient.patch(
        `/tickets/${createdTicketId}/status`,
        { status: 'flying', order: 0 },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });
  });

  // ====== Comments ======

  describe('POST /tickets/:ticketId/comments', () => {
    let commentId: string;

    it('should add a comment to a ticket', async () => {
      const res = await httpClient.post(
        `/tickets/${existingTicketId}/comments`,
        { content: 'E2E test comment' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      expect(res.data.content).toBe('E2E test comment');
      commentId = res.data.id;
    });

    it('should return 400 when comment content is empty', async () => {
      const res = await httpClient.post(
        `/tickets/${existingTicketId}/comments`,
        { content: '' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when comment content is missing', async () => {
      const res = await httpClient.post(
        `/tickets/${existingTicketId}/comments`,
        {},
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });

    it('should return 404 when commenting on non-existent ticket', async () => {
      const res = await httpClient.post(
        '/tickets/00000000-0000-0000-0000-000000000000/comments',
        { content: 'Ghost comment' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(404);
    });

    it('should update own comment', async () => {
      const res = await httpClient.patch(
        `/comments/${commentId}`,
        { content: 'E2E comment updated' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.content).toBe('E2E comment updated');
    });

    it("should reject updating another user's comment", async () => {
      // Bob tries to update Alice's comment
      const res = await httpClient.patch(
        `/comments/${commentId}`,
        { content: 'Hijacked!' },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );
      expect(res.status).toBe(403);
    });

    it("should reject deleting another user's comment", async () => {
      const res = await httpClient.delete(`/comments/${commentId}`, {
        headers: { Authorization: `Bearer ${bobToken}` }
      });
      expect(res.status).toBe(403);
    });

    it('should delete own comment', async () => {
      const res = await httpClient.delete(`/comments/${commentId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });
      expect(res.status).toBe(200);
    });
  });

  // ====== Delete Ticket ======

  describe('DELETE /tickets/:id', () => {
    it('should reject deletion by non-admin project member', async () => {
      // Bob is member in PLT (not admin)
      const res = await httpClient.delete(`/tickets/${createdTicketId}`, {
        headers: { Authorization: `Bearer ${bobToken}` }
      });
      expect(res.status).toBe(403);
    });

    it('should allow project admin to delete ticket', async () => {
      // Alice is admin in PLT
      const res = await httpClient.delete(`/tickets/${createdTicketId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });
      expect(res.status).toBe(200);
    });
  });
});
