/**
 * Keycloak Realm Initialization Script
 *
 * Bootstraps the application realm with all required clients, roles, and seed users.
 * Idempotent — safe to run multiple times; existing resources are skipped or updated.
 *
 * Run via: `pnpm --filter ./services/keycloak run init`
 * Called automatically during: `make setup`
 *
 * Initialization sequence:
 *   1. Authenticate to Keycloak master realm (admin-cli)
 *   2. Create the application realm (e.g., "gira")
 *   3. Create realm roles: super_admin, org_admin, member
 *   4. Set "member" as the default role for new users
 *   5. Create web-frontend client (public, PKCE for SPA)
 *   6. Create backend-api client (confidential, service account)
 *   7. Optionally create a test client for integration testing
 *   8. Create admin user with super_admin role
 */
import KcAdminClient from '@keycloak/keycloak-admin-client';
import * as dotenv from 'dotenv';
import ClientRepresentation from '@keycloak/keycloak-admin-client/lib/defs/clientRepresentation';
import RoleRepresentation from '@keycloak/keycloak-admin-client/lib/defs/roleRepresentation';

dotenv.config({ path: `../../.env.${process.env.NODE_ENV || 'development'}` });

const REALM_NAME = process.env.KEYCLOAK_REALM || 'gira';
const WEB_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'web-frontend';
const BACKEND_CLIENT_ID = process.env.KEYCLOAK_BACKEND_CLIENT_ID || 'backend-api';
const BACKEND_CLIENT_SECRET = process.env.KEYCLOAK_BACKEND_CLIENT_SECRET || 'backend-api-secret';
const ROOT_URL = process.env.ROOT_URL || 'http://localhost:2712';
const REDIRECT_URIS = (process.env.REDIRECT_URIS || 'http://localhost:2712/*').split(',');
const WEB_ORIGINS = (process.env.WEB_ORIGINS || 'http://localhost:2712').split(',');

const REALM_ROLES = ['super_admin', 'org_admin', 'member'] as const;
const DEFAULT_ROLE = 'member';

const ADMIN_USER = {
  username: 'admin@gira.com',
  email: 'admin@gira.com',
  firstName: 'Admin',
  lastName: 'User',
  password: 'admin123',
  roles: ['super_admin'],
};

async function initKeycloak() {
  const kcAdminClient = new KcAdminClient({
    baseUrl: process.env.KEYCLOAK_EXTERNAL_URL || 'http://localhost:7080',
    realmName: 'master',
  });

  try {
    await kcAdminClient.auth({
      grantType: 'password',
      clientId: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
    });

    // 1. Create realm
    await createRealm(kcAdminClient);

    // Switch to new realm
    kcAdminClient.setConfig({ realmName: REALM_NAME });

    // 2. Create realm roles
    await createRealmRoles(kcAdminClient);

    // 3. Set default role
    await setDefaultRole(kcAdminClient);

    // 4. Create web-frontend client (public, PKCE)
    await createOrUpdateClient(kcAdminClient, getWebFrontendClient());

    // 5. Create backend-api client (confidential, service account)
    await createOrUpdateClient(kcAdminClient, getBackendApiClient());

    // 6. Create test client (if configured)
    if (process.env.KEYCLOAK_TEST_CLIENT_NAME) {
      await createOrUpdateClient(kcAdminClient, getTestClient());
    }

    // 7. Create admin user
    await createAdminUser(kcAdminClient);

    console.log('\nKeycloak initialization completed successfully!');
    console.log(`  Realm: ${REALM_NAME}`);
    console.log(`  Admin: ${ADMIN_USER.email} / ${ADMIN_USER.password}`);
    console.log(`  Roles: ${REALM_ROLES.join(', ')}`);
  } catch (error) {
    console.error('Error initializing Keycloak:', error);
    process.exit(1);
  }
}

async function createRealm(kcAdminClient: KcAdminClient) {
  try {
    const existingRealms = await kcAdminClient.realms.find();
    const realmExists = existingRealms.some((r) => r.realm === REALM_NAME);

    if (realmExists) {
      console.log(`Realm "${REALM_NAME}" already exists`);
      return;
    }

    await kcAdminClient.realms.create({
      realm: REALM_NAME,
      enabled: true,
      displayName: 'Gira',
      loginWithEmailAllowed: true,
      registrationAllowed: false,
      resetPasswordAllowed: true,
      rememberMe: true,
    });
    console.log(`Realm "${REALM_NAME}" created successfully`);
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log(`Realm "${REALM_NAME}" already exists`);
    } else {
      throw error;
    }
  }
}

async function createRealmRoles(kcAdminClient: KcAdminClient) {
  for (const roleName of REALM_ROLES) {
    try {
      await kcAdminClient.roles.create({ name: roleName });
      console.log(`Role "${roleName}" created`);
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log(`Role "${roleName}" already exists`);
      } else {
        throw error;
      }
    }
  }
}

