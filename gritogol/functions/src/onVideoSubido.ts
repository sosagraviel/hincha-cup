import * as admin from "firebase-admin";
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

    let capturedEventoId: string | undefined;

    await db.runTransaction(async (tx) => {
      const videoSnap = await tx.get(videoRef);
      if (!videoSnap.exists) {
        console.error("Video doc not found:", videoId);
        return;
      }

      const videoData = videoSnap.data() as {
        eventoId: string;
        partidoId: string;
        [key: string]: unknown;
      };
      capturedEventoId = videoData.eventoId;

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
        competenciaId: capturedEventoId,
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

    if (capturedEventoId) {
      const eventoId = capturedEventoId;
      const compRef = db.doc(`competencias/${eventoId}`);
      const compSnap = await compRef.get();

      const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();

      if (!compSnap.exists) {
        await compRef.set({
          eventoId,
          partidoId,
          iniciaEn: admin.firestore.Timestamp.fromMillis(now),
          cierraEn: admin.firestore.Timestamp.fromMillis(
            now + VEINTICUATRO_HORAS_MS,
          ),
          estado: "activa",
          ganadorVideoId: null,
          ganadorUserId: null,
          videosParticipantes: [videoId],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        await compRef.update({
          videosParticipantes: admin.firestore.FieldValue.arrayUnion(videoId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  },
);
