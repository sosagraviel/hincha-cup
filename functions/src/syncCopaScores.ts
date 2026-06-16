import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { ApiFootballProvider } from "./providers/apiFootball";
import { MockScoresProvider } from "./providers/mockScores";
import type { ScoresProvider } from "./types/copa";
import {
  mergeFixturesById,
  processFixtureSnapshot,
  todayUtcDate,
} from "./sync/syncLogic";

const apiFootballKey = defineSecret("API_FOOTBALL_KEY");

function useMockScores(): boolean {
  return process.env["USE_MOCK_SCORES"] === "true";
}

function createProvider(db: admin.firestore.Firestore): ScoresProvider {
  if (useMockScores()) {
    console.log("syncCopaScores: using MockScoresProvider");
    return new MockScoresProvider(db);
  }

  const key =
    apiFootballKey.value() || process.env["API_FOOTBALL_KEY"] || "";
  if (!key) {
    throw new Error(
      "API_FOOTBALL_KEY secret is not configured (set secret or USE_MOCK_SCORES=true)",
    );
  }

  return new ApiFootballProvider(key);
}

export async function runCopaSync(): Promise<{ processed: number }> {
  const db = admin.firestore();
  const provider = createProvider(db);
  const today = todayUtcDate();

  const [liveFixtures, todayFixtures] = await Promise.all([
    provider.fetchLiveFixtures(),
    provider.fetchFixturesByDate(today),
  ]);

  const fixtures = mergeFixturesById(liveFixtures, todayFixtures);
  let processed = 0;

  for (const snapshot of fixtures) {
    try {
      await processFixtureSnapshot(db, snapshot);
      processed += 1;
    } catch (error) {
      console.error(
        `Failed to sync fixture ${snapshot.fixtureId}:`,
        error,
      );
    }
  }

  console.log(
    `syncCopaScores complete: ${processed}/${fixtures.length} fixtures`,
  );

  return { processed };
}

export const syncCopaScores = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    secrets: [apiFootballKey],
    timeoutSeconds: 120,
  },
  async () => {
    if (useMockScores()) {
      await runCopaSync();
      return;
    }

    try {
      await runCopaSync();
    } catch (error) {
      console.error("syncCopaScores failed:", error);
    }
  },
);

export const triggerCopaSync = onCall(
  {
    region: "us-central1",
    secrets: [apiFootballKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const adminSnap = await admin
      .firestore()
      .doc(`admins/${request.auth.uid}`)
      .get();

    if (!adminSnap.exists) {
      throw new HttpsError("permission-denied", "Admin only");
    }

    const result = await runCopaSync();
    return result;
  },
);

function isEmulatorRuntime(): boolean {
  return (
    useMockScores() ||
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  );
}

export const simulateGoal = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!isEmulatorRuntime()) {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required");
      }

      const adminSnap = await admin
        .firestore()
        .doc(`admins/${request.auth.uid}`)
        .get();

      if (!adminSnap.exists) {
        throw new HttpsError("permission-denied", "Admin only");
      }
    }

    const partidoId = request.data?.partidoId as string | undefined;
    if (!partidoId) {
      throw new HttpsError("invalid-argument", "partidoId is required");
    }

    const db = admin.firestore();
    const partidoRef = db.collection("partidos").doc(partidoId);
    const partidoSnap = await partidoRef.get();

    if (!partidoSnap.exists) {
      throw new HttpsError("not-found", "Partido not found");
    }

    const partido = partidoSnap.data()!;
    const fixtureId = partido["fixtureId"] as number | undefined;
    const golesLocal = (partido["golesLocal"] as number) ?? 0;
    const golesVisitante = (partido["golesVisitante"] as number) ?? 0;
    const golesProcesados =
      (partido["golesProcesados"] as number | undefined) ??
      golesLocal + golesVisitante;
    const minuto = Math.min(((partido["minuto"] as number) ?? 0) + 1, 90);
    const golNumero = golesProcesados + 1;
    const scoresHome = golesLocal + 1;

    const now = Timestamp.now();
    const ventanaCierraEn = Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000);

    const externalEventKey = fixtureId
      ? `${fixtureId}-sim-${golNumero}`
      : `sim-${partidoId}-${golNumero}`;

    await db.runTransaction(async (tx) => {
      const eventoRef = db.collection("eventos").doc();
      tx.set(eventoRef, {
        partidoId,
        equipo: partido["equipoLocal"] as string,
        minuto,
        golNumero,
        externalEventKey,
        ventanaAbreEn: now,
        ventanaCierraEn,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.update(partidoRef, {
        golesLocal: scoresHome,
        minuto,
        estado: "en_vivo",
        golesProcesados: golNumero,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    if (fixtureId) {
      await db
        .collection("copa_fixtures")
        .doc(String(fixtureId))
        .set(
          {
            golesLocal: scoresHome,
            golesVisitante,
            minuto,
            estado: "en_vivo",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    }

    return { golNumero, partidoId };
  },
);
