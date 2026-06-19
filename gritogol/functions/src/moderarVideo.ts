import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

interface ModeracionInput {
  videoId: string;
  frameBase64: string;
}

interface VideoData {
  userId: string;
  estado: string;
  partidoId: string;
  festejosPublicados?: number;
}

interface OpenAIModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

interface OpenAIModerationResponse {
  results?: OpenAIModerationResult[];
}

export const moderarVideo = onCall(
  { region: "us-central1", timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Autenticación requerida.");
    }

    const data = request.data as ModeracionInput;
    const { videoId, frameBase64 } = data;

    if (!videoId || typeof videoId !== "string") {
      throw new HttpsError("invalid-argument", "videoId requerido.");
    }
    if (!frameBase64 || typeof frameBase64 !== "string") {
      throw new HttpsError("invalid-argument", "frameBase64 requerido.");
    }

    const db = admin.firestore();
    const videoRef = db.doc(`videos/${videoId}`);
    const videoSnap = await videoRef.get();

    if (!videoSnap.exists) {
      throw new HttpsError("not-found", "Video no encontrado.");
    }

    const videoData = videoSnap.data() as VideoData;

    if (videoData.userId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "No tenés permiso para moderar este video.",
      );
    }

    if (videoData.estado !== "revisando") {
      return { ok: true, message: "Video ya procesado." };
    }

    const useMock = process.env["USE_MOCK_MODERATION"] === "true";

    let aprobado: boolean;
    let razon = "";

    if (useMock) {
      aprobado = true;
    } else {
      const apiKey = process.env["OPENAI_API_KEY"];
      if (!apiKey) {
        throw new HttpsError(
          "internal",
          "OPENAI_API_KEY no configurada. Usar firebase functions:secrets:set OPENAI_API_KEY.",
        );
      }

      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${frameBase64}`,
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new HttpsError(
          "internal",
          `OpenAI API error: ${response.status} ${response.statusText}`,
        );
      }

      const result = (await response.json()) as OpenAIModerationResponse;
      const outcome = result.results?.[0];
      aprobado = !outcome?.flagged;

      if (!aprobado && outcome) {
        const fullRazon = Object.entries(outcome.categories)
          .filter(([, flagged]) => flagged)
          .map(([category]) => category)
          .join(", ");
        razon = fullRazon.slice(0, 500);
      }
    }

    if (aprobado) {
      const counterRef = db.doc("counters/videos");
      const partidoRef = db.doc(`partidos/${videoData.partidoId}`);

      await db.runTransaction(async (tx) => {
        const currentVideoSnap = await tx.get(videoRef);
        const counterSnap = await tx.get(counterRef);
        const partidoSnap = await tx.get(partidoRef);

        if (
          !currentVideoSnap.exists ||
          currentVideoSnap.data()?.["estado"] !== "revisando"
        ) {
          return;
        }

        const currentCount: number = counterSnap.exists
          ? ((counterSnap.data() as { gritoNumero?: number })["gritoNumero"] ??
            0)
          : 0;
        const gritoNumero = currentCount + 1;

        const festejosPrevios: number = partidoSnap.exists
          ? ((partidoSnap.data() as { festejosPublicados?: number })
              .festejosPublicados ?? 0)
          : 0;
        const festejosNuevos = festejosPrevios + 1;

        tx.set(counterRef, { gritoNumero }, { merge: true });
        tx.update(videoRef, {
          estado: "publicado",
          gritoNumero,
          moderacion: {
            aprobado: true,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          },
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
    } else {
      await videoRef.update({
        estado: "rechazado",
        moderacion: {
          aprobado: false,
          razon,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }

    return { ok: true, aprobado, razon };
  },
);
