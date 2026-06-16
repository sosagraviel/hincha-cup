import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import type { CopaFixture } from "../types/firestore";

function mapCopaFixture(
  docSnap: QueryDocumentSnapshot<DocumentData>,
): { id: string } & CopaFixture {
  return {
    id: docSnap.id,
    ...(docSnap.data() as CopaFixture),
  };
}

export function suscribirFixturesEnVivo(
  cb: (fixtures: Array<{ id: string } & CopaFixture>) => void,
): Unsubscribe {
  const q = query(
    collection(db, "copa_fixtures"),
    where("estado", "==", "en_vivo"),
    orderBy("fechaInicio", "asc"),
  );

  return onSnapshot(q, (snapshot) => {
    cb(snapshot.docs.map(mapCopaFixture));
  });
}

export function suscribirFixturesHoy(
  cb: (fixtures: Array<{ id: string } & CopaFixture>) => void,
): Unsubscribe {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "copa_fixtures"),
    where("fechaInicio", ">=", Timestamp.fromDate(start)),
    where("fechaInicio", "<=", Timestamp.fromDate(end)),
    orderBy("fechaInicio", "asc"),
  );

  return onSnapshot(q, (snapshot) => {
    cb(snapshot.docs.map(mapCopaFixture));
  });
}
