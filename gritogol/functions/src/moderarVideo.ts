import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

const MOCK = process.env.USE_MOCK_MODERATION === "true";

interface ModerarVideoData {
  videoId: string;
  frameBase64: string;
}

interface ModerarVideoResult {
  estado: "publicado" | "rechazado";
}

export const moderarVideo = onCall<ModerarVideoData, Promise<ModerarVideoResult>>(
  { region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Se requiere autenticación.");
    }

    const { videoId, frameBase64 } = request.data;

    if (!videoId || !frameBase64) {
      throw new HttpsError("invalid-argument", "videoId y frameBase64 son requeridos.");
    }

    const db = getFirestore();
    const videoRef = db.doc(`videos/${videoId}`);
    const videoSnap = await videoRef.get();

    if (!videoSnap.exists) {
      throw new HttpsError("not-found", "Video no encontrado.");
    }

    const videoData = videoSnap.data()!;

    if (videoData.userId !== request.auth.uid) {
      throw new HttpsError("permission-denied", "No tienes permiso para moderar este video.");
    }

    if (videoData.estado !== "revisando") {
      return { estado: videoData.estado as "publicado" | "rechazado" };
    }

    let aprobado = true;
    let razon: string | undefined;

    console.log(`[moderarVideo] modo=${MOCK ? "MOCK" : "REAL"} videoId=${videoId}`);

    if (!MOCK) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new HttpsError("internal", "OPENAI_API_KEY no configurada en el servidor.");
      }

      console.log("[moderarVideo] Llamando a OpenAI omni-moderation-latest...");
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
              image_url: { url: `data:image/png;base64,${frameBase64}` },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[moderarVideo] OpenAI error ${response.status}:`, errorBody);
        throw new HttpsError("internal", `Error de OpenAI: ${response.status}`);
      }

      const result = (await response.json()) as {
        results?: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
      };

      const outcome = result.results?.[0];
      aprobado = !outcome?.flagged;
      console.log(`[moderarVideo] OpenAI resultado: flagged=${outcome?.flagged} categorias=${JSON.stringify(outcome?.categories)}`);

      if (!aprobado && outcome?.categories) {
        razon = Object.entries(outcome.categories)
          .filter(([, flagged]) => flagged)
          .map(([category]) => category)
          .join(", ")
          .slice(0, 500);
      }
    }

    console.log(`[moderarVideo] Decision: ${aprobado ? "PUBLICADO" : "RECHAZADO"} razon=${razon ?? "-"}`);
    const now = Timestamp.now();

    if (aprobado) {
      const counterRef = db.doc("counters/videos");
      const partidoId = videoData.partidoId as string;
      const partidoRef = db.doc(`partidos/${partidoId}`);

      await db.runTransaction(async (tx) => {
        const [counterSnap, partidoSnap] = await Promise.all([
          tx.get(counterRef),
          tx.get(partidoRef),
        ]);

        const currentCount: number = counterSnap.exists
          ? ((counterSnap.data() as { gritoNumero?: number })["gritoNumero"] ?? 0)
          : 0;
        const gritoNumero = currentCount + 1;

        const festejosPrevios: number = partidoSnap.exists
          ? ((partidoSnap.data() as { festejosPublicados?: number }).festejosPublicados ?? 0)
          : 0;
        const festejosNuevos = festejosPrevios + 1;

        tx.set(counterRef, { gritoNumero }, { merge: true });
        tx.update(videoRef, {
          estado: "publicado",
          gritoNumero,
          moderacion: { aprobado: true, timestamp: now },
          publishedAt: FieldValue.serverTimestamp(),
        });

        if (partidoSnap.exists) {
          const updates: Record<string, FieldValue | number> = {
            festejosPublicados: FieldValue.increment(1),
            pelotasDesbloqueadas: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (festejosNuevos % 10 === 0) {
            updates["becasDesbloqueadas"] = FieldValue.increment(1);
          }
          if (festejosNuevos % 20 === 0) {
            updates["escuelasBeneficiadas"] = FieldValue.increment(1);
          }
          tx.update(partidoRef, updates);
        }
      });

      return { estado: "publicado" };
    }

    await videoRef.update({
      estado: "rechazado",
      moderacion: { aprobado: false, razon, timestamp: now },
    });

    return { estado: "rechazado" };
  },
);
