import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Usuario } from "../types/firestore";

export function suscribirUsuario(
  uid: string,
  cb: (usuario: Usuario | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, "usuarios", uid), (snap) => {
    cb(snap.exists() ? (snap.data() as Usuario) : null);
  });
}

export async function guardarSuscripcion(
  uid: string,
  data: Partial<Omit<Usuario, "updatedAt">>,
): Promise<void> {
  await setDoc(
    doc(db, "usuarios", uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
