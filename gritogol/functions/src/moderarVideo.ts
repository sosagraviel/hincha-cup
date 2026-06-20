import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface ModeracionInput {
  videoId: string;
  framesBase64: string[];
}

interface VideoData {
  userId: string;
  estado: string;
  partidoId: string;
  festejosPublicados?: number;
}

interface GPTModerationResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

export const moderarVideo = onCall(
  { region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Autenticación requerida.");
    }

    const data = request.data as ModeracionInput;
    const { videoId, framesBase64 } = data;

    if (!videoId || typeof videoId !== "string") {
      throw new HttpsError("invalid-argument", "videoId requerido.");
    }
    if (!Array.isArray(framesBase64) || framesBase64.length === 0) {
      throw new HttpsError("invalid-argument", "framesBase64 requerido.");
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

    const configSnap = await db.doc("config/moderation").get();
    const firestoreMock = configSnap.exists ? (configSnap.data()?.["mockEnabled"] === true) : false;
    const useMock = process.env["USE_MOCK_MODERATION"] === "true" || firestoreMock;
    const totalSize = framesBase64.reduce((acc, f) => acc + f.length, 0);
    console.log(`[moderarVideo] modo=${useMock ? "MOCK" : "REAL"} (env=${process.env["USE_MOCK_MODERATION"]} firestore=${firestoreMock}) videoId=${videoId} frames=${framesBase64.length} totalSize=${totalSize}`);

    let aprobado: boolean;
    let razon = "";

    if (useMock) {
      aprobado = true;
      console.log("[moderarVideo] MOCK → aprobado automáticamente");
    } else {
      const apiKey = process.env["OPENAI_API_KEY"];
      if (!apiKey) {
        throw new HttpsError(
          "internal",
          "OPENAI_API_KEY no configurada. Usar firebase functions:secrets:set OPENAI_API_KEY.",
        );
      }

      const imageContent = framesBase64.map((frame) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/png;base64,${frame}`, detail: "auto" as const },
      }));

      console.log(`[moderarVideo] Llamando a GPT-4o-mini con ${framesBase64.length} frames...`);

      const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Sos un moderador estricto de contenido para Gritogol, una app de festejos de goles de fútbol. Tu única tarea es decidir si las imágenes muestran a una persona festejando un gol. Respondé SOLO con JSON válido.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analizá estos ${framesBase64.length} frames de un video subido a Gritogol.

APROBADO únicamente si: ves claramente a una o más personas celebrando, festejando, gritando un gol de fútbol.

RECHAZADO en cualquiera de estos casos:
- Imágenes médicas (radiografías, ecografías, tomografías, resonancias)
- Contenido violento, gore o sangre
- Contenido sexual o nudez
- Paisajes, objetos o escenas sin personas festejando
- Contenido completamente irrelevante al fútbol
- El video no muestra claramente un festejo de gol

En caso de duda, rechazá. Respondé SOLO con JSON: {"aprobado": true/false, "razon": "descripción breve en español de qué se ve"}`,
                },
                ...imageContent,
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 150,
          temperature: 0,
        }),
      });

      if (!gptResponse.ok) {
        const body = await gptResponse.text();
        console.error(`[moderarVideo] GPT-4o-mini error ${gptResponse.status}: ${body}`);
        throw new HttpsError("internal", `OpenAI API error: ${gptResponse.status} ${gptResponse.statusText}`);
      }

      const gptResult = (await gptResponse.json()) as GPTModerationResponse;
      const rawContent = gptResult.choices?.[0]?.message?.content ?? "{}";
      console.log(`[moderarVideo] GPT-4o-mini respuesta raw: ${rawContent}`);

      let parsed: { aprobado?: boolean; razon?: string } = {};
      try {
        parsed = JSON.parse(rawContent) as { aprobado?: boolean; razon?: string };
      } catch {
        console.error("[moderarVideo] Error parseando JSON de GPT:", rawContent);
        throw new HttpsError("internal", "Respuesta inválida del modelo de moderación.");
      }

      aprobado = parsed.aprobado === true;
      razon = (parsed.razon ?? "").slice(0, 500);
    }

    console.log(`[moderarVideo] resultado final → aprobado=${aprobado} razon="${razon}"`);

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
          moderacion: {
            aprobado: true,
            timestamp: FieldValue.serverTimestamp(),
          },
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
    } else {
      await videoRef.update({
        estado: "rechazado",
        moderacion: {
          aprobado: false,
          razon,
          timestamp: FieldValue.serverTimestamp(),
        },
      });
    }

    return { ok: true, aprobado, razon };
  },
);
