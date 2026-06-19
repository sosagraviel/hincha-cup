import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

/**
 * Hourly job that closes any active competitions whose `cierraEn` timestamp
 * has passed, and records the winning video (most aplausos) on the document.
 */
export const cerrarCompetencias = onSchedule(
  { schedule: "every 1 hours", region: "us-central1" },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const snap = await db
      .collection("competencias")
      .where("estado", "==", "activa")
      .where("cierraEn", "<=", now)
      .get();

    if (snap.empty) return;

    for (const compDoc of snap.docs) {
      const { eventoId } = compDoc.data() as { eventoId: string };

      const videosSnap = await db
        .collection("videos")
        .where("eventoId", "==", eventoId)
        .where("estado", "==", "publicado")
        .get();

      if (videosSnap.empty) {
        await compDoc.ref.update({
          estado: "cerrada",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        continue;
      }

      let ganadorDoc = videosSnap.docs[0]!;
      for (const vDoc of videosSnap.docs) {
        const apl = (vDoc.data()["aplausos"] as number) ?? 0;
        const bestApl = (ganadorDoc.data()["aplausos"] as number) ?? 0;
        if (apl > bestApl) ganadorDoc = vDoc;
      }

      await compDoc.ref.update({
        estado: "cerrada",
        ganadorVideoId: ganadorDoc.id,
        ganadorUserId: ganadorDoc.data()["userId"] as string,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  },
);
