import * as admin from 'firebase-admin';

export async function audit(event, payload) {
  await admin.firestore().collection('audit').add({
    event,
    payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
