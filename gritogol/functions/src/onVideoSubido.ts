import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import type { StorageObjectData } from "firebase-functions/v2/storage";

/**
 * Triggered when a file is finalized in Cloud Storage.
 * Filters to the `videos-crudos/` path prefix, then atomically assigns
 * a sequential `gritoNumero` and transitions the video to "publicado".
 *
 * Uses the Admin SDK so it bypasses Firestore security rules.
 */
export const onVideoSubido = onObjectFinalized(
  { region: "us-central1" },
  async (event: { data: StorageObjectData }) => {
    const objectName = event.data.name;

    if (!objectName?.startsWith("videos-crudos/")) {
      return;
    }

    const segments = objectName.split("/");
    const fileName = segments[segments.length - 1];

    if (!fileName) {
      console.error("Could not parse fileName from path:", objectName);
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

    await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);

      const currentCount: number = counterSnap.exists
        ? ((counterSnap.data() as { gritoNumero?: number })["gritoNumero"] ??
          0)
        : 0;

      const gritoNumero = currentCount + 1;

      tx.set(counterRef, { gritoNumero }, { merge: true });

      tx.update(videoRef, {
        estado: "publicado",
        gritoNumero,
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  },
);
