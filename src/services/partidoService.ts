import {
  doc,
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Partido } from "../types/firestore";

/**
 * Subscribes to real-time updates for a single match document.
 * Invokes the callback whenever the partido data changes.
 */
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

/**
 * Creates a new goal event document for a match. Used by the /admin page
 * to simulate a goal during demos.
 */
export async function dispararGol(partidoId: string): Promise<void> {
  const now = Timestamp.now();
  const ventanaCierraEn = Timestamp.fromMillis(
    now.toMillis() + 10 * 60 * 1000,
  );

  await addDoc(collection(db, "eventos"), {
    partidoId,
    equipo: "Local",
    minuto: 0,
    golNumero: 1,
    ventanaAbreEn: now,
    ventanaCierraEn,
    createdAt: serverTimestamp(),
  });
}

/**
 * Sets the voting close timestamp on a match to the current server time,
 * effectively closing the celebration window. Used by the /admin page.
 */
export async function cerrarVotacion(partidoId: string): Promise<void> {
  const partidoRef = doc(db, "partidos", partidoId);
  await updateDoc(partidoRef, {
    votacionCierraEn: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
