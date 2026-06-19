import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import type { StorageObjectData } from "firebase-functions/v2/storage";

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

    const videoId = fileName.replace(/\.webm$/, "").replace(/\.mp4$/, "");

    if (!videoId) {
      console.error("Could not extract videoId from fileName:", fileName);
      return;
    }

    const db = admin.firestore();
    const videoRef = db.doc(`videos/${videoId}`);
    const videoSnap = await videoRef.get();

    if (!videoSnap.exists) {
      console.error("Video doc not found:", videoId);
      return;
    }

    console.log(`Video ${videoId} uploaded, awaiting moderation.`);
  },
);
