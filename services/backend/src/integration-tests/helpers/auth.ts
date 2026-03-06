import axios from 'axios';

const KEYCLOAK_URL =
  process.env.KEYCLOAK_EXTERNAL_URL || 'http://localhost:7080';
const REALM = process.env.KEYCLOAK_REALM || 'gira';
const TEST_CLIENT = process.env.KEYCLOAK_TEST_CLIENT_NAME || 'postman';
const TEST_SECRET = process.env.KEYCLOAK_TEST_CLIENT_SECRET || 'dumbsecret';

const TOKEN_URL = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;

/** Authenticate a user via Keycloak password grant and return the access token. */
export async function getAccessToken(
  email: string,
  password: string
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: TEST_CLIENT,
    client_secret: TEST_SECRET,
    username: email,
    password
  });

  const { data } = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return data.access_token;
}

/** Pre-defined test users matching seed data. */
export const TEST_USERS = {
  admin: { email: 'admin@gira.com', password: 'admin123' },
  alice: { email: 'alice@acme.com', password: 'member123' },
  bob: { email: 'bob@acme.com', password: 'member123' },
  carol: { email: 'carol@widgets.com', password: 'member123' }
} as const;
