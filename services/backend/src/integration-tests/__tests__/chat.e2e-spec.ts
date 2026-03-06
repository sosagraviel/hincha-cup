import { httpClient } from '../helpers/http-client';
import { getAccessToken, TEST_USERS } from '../helpers/auth';

describe('Chat API (e2e)', () => {
  let aliceToken: string;
  let bobToken: string;
  let _carolToken: string;

  let acmeId: string;
  let _aliceUserId: string;
  let bobUserId: string;
  let roomId: string;
  let messageId: string;
  let dmThreadId: string;

  beforeAll(async () => {
    [aliceToken, bobToken, _carolToken] = await Promise.all([
      getAccessToken(TEST_USERS.alice.email, TEST_USERS.alice.password),
      getAccessToken(TEST_USERS.bob.email, TEST_USERS.bob.password),
      getAccessToken(TEST_USERS.carol.email, TEST_USERS.carol.password)
    ]);

    // Discover user IDs and org ID
    const [aliceRes, bobRes] = await Promise.all([
      httpClient.get('/users/me', {
        headers: { Authorization: `Bearer ${aliceToken}` }
      }),
      httpClient.get('/users/me', {
        headers: { Authorization: `Bearer ${bobToken}` }
      })
    ]);

    _aliceUserId = aliceRes.data.id;
    bobUserId = bobRes.data.id;

    const orgs = await httpClient.get('/organizations', {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    acmeId = orgs.data.find((o: any) => o.slug === 'acme').id;
  });

  // ====== Chat Rooms ======

  describe('POST /chat/rooms', () => {
    it('should create a chat room', async () => {
      const res = await httpClient.post(
        '/chat/rooms',
        {
          name: 'E2E General Chat',
          organizationId: acmeId,
          description: 'Created by e2e test',
          isPublic: true
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      expect(res.data.name).toBe('E2E General Chat');
      roomId = res.data.id;
    });
  });

  describe('GET /chat/rooms', () => {
    it('should list rooms for organization', async () => {
      const res = await httpClient.get(`/chat/rooms?organizationId=${acmeId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.some((r: any) => r.id === roomId)).toBe(true);
    });
  });

  describe('GET /chat/rooms/:id', () => {
    it('should return room details', async () => {
      const res = await httpClient.get(`/chat/rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(roomId);
      expect(res.data.name).toBe('E2E General Chat');
    });
  });

  // ====== Messages ======

  describe('POST /chat/messages', () => {
    it('should send a message to a room', async () => {
      const res = await httpClient.post(
        '/chat/messages',
        { content: 'Hello from e2e!', roomId },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      expect(res.data.content).toBe('Hello from e2e!');
      messageId = res.data.id;
    });

    it('should send another message from a different user', async () => {
      const res = await httpClient.post(
        '/chat/messages',
        { content: 'Hey Alice!', roomId },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data.content).toBe('Hey Alice!');
    });
  });

  describe('GET /chat/rooms/:id/messages', () => {
    it('should return room messages', async () => {
      const res = await httpClient.get(`/chat/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should support limit parameter', async () => {
      const res = await httpClient.get(
        `/chat/rooms/${roomId}/messages?limit=1`,
        {
          headers: { Authorization: `Bearer ${aliceToken}` }
        }
      );

      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(1);
    });
  });

  // ====== Read Receipts ======

  describe('POST /chat/messages/:id/read', () => {
    it('should mark message as read', async () => {
      const res = await httpClient.post(
        `/chat/messages/${messageId}/read`,
        {},
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );
      expect(res.status).toBe(201);
    });
  });

  // ====== DM Threads ======

  describe('POST /chat/dms', () => {
    it('should start a DM thread', async () => {
      const res = await httpClient.post(
        '/chat/dms',
        { otherUserId: bobUserId },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      dmThreadId = res.data.id;
    });

    it('should return existing thread if already exists', async () => {
      const res = await httpClient.post(
        '/chat/dms',
        { otherUserId: bobUserId },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data.id).toBe(dmThreadId);
    });
  });

  describe('GET /chat/dms', () => {
    it('should list user DM threads', async () => {
      const res = await httpClient.get('/chat/dms', {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.some((dm: any) => dm.id === dmThreadId)).toBe(true);
    });
  });

  describe('GET /chat/dms/:id/messages', () => {
    it('should send and retrieve DM messages', async () => {
      // Send a DM
      await httpClient.post(
        '/chat/messages',
        { content: 'Hey Bob, DM test!', dmThreadId },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      // Get DM messages
      const res = await httpClient.get(`/chat/dms/${dmThreadId}/messages`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ====== Message Deletion ======

  describe('DELETE /chat/messages/:id', () => {
    it('should reject deletion by non-author with 403', async () => {
      const res = await httpClient.delete(`/chat/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${bobToken}` }
      });
      expect(res.status).toBe(403);
    });

    it('should allow author to delete own message', async () => {
      const res = await httpClient.delete(`/chat/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });
      expect(res.status).toBe(200);
    });

    it('should return 404 when deleting non-existent message', async () => {
      const res = await httpClient.delete(
        '/chat/messages/00000000-0000-0000-0000-000000000000',
        {
          headers: { Authorization: `Bearer ${aliceToken}` }
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET /chat/rooms/:id (edge cases)', () => {
    it('should return 404 for non-existent room', async () => {
      const res = await httpClient.get(
        '/chat/rooms/00000000-0000-0000-0000-000000000000',
        {
          headers: { Authorization: `Bearer ${aliceToken}` }
        }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /chat/rooms (validation)', () => {
    it('should return 400 when name is missing', async () => {
      const res = await httpClient.post(
        '/chat/rooms',
        { organizationId: acmeId },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when organizationId is missing', async () => {
      const res = await httpClient.post(
        '/chat/rooms',
        { name: 'Missing Org Room' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('POST /chat/messages (validation)', () => {
    it('should return 400 when content is missing', async () => {
      const res = await httpClient.post(
        '/chat/messages',
        { roomId },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });
  });
});
