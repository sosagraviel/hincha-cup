import {
  doc,
  collection,
  addDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Partido, Evento } from "../types/firestore";

export function suscribirPartido(
  id: string,
  cb: (partido: ({ id: string } & Partido) | null) => void,
): Unsubscribe {
  const partidoRef = doc(db, "partidos", id);

  return onSnapshot(partidoRef, (docSnap) => {
    if (!docSnap.exists()) {
      cb(null);
      return;
    }
    cb({ id: docSnap.id, ...(docSnap.data() as Partido) });
  });
}

export function suscribirEventos(
  partidoId: string,
  cb: (eventos: Array<{ id: string } & Evento>) => void,
): Unsubscribe {
  const q = query(
    collection(db, "eventos"),
    where("partidoId", "==", partidoId),
    orderBy("createdAt", "desc"),
  );

  return onSnapshot(q, (snapshot) => {
    const eventos = snapshot.docs.map(
      (docSnap: QueryDocumentSnapshot<DocumentData>) => ({
        id: docSnap.id,
        ...(docSnap.data() as Evento),
      }),
    );
    cb(eventos);
  });
}

export function eventoVentanaAbierta(evento: Evento): boolean {
  const now = Date.now();
  return (
    evento.ventanaAbreEn.toMillis() <= now &&
    now <= evento.ventanaCierraEn.toMillis()
  );
}

export async function dispararGol(partidoId: string): Promise<string> {
  const partidoRef = doc(db, "partidos", partidoId);
  const partidoSnap = await getDoc(partidoRef);

  if (!partidoSnap.exists()) {
    throw new Error("Partido no encontrado");
  }

  const partido = partidoSnap.data() as Partido;
  const now = Timestamp.now();
  const ventanaCierraEn = Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000);
  const golNumero = partido.golesLocal + partido.golesVisitante + 1;
  const nuevoMinuto = Math.min(partido.minuto + 1, 90);

  const eventoRef = await addDoc(collection(db, "eventos"), {
    partidoId,
    equipo: partido.equipoLocal,
    minuto: nuevoMinuto,
    golNumero,
    ventanaAbreEn: now,
    ventanaCierraEn,
    createdAt: serverTimestamp(),
  });

  await updateDoc(partidoRef, {
    golesLocal: partido.golesLocal + 1,
    minuto: nuevoMinuto,
    updatedAt: serverTimestamp(),
  });

  return eventoRef.id;
}

export async function cerrarVotacion(partidoId: string): Promise<void> {
  const partidoRef = doc(db, "partidos", partidoId);
  await updateDoc(partidoRef, {
    votacionCierraEn: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
