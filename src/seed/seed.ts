import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  Timestamp,
} from "firebase/firestore";

export const seedPartidoId = "partido-arg-mex-2026";

const firebaseConfig = {
  apiKey: process.env["VITE_FIREBASE_API_KEY"] ?? "",
  authDomain: process.env["VITE_FIREBASE_AUTH_DOMAIN"] ?? "",
  projectId: process.env["VITE_FIREBASE_PROJECT_ID"] ?? "",
  storageBucket: process.env["VITE_FIREBASE_STORAGE_BUCKET"] ?? "",
  messagingSenderId: process.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "",
  appId: process.env["VITE_FIREBASE_APP_ID"] ?? "",
};

/** Seeds a single live ARG 2–1 MEX match with two goal events into Firestore. */
export async function seed(): Promise<void> {
  const app = initializeApp(firebaseConfig, "seed");
  const db = getFirestore(app);

  const now = Timestamp.now();
  const ventanaCierraEn = Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000);

  await setDoc(doc(db, "partidos", seedPartidoId), {
    equipoLocal: "Argentina",
    equipoVisitante: "México",
    golesLocal: 2,
    golesVisitante: 1,
    estado: "en_vivo",
    minuto: 67,
    sponsor: {
      nombre: "Marca X",
      compromiso: "1 pelota cada 20 festejos · tope 100",
    },
    destino: "Club Defensoras de Ezeiza",
    festejosPublicados: 0,
    pelotasDesbloqueadas: 0,
    votacionCierraEn: null,
    createdAt: now,
    updatedAt: now,
  });

  await addDoc(collection(db, "eventos"), {
    partidoId: seedPartidoId,
    equipo: "Argentina",
    minuto: 23,
    golNumero: 1,
    ventanaAbreEn: now,
    ventanaCierraEn,
    createdAt: now,
  });

  await addDoc(collection(db, "eventos"), {
    partidoId: seedPartidoId,
    equipo: "Argentina",
    minuto: 67,
    golNumero: 2,
    ventanaAbreEn: now,
    ventanaCierraEn,
    createdAt: now,
  });

  await setDoc(doc(db, "counters", "videos"), {
    gritoNumero: 0,
  });

  console.log(`Seed completado: partido ${seedPartidoId}`);
}

seed().catch((error: unknown) => {
  console.error("Seed falló:", error);
  process.exit(1);
});
