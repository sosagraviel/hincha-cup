import jwtPkg from 'jsonwebtoken';
import type { JwtPayload, JwtHeader, Jwt } from 'jsonwebtoken';
import jwksRsa, { SigningKey } from 'jwks-rsa';

// Handle CJS/ESM interop: in ESM mode the default import may be double-wrapped
const jwt: typeof jwtPkg = (jwtPkg as any).default ?? jwtPkg;

const KEYCLOAK_INTERNAL_URL =
  process.env.KEYCLOAK_INTERNAL_URL || 'http://localhost:7080';
const KEYCLOAK_EXTERNAL_URL =
  process.env.KEYCLOAK_EXTERNAL_URL || 'http://localhost:7080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'gira';

const jwksClient = jwksRsa({
  jwksUri: `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000
});

async function getSigningKey(header: JwtHeader): Promise<string> {
  const key: SigningKey = await jwksClient.getSigningKey(header.kid);
  return key.getPublicKey();
}

/**
 * Validates a JWT token against the Keycloak JWKS endpoint. Verifies the RS256
 * signature, issuer, and expiration. Returns the decoded payload on success.
 *
 * @example
 * const payload = await validateToken(bearerToken);
 * console.log(payload.sub); // Keycloak user ID
 */
export async function validateToken(token: string): Promise<JwtPayload> {
  const decodedHeader = jwt.decode(token, { complete: true }) as Jwt | null;
  if (!decodedHeader || !decodedHeader.header) {
    throw new Error('Invalid token: unable to decode header');
  }

  const signingKey = await getSigningKey(decodedHeader.header);

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      signingKey,
      {
        issuer: `${KEYCLOAK_EXTERNAL_URL}/realms/${KEYCLOAK_REALM}`,
        algorithms: ['RS256']
      },
      (err, decoded) => {
        if (err) {
          return reject(err);
        }
        resolve(decoded as JwtPayload);
      }
    );
  });
}

/**
 * Decodes a JWT token WITHOUT signature verification. Used to quickly extract
 * the `sub` claim for Redis cache lookups before performing full validation.
 * Returns null if the token cannot be decoded.
 *
 * @example
 * const payload = decodeTokenUnsafe(bearerToken);
 * const userId = payload?.sub; // Keycloak user ID (unverified)
 */
export function decodeTokenUnsafe(token: string): JwtPayload | null {
  try {
    const decoded = jwt.decode(token);
    if (typeof decoded === 'string' || decoded === null) {
      return null;
    }
    return decoded as JwtPayload;
  } catch {
    return null;
  }
}
