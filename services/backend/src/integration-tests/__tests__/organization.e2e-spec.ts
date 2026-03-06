import { httpClient } from '../helpers/http-client';
import { getAccessToken, TEST_USERS } from '../helpers/auth';

describe('Organization API (e2e)', () => {
  let adminToken: string;
  let aliceToken: string;
  let bobToken: string;
  let carolToken: string;

  // IDs discovered from seeded data
  let acmeId: string;
  let widgetsId: string;
  let aliceUserId: string;
  let bobUserId: string;

  beforeAll(async () => {
    [adminToken, aliceToken, bobToken, carolToken] = await Promise.all([
      getAccessToken(TEST_USERS.admin.email, TEST_USERS.admin.password),
      getAccessToken(TEST_USERS.alice.email, TEST_USERS.alice.password),
      getAccessToken(TEST_USERS.bob.email, TEST_USERS.bob.password),
      getAccessToken(TEST_USERS.carol.email, TEST_USERS.carol.password)
    ]);

    // Discover seeded IDs
    const aliceProfile = await httpClient.get('/users/me', {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    aliceUserId = aliceProfile.data.id;

    const bobProfile = await httpClient.get('/users/me', {
      headers: { Authorization: `Bearer ${bobToken}` }
    });
    bobUserId = bobProfile.data.id;

    // Get org IDs from alice's org list (she's in both)
    const orgs = await httpClient.get('/organizations', {
      headers: { Authorization: `Bearer ${aliceToken}` }
    });

    for (const org of orgs.data) {
      if (org.slug === 'acme') acmeId = org.id;
      if (org.slug === 'widgets') widgetsId = org.id;
    }
  });

  describe('GET /organizations', () => {
    it('should list organizations for admin', async () => {
      const res = await httpClient.get('/organizations', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      // Admin is a member of Acme
      expect(res.data.some((o: any) => o.slug === 'acme')).toBe(true);
    });

    it('should list only orgs the user belongs to', async () => {
      const res = await httpClient.get('/organizations', {
        headers: { Authorization: `Bearer ${carolToken}` }
      });

      expect(res.status).toBe(200);
      // Carol is only in Widget Inc
      expect(res.data).toHaveLength(1);
      expect(res.data[0].slug).toBe('widgets');
    });
  });

  describe('POST /organizations (super_admin only)', () => {
    let _testOrgId: string;

    it('should allow super_admin to create an organization', async () => {
      const uniqueSlug = `test-org-e2e-${Date.now()}`;
      const res = await httpClient.post(
        '/organizations',
        {
          name: 'Test Org E2E',
          slug: uniqueSlug,
          description: 'Created by integration tests'
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      expect(res.data.name).toBe('Test Org E2E');
      expect(res.data.slug).toBe(uniqueSlug);
      _testOrgId = res.data.id;
    });

    it('should reject creation by non-super_admin', async () => {
      const res = await httpClient.post(
        '/organizations',
        {
          name: 'Unauthorized Org',
          slug: `unauth-org-${Date.now()}`
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(403);
    });

    it('should return 409 when slug is already taken', async () => {
      const res = await httpClient.post(
        '/organizations',
        {
          name: 'Duplicate Slug Org',
          slug: 'acme' // already exists from seed data
        },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(409);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await httpClient.post(
        '/organizations',
        { description: 'Missing name and slug' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      expect(res.status).toBe(400);
    });

    afterAll(async () => {
      // Clean up: remove test org by directly using the DB (no delete endpoint)
      // The org will be left as-is since there's no delete org endpoint
    });
  });

  describe('GET /organizations/:id', () => {
    it('should return org details for a member', async () => {
      const res = await httpClient.get(`/organizations/${acmeId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` }
      });

      expect(res.status).toBe(200);
      expect(res.data.slug).toBe('acme');
      expect(res.data.name).toBe('Acme Corp');
    });

    it('should return 403 for non-member', async () => {
      // Carol is not in Acme
      const res = await httpClient.get(`/organizations/${acmeId}`, {
        headers: { Authorization: `Bearer ${carolToken}` }
      });
      expect(res.status).toBe(403);
    });

    it('should return 403 for non-existent organization (guard fires before service)', async () => {
      // The OrgMemberGuard checks membership first — if the org doesn't exist,
      // no membership record will be found → 403 before the service can 404.
      const res = await httpClient.get(
        '/organizations/00000000-0000-0000-0000-000000000000',
        {
          headers: { Authorization: `Bearer ${adminToken}` }
        }
      );
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /organizations/:id', () => {
    it('should allow owner to update org', async () => {
      // Alice is owner of Acme
      const res = await httpClient.patch(
        `/organizations/${acmeId}`,
        { description: 'Updated by e2e test' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.description).toBe('Updated by e2e test');

      // Restore
      await httpClient.patch(
        `/organizations/${acmeId}`,
        { description: 'A leading technology company' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
    });

    it('should allow admin to update org', async () => {
      // Admin is admin role in Acme
      const res = await httpClient.patch(
        `/organizations/${acmeId}`,
        { description: 'Updated by admin e2e' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.description).toBe('Updated by admin e2e');

      // Restore
      await httpClient.patch(
        `/organizations/${acmeId}`,
        { description: 'A leading technology company' },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
    });

    it('should reject update by member (not owner/admin)', async () => {
      // Bob is member role in Acme
      const res = await httpClient.patch(
        `/organizations/${acmeId}`,
        { description: 'Should fail' },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );
      expect(res.status).toBe(403);
    });
  });

  describe('POST /organizations/:id/members', () => {
    it('should allow owner to add a member', async () => {
      // Carol is owner of Widgets. Add bob to widgets.
      const res = await httpClient.post(
        `/organizations/${widgetsId}/members`,
        { userId: bobUserId, role: 'member' },
        { headers: { Authorization: `Bearer ${carolToken}` } }
      );

      expect(res.status).toBe(201);
      expect(res.data).toHaveProperty('id');
      expect(res.data.role).toBe('member');
    });

    it('should reject adding member by a regular member', async () => {
      // Bob is member in Acme, cannot add members
      const res = await httpClient.post(
        `/organizations/${acmeId}/members`,
        { userId: 'some-user-id', role: 'member' },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );
      expect(res.status).toBe(403);
    });

    it('should return 409 when adding a user who is already a member', async () => {
      // Bob is already a member of Acme — adding again should conflict
      const res = await httpClient.post(
        `/organizations/${acmeId}/members`,
        { userId: bobUserId, role: 'member' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(409);
    });

    it('should return 400 when role value is invalid', async () => {
      const res = await httpClient.post(
        `/organizations/${acmeId}/members`,
        { userId: aliceUserId, role: 'super_god' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
      expect(res.status).toBe(400);
    });

    afterAll(async () => {
      // Clean up: remove bob from widgets
      await httpClient.delete(
        `/organizations/${widgetsId}/members/${bobUserId}`,
        {
          headers: { Authorization: `Bearer ${carolToken}` }
        }
      );
    });
  });

  describe('PATCH /organizations/:id/members/:userId', () => {
    it('should allow owner to update member role', async () => {
      // Alice is owner of Acme, update bob's role
      const res = await httpClient.patch(
        `/organizations/${acmeId}/members/${bobUserId}`,
        { role: 'admin' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(res.status).toBe(200);
      expect(res.data.role).toBe('admin');

      // Restore to member
      await httpClient.patch(
        `/organizations/${acmeId}/members/${bobUserId}`,
        { role: 'member' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );
    });
  });

  describe('DELETE /organizations/:id/members/:userId', () => {
    it('should reject member removal by non-owner/admin', async () => {
      // Bob is member in Acme, cannot remove members
      const res = await httpClient.delete(
        `/organizations/${acmeId}/members/${aliceUserId}`,
        {
          headers: { Authorization: `Bearer ${bobToken}` }
        }
      );
      expect(res.status).toBe(403);
    });
  });
});
