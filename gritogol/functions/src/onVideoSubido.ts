import { onObjectFinalized } from "firebase-functions/v2/storage";
import type { StorageObjectData } from "firebase-functions/v2/storage";

/**
 * Triggered when a file is finalized in Cloud Storage.
 * Logs the upload; publication and counter updates are handled by
 * the moderarVideo callable after content moderation passes.
 */
export const onVideoSubido = onObjectFinalized(
  { region: "us-central1" },
  async (event: { data: StorageObjectData }) => {
    const objectName = event.data.name;

    if (!objectName?.startsWith("videos-crudos/")) {
      return;
    }

    console.log("Video subido, pendiente de moderación:", objectName);
  },
);