async function setDefaultRole(kcAdminClient: KcAdminClient) {
  try {
    const defaultRoleComposite = await kcAdminClient.roles.findOneByName({
      name: 'default-roles-' + REALM_NAME,
    });

    if (defaultRoleComposite) {
      const memberRole = await kcAdminClient.roles.findOneByName({
        name: DEFAULT_ROLE,
      });
      if (memberRole) {
        try {
          await kcAdminClient.roles.createComposite(
            { roleId: defaultRoleComposite.id! },
            [memberRole as RoleRepresentation],
          );
          console.log(`Default role set to "${DEFAULT_ROLE}"`);
        } catch {
          console.log(`Default role "${DEFAULT_ROLE}" already assigned`);
        }
      }
    }
  } catch (error) {
    console.log('Could not set default role (non-critical):', error);
  }
}

function getWebFrontendClient(): ClientRepresentation {
  return {
    clientId: WEB_CLIENT_ID,
    name: 'Web Frontend',
    description: 'Public client for SPA with PKCE',
    rootUrl: ROOT_URL,
    baseUrl: ROOT_URL,
    redirectUris: REDIRECT_URIS,
    webOrigins: WEB_ORIGINS,
    enabled: true,
    publicClient: true,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    protocol: 'openid-connect',
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': REDIRECT_URIS.join('##'),
    },
    defaultClientScopes: ['web-origins', 'acr', 'profile', 'roles', 'basic', 'email'],
  };
}

function getBackendApiClient(): ClientRepresentation {
  return {
    clientId: BACKEND_CLIENT_ID,
    name: 'Backend API',
    description: 'Confidential client for backend service account',
    enabled: true,
    publicClient: false,
    clientAuthenticatorType: 'client-secret',
    secret: BACKEND_CLIENT_SECRET,
    standardFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: true,
    protocol: 'openid-connect',
    defaultClientScopes: ['web-origins', 'acr', 'profile', 'roles', 'basic', 'email'],
  };
}

function getTestClient(): ClientRepresentation {
  return {
    clientId: process.env.KEYCLOAK_TEST_CLIENT_NAME!,
    name: process.env.KEYCLOAK_TEST_CLIENT_NAME!,
    description: 'Test client for integration testing (password grant)',
    rootUrl: ROOT_URL,
    baseUrl: ROOT_URL,
    redirectUris: REDIRECT_URIS,
    webOrigins: WEB_ORIGINS,
    enabled: true,
    publicClient: false,
    clientAuthenticatorType: 'client-secret',
    secret: process.env.KEYCLOAK_TEST_CLIENT_SECRET || 'dumbsecret',
    standardFlowEnabled: false,
    directAccessGrantsEnabled: true,
    serviceAccountsEnabled: true,
    protocol: 'openid-connect',
    defaultClientScopes: ['web-origins', 'acr', 'profile', 'roles', 'basic', 'email'],
  };
}

async function createOrUpdateClient(
  kcAdminClient: KcAdminClient,
  client: ClientRepresentation,
) {
  try {
    await kcAdminClient.clients.create(client);
    console.log(`Client "${client.clientId}" created`);
  } catch (error: any) {
    if (error.response?.status === 409) {
      const existingClient = await kcAdminClient.clients.find({
        clientId: client.clientId,
      });
      if (existingClient.length > 0) {
        await kcAdminClient.clients.update({ id: existingClient[0].id! }, client);
        console.log(`Client "${client.clientId}" updated`);
      }
    } else {
      throw error;
    }
  }
}

async function createAdminUser(kcAdminClient: KcAdminClient) {
  try {
    const existingUsers = await kcAdminClient.users.find({
      email: ADMIN_USER.email,
    });

    let userId: string;

    if (existingUsers.length > 0) {
      userId = existingUsers[0].id!;
      console.log(`Admin user "${ADMIN_USER.email}" already exists`);
    } else {
      const createdUser = await kcAdminClient.users.create({
        username: ADMIN_USER.username,
        email: ADMIN_USER.email,
        firstName: ADMIN_USER.firstName,
        lastName: ADMIN_USER.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [
          {
            type: 'password',
            value: ADMIN_USER.password,
            temporary: false,
          },
        ],
      });
      userId = createdUser.id;
      console.log(`Admin user "${ADMIN_USER.email}" created`);
    }

    // Assign roles
    for (const roleName of ADMIN_USER.roles) {
      const role = await kcAdminClient.roles.findOneByName({ name: roleName });
      if (role) {
        try {
          await kcAdminClient.users.addRealmRoleMappings({
            id: userId,
            roles: [{ id: role.id!, name: role.name! }],
          });
          console.log(`Role "${roleName}" assigned to admin user`);
        } catch {
          console.log(`Role "${roleName}" already assigned to admin user`);
        }
      }
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}

initKeycloak();
