import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import type { StorageObjectData } from "firebase-functions/v2/storage";

/**
 * Triggered when a file is finalized in Cloud Storage.
 * Filters to the `videos-crudos/` path prefix, then atomically assigns
 * a sequential `gritoNumero`, transitions the video to "publicado", and
 * increments impact counters on the match document (GG-07).
 */
export const onVideoSubido = onObjectFinalized(
  { region: "us-central1" },
  async (event: { data: StorageObjectData }) => {
    const objectName = event.data.name;

    if (!objectName?.startsWith("videos-crudos/")) {
      return;
    }

    const segments = objectName.split("/");
    const partidoId = segments[1];
    const fileName = segments[segments.length - 1];

    if (!partidoId || !fileName) {
      console.error("Could not parse path:", objectName);
      return;
    }

    const videoId = fileName.replace(/\.webm$/, "");

    if (!videoId) {
      console.error("Could not extract videoId from fileName:", fileName);
      return;
    }

    const db = admin.firestore();
    const videoRef = db.doc(`videos/${videoId}`);
    const counterRef = db.doc("counters/videos");
    const partidoRef = db.doc(`partidos/${partidoId}`);

    await db.runTransaction(async (tx) => {
      const videoSnap = await tx.get(videoRef);
      if (!videoSnap.exists) {
        console.error("Video doc not found:", videoId);
        return;
      }

      const counterSnap = await tx.get(counterRef);
      const currentCount: number = counterSnap.exists
        ? ((counterSnap.data() as { gritoNumero?: number })["gritoNumero"] ??
          0)
        : 0;

      const gritoNumero = currentCount + 1;
      const partidoSnap = await tx.get(partidoRef);
      const festejosPrevios: number = partidoSnap.exists
        ? ((partidoSnap.data() as { festejosPublicados?: number })
            .festejosPublicados ?? 0)
        : 0;
      const festejosNuevos = festejosPrevios + 1;

      tx.set(counterRef, { gritoNumero }, { merge: true });

      tx.update(videoRef, {
        estado: "publicado",
        gritoNumero,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (partidoSnap.exists) {
        const updates: Record<
          string,
          admin.firestore.FieldValue | number
        > = {
          festejosPublicados: admin.firestore.FieldValue.increment(1),
          pelotasDesbloqueadas: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (festejosNuevos % 10 === 0) {
          updates["becasDesbloqueadas"] =
            admin.firestore.FieldValue.increment(1);
        }

        if (festejosNuevos % 20 === 0) {
          updates["escuelasBeneficiadas"] =
            admin.firestore.FieldValue.increment(1);
        }

        tx.update(partidoRef, updates);
      }
    });
  },
);
