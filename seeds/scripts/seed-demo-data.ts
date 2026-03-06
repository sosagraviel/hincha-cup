import * as dotenv from 'dotenv';
import { Client } from 'pg';
import KcAdminClient from '@keycloak/keycloak-admin-client';

// Load environment from provided file path
const envFile = process.argv[2] || '.env.development';
dotenv.config({ path: envFile });

interface DemoUser {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  keycloakRole: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'alice@acme.com',
    firstName: 'Alice',
    lastName: 'Johnson',
    password: 'member123',
    keycloakRole: 'member',
  },
  {
    email: 'bob@acme.com',
    firstName: 'Bob',
    lastName: 'Smith',
    password: 'member123',
    keycloakRole: 'member',
  },
  {
    email: 'carol@widgets.com',
    firstName: 'Carol',
    lastName: 'Williams',
    password: 'member123',
    keycloakRole: 'member',
  },
];

async function main() {
  console.log(`Loading env from: ${envFile}`);

  const realm = process.env.KEYCLOAK_REALM || 'gira';
  const keycloakUrl = process.env.KEYCLOAK_EXTERNAL_URL || 'http://localhost:7080';

  // Connect to Keycloak
  const kcAdmin = new KcAdminClient({
    baseUrl: keycloakUrl,
    realmName: 'master',
  });

  await kcAdmin.auth({
    grantType: 'password',
    clientId: 'admin-cli',
    username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
  });

  kcAdmin.setConfig({ realmName: realm });

  // Connect to PostgreSQL
  const db = new Client({
    host: process.env.DB_HOST === 'db' ? 'localhost' : process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await db.connect();
  console.log('Connected to database');

  try {
    // 1. Create Keycloak users and DB users
    console.log('\n--- Creating users ---');
    const userIds: Record<string, string> = {};

    // Ensure admin user exists in DB
    const adminKcUser = await findOrCreateKcUser(kcAdmin, {
      email: 'admin@gira.com',
      firstName: 'Admin',
      lastName: 'User',
      password: 'admin123',
      keycloakRole: 'super_admin',
    });
    userIds['admin@gira.com'] = await upsertDbUser(db, {
      externalId: adminKcUser.id,
      email: 'admin@gira.com',
      fullName: 'Admin User',
    });

    for (const user of DEMO_USERS) {
      const kcUser = await findOrCreateKcUser(kcAdmin, user);
      const role = await kcAdmin.roles.findOneByName({ name: user.keycloakRole });
      if (role) {
        try {
          await kcAdmin.users.addRealmRoleMappings({
            id: kcUser.id,
            roles: [{ id: role.id!, name: role.name! }],
          });
        } catch {
          // Role already assigned
        }
      }

      userIds[user.email] = await upsertDbUser(db, {
        externalId: kcUser.id,
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`,
      });
    }

    // 2. Create organizations
    console.log('\n--- Creating organizations ---');
    const acmeId = await upsertOrg(db, {
      name: 'Acme Corp',
      slug: 'acme',
      description: 'A leading technology company',
    });
    const widgetsId = await upsertOrg(db, {
      name: 'Widget Inc',
      slug: 'widgets',
      description: 'Innovative widget manufacturing',
    });

    // 3. Create organization members
    console.log('\n--- Adding organization members ---');
    await upsertOrgMember(db, userIds['alice@acme.com'], acmeId, 'owner');
    await upsertOrgMember(db, userIds['bob@acme.com'], acmeId, 'member');
    await upsertOrgMember(db, userIds['admin@gira.com'], acmeId, 'admin');
    await upsertOrgMember(db, userIds['carol@widgets.com'], widgetsId, 'owner');
    await upsertOrgMember(db, userIds['alice@acme.com'], widgetsId, 'member');

    // 4. Create projects
    console.log('\n--- Creating projects ---');
    const pltId = await upsertProject(db, acmeId, {
      name: 'Platform Redesign',
      key: 'PLT',
      description: 'Complete platform redesign with modern stack',
    });
    const mobId = await upsertProject(db, acmeId, {
      name: 'Mobile App',
      key: 'MOB',
      description: 'Cross-platform mobile application',
    });
    const dshId = await upsertProject(db, widgetsId, {
      name: 'Dashboard',
      key: 'DSH',
      description: 'Analytics dashboard for widget metrics',
    });

    // 5. Create project members
    console.log('\n--- Adding project members ---');
    await upsertProjectMember(db, userIds['alice@acme.com'], pltId, 'admin');
    await upsertProjectMember(db, userIds['bob@acme.com'], pltId, 'member');
    await upsertProjectMember(db, userIds['admin@gira.com'], pltId, 'member');
    await upsertProjectMember(db, userIds['bob@acme.com'], mobId, 'admin');
    await upsertProjectMember(db, userIds['alice@acme.com'], mobId, 'member');
    await upsertProjectMember(db, userIds['carol@widgets.com'], dshId, 'admin');
    await upsertProjectMember(db, userIds['alice@acme.com'], dshId, 'member');

    // 6. Create tickets
    console.log('\n--- Creating tickets ---');
    const alice = userIds['alice@acme.com'];
    const bob = userIds['bob@acme.com'];
    const carol = userIds['carol@widgets.com'];

    // PLT tickets
    await upsertTicket(db, pltId, 1, { title: 'Implement login page', status: 'done', priority: 'high', assigneeId: alice, reporterId: alice });
    await upsertTicket(db, pltId, 2, { title: 'Set up CI/CD pipeline', status: 'in_review', priority: 'high', assigneeId: bob, reporterId: alice });
    await upsertTicket(db, pltId, 3, { title: 'Design system components', status: 'in_progress', priority: 'medium', assigneeId: alice, reporterId: bob });
    await upsertTicket(db, pltId, 4, { title: 'Database schema design', status: 'todo', priority: 'high', assigneeId: bob, reporterId: alice });
    await upsertTicket(db, pltId, 5, { title: 'API documentation', status: 'backlog', priority: 'low', reporterId: alice });
    await upsertTicket(db, pltId, 6, { title: 'User profile page', status: 'backlog', priority: 'medium', reporterId: bob });
    await upsertTicket(db, pltId, 7, { title: 'Email notification service', status: 'todo', priority: 'medium', assigneeId: alice, reporterId: bob });
    await upsertTicket(db, pltId, 8, { title: 'Performance optimization', status: 'backlog', priority: 'low', reporterId: alice });

    // MOB tickets
    await upsertTicket(db, mobId, 1, { title: 'App navigation setup', status: 'done', priority: 'high', assigneeId: bob, reporterId: bob });
    await upsertTicket(db, mobId, 2, { title: 'Push notifications', status: 'in_progress', priority: 'high', assigneeId: bob, reporterId: alice });
    await upsertTicket(db, mobId, 3, { title: 'Offline mode', status: 'todo', priority: 'medium', reporterId: bob });
    await upsertTicket(db, mobId, 4, { title: 'App store submission', status: 'backlog', priority: 'low', reporterId: alice });

    // DSH tickets
    await upsertTicket(db, dshId, 1, { title: 'Dashboard layout', status: 'in_progress', priority: 'high', assigneeId: carol, reporterId: carol });
    await upsertTicket(db, dshId, 2, { title: 'Widget analytics charts', status: 'todo', priority: 'medium', assigneeId: alice, reporterId: carol });
    await upsertTicket(db, dshId, 3, { title: 'Export to CSV', status: 'backlog', priority: 'low', reporterId: carol });
    await upsertTicket(db, dshId, 4, { title: 'Real-time data updates', status: 'backlog', priority: 'critical', reporterId: carol });

    // 7. Create comments
    console.log('\n--- Creating comments ---');
    const pltTickets = await db.query(`SELECT id, ticket_number FROM tickets WHERE project_id = $1 ORDER BY ticket_number`, [pltId]);
    if (pltTickets.rows.length > 0) {
      await upsertComment(db, pltTickets.rows[0].id, alice, 'Login page is complete with Keycloak integration.');
      await upsertComment(db, pltTickets.rows[0].id, bob, 'Looks great! LGTM.');
      await upsertComment(db, pltTickets.rows[1].id, bob, 'CI pipeline is running on GitHub Actions. Need review.');
      await upsertComment(db, pltTickets.rows[2].id, alice, 'Working on the button and input components first.');
    }

    console.log('\n=== Seed completed successfully! ===');
    console.log('Users:');
    console.log('  admin@gira.com / admin123 (super_admin)');
    console.log('  alice@acme.com / member123 (member)');
    console.log('  bob@acme.com / member123 (member)');
    console.log('  carol@widgets.com / member123 (member)');
  } finally {
    await db.end();
  }
}

async function findOrCreateKcUser(
  kcAdmin: KcAdminClient,
  user: DemoUser,
): Promise<{ id: string }> {
  const existing = await kcAdmin.users.find({ email: user.email, exact: true });
  if (existing.length > 0) {
    console.log(`  KC user "${user.email}" already exists`);
    return { id: existing[0].id! };
  }

  const created = await kcAdmin.users.create({
    username: user.email,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    enabled: true,
    emailVerified: true,
    credentials: [{ type: 'password', value: user.password, temporary: false }],
  });
  console.log(`  KC user "${user.email}" created`);
  return { id: created.id };
}

async function upsertDbUser(
  db: Client,
  data: { externalId: string; email: string; fullName: string },
): Promise<string> {
  const result = await db.query(
    `INSERT INTO users (external_id, email, full_name, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (external_id) DO UPDATE SET email = $2, full_name = $3
     RETURNING id`,
    [data.externalId, data.email, data.fullName],
  );
  console.log(`  DB user "${data.email}" upserted`);
  return result.rows[0].id;
}

async function upsertOrg(
  db: Client,
  data: { name: string; slug: string; description: string },
): Promise<string> {
  const result = await db.query(
    `INSERT INTO organizations (name, slug, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = $1, description = $3
     RETURNING id`,
    [data.name, data.slug, data.description],
  );
  console.log(`  Organization "${data.name}" upserted`);
  return result.rows[0].id;
}

async function upsertOrgMember(
  db: Client,
  userId: string,
  orgId: string,
  role: string,
): Promise<void> {
  await db.query(
    `INSERT INTO organization_members (user_id, organization_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = $3`,
    [userId, orgId, role],
  );
}

async function upsertProject(
  db: Client,
  orgId: string,
  data: { name: string; key: string; description: string },
): Promise<string> {
  const result = await db.query(
    `INSERT INTO projects (organization_id, name, key, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key) DO UPDATE SET name = $2, description = $4
     RETURNING id`,
    [orgId, data.name, data.key, data.description],
  );
  console.log(`  Project "${data.name}" (${data.key}) upserted`);
  return result.rows[0].id;
}

async function upsertProjectMember(
  db: Client,
  userId: string,
  projectId: string,
  role: string,
): Promise<void> {
  await db.query(
    `INSERT INTO project_members (user_id, project_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, project_id) DO UPDATE SET role = $3`,
    [userId, projectId, role],
  );
}

async function upsertTicket(
  db: Client,
  projectId: string,
  ticketNumber: number,
  data: {
    title: string;
    status: string;
    priority: string;
    assigneeId?: string;
    reporterId: string;
  },
): Promise<string> {
  const result = await db.query(
    `INSERT INTO tickets (project_id, ticket_number, title, status, priority, assignee_id, reporter_id, "order")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $2)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [projectId, ticketNumber, data.title, data.status, data.priority, data.assigneeId || null, data.reporterId],
  );
  if (result.rows.length > 0) {
    console.log(`  Ticket #${ticketNumber}: "${data.title}" created`);
    return result.rows[0].id;
  }
  // Already exists, fetch it
  const existing = await db.query(
    `SELECT id FROM tickets WHERE project_id = $1 AND ticket_number = $2`,
    [projectId, ticketNumber],
  );
  return existing.rows[0]?.id;
}

async function upsertComment(
  db: Client,
  ticketId: string,
  authorId: string,
  content: string,
): Promise<void> {
  // Check if comment with same content already exists
  const existing = await db.query(
    `SELECT id FROM comments WHERE ticket_id = $1 AND author_id = $2 AND content = $3`,
    [ticketId, authorId, content],
  );
  if (existing.rows.length > 0) return;

  await db.query(
    `INSERT INTO comments (ticket_id, author_id, content) VALUES ($1, $2, $3)`,
    [ticketId, authorId, content],
  );
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
