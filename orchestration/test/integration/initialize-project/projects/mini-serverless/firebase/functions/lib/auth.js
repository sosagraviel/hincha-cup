// Lightweight wrapper around firebase-admin.auth() — exists so tests
// can import a stable surface without pulling the full admin SDK.
import * as admin from 'firebase-admin';

export async function verifyIdToken(idToken) {
  return admin.auth().verifyIdToken(idToken);
}

export async function createUser({ email, displayName }) {
  return admin.auth().createUser({ email, displayName });
}
