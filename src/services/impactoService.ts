import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Beneficiario } from "../types/firestore";
import type { EquipoHinchada } from "../constants";

export function suscribirBeneficiarios(
  equipoHinchada: EquipoHinchada,
  cb: (beneficiarios: Array<{ id: string } & Beneficiario>) => void,
): Unsubscribe {
  const q = query(
    collection(db, "beneficiarios"),
    where("equipoHinchada", "==", equipoHinchada),
    where("activo", "==", true),
    orderBy("orden", "asc"),
  );

  return onSnapshot(q, (snapshot) => {
    const beneficiarios = snapshot.docs.map(
      (docSnap: QueryDocumentSnapshot<DocumentData>) => ({
        id: docSnap.id,
        ...(docSnap.data() as Beneficiario),
      }),
    );
    cb(beneficiarios);
  });
}
