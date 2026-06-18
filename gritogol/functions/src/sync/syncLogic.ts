import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { abreviarEquipo } from "../utils/teamCodes";
import type { CopaFixtureSnapshot, GoalEventSnapshot } from "../types/copa";

const VENTANA_MS = 10 * 60 * 1000;

export interface PartidoLink {
  partidoId: string;
  golesProcesados: number;
  equipoLocal: string;
  equipoVisitante: string;
}

export async function findPartidoByFixtureId(
  db: admin.firestore.Firestore,
  fixtureId: number,
): Promise<PartidoLink | null> {
  const snap = await db
    .collection("partidos")
    .where("fixtureId", "==", fixtureId)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0]!;
  const data = doc.data();
  return {
    partidoId: doc.id,
    golesProcesados: (data["golesProcesados"] as number | undefined) ?? 0,
    equipoLocal: data["equipoLocal"] as string,
    equipoVisitante: data["equipoVisitante"] as string,
  };
}

export async function upsertCopaFixture(
  db: admin.firestore.Firestore,
  snapshot: CopaFixtureSnapshot,
  partidoId?: string,
): Promise<void> {
  const ref = db.collection("copa_fixtures").doc(String(snapshot.fixtureId));
  const payload: Record<string, unknown> = {
    fixtureId: snapshot.fixtureId,
    equipoLocal: snapshot.equipoLocal,
    equipoVisitante: snapshot.equipoVisitante,
    codigoLocal: abreviarEquipo(snapshot.equipoLocal),
    codigoVisitante: abreviarEquipo(snapshot.equipoVisitante),
    golesLocal: snapshot.golesLocal,
    golesVisitante: snapshot.golesVisitante,
    minuto: snapshot.minuto,
    statusShort: snapshot.statusShort,
    estado: snapshot.estado,
    fechaInicio: Timestamp.fromDate(snapshot.fechaInicio),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (snapshot.fase) payload["fase"] = snapshot.fase;
  if (partidoId !== undefined) payload["partidoId"] = partidoId;

  await ref.set(payload, { merge: true });
}

async function eventoExists(
  db: admin.firestore.Firestore,
  partidoId: string,
  externalEventKey: string,
): Promise<boolean> {
  const snap = await db
    .collection("eventos")
    .where("partidoId", "==", partidoId)
    .where("externalEventKey", "==", externalEventKey)
    .limit(1)
    .get();

  return !snap.empty;
}

async function createGoalEvent(
  db: admin.firestore.Firestore,
  partidoId: string,
  partidoLink: PartidoLink,
  snapshot: CopaFixtureSnapshot,
  goal: GoalEventSnapshot,
): Promise<void> {
  if (await eventoExists(db, partidoId, goal.externalEventKey)) {
    return;
  }

  const partidoRef = db.collection("partidos").doc(partidoId);
  const now = Timestamp.now();
  const ventanaCierraEn = Timestamp.fromMillis(now.toMillis() + VENTANA_MS);

  const equipo = goal.isHome
    ? partidoLink.equipoLocal
    : partidoLink.equipoVisitante;

  await db.runTransaction(async (tx) => {
    const partidoSnap = await tx.get(partidoRef);
    if (!partidoSnap.exists) return;

    const partidoData = partidoSnap.data()!;
    const golesProcesados =
      (partidoData["golesProcesados"] as number | undefined) ?? 0;

    if (goal.golNumero <= golesProcesados) return;

    const eventoRef = db.collection("eventos").doc();
    tx.set(eventoRef, {
      partidoId,
      equipo,
      minuto: goal.minuto,
      golNumero: goal.golNumero,
      externalEventKey: goal.externalEventKey,
      ventanaAbreEn: now,
      ventanaCierraEn,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.update(partidoRef, {
      golesLocal: snapshot.golesLocal,
      golesVisitante: snapshot.golesVisitante,
      minuto: snapshot.minuto,
      estado: snapshot.estado === "finalizado" ? "finalizado" : "en_vivo",
      golesProcesados: goal.golNumero,
      ultimoSyncEn: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function syncPartidoFromFixture(
  db: admin.firestore.Firestore,
  snapshot: CopaFixtureSnapshot,
  partidoLink: PartidoLink,
): Promise<void> {
  const partidoRef = db.collection("partidos").doc(partidoLink.partidoId);
  const newGoals = snapshot.goalEvents
    .filter((goal) => goal.golNumero > partidoLink.golesProcesados)
    .sort((a, b) => a.golNumero - b.golNumero);

  for (const goal of newGoals) {
    await createGoalEvent(db, partidoLink.partidoId, partidoLink, snapshot, goal);
    partidoLink.golesProcesados = goal.golNumero;
  }

  if (newGoals.length === 0) {
    await partidoRef.set(
      {
        golesLocal: snapshot.golesLocal,
        golesVisitante: snapshot.golesVisitante,
        minuto: snapshot.minuto,
        estado: snapshot.estado === "finalizado" ? "finalizado" : "en_vivo",
        ultimoSyncEn: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

export async function processFixtureSnapshot(
  db: admin.firestore.Firestore,
  snapshot: CopaFixtureSnapshot,
): Promise<void> {
  const partidoLink = await findPartidoByFixtureId(db, snapshot.fixtureId);
  await upsertCopaFixture(
    db,
    snapshot,
    partidoLink?.partidoId,
  );

  if (partidoLink) {
    await syncPartidoFromFixture(db, snapshot, partidoLink);
  }
}

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function mergeFixturesById(
  ...lists: CopaFixtureSnapshot[][]
): CopaFixtureSnapshot[] {
  const map = new Map<number, CopaFixtureSnapshot>();
  for (const list of lists) {
    for (const fixture of list) {
      map.set(fixture.fixtureId, fixture);
    }
  }
  return [...map.values()];
}
