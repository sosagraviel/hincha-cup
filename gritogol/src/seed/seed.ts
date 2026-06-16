import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { PARTIDOS } from "../constants";

/** Must match `.firebaserc` default project when using Emulator Suite. */
const EMULATOR_PROJECT_ID = "gritogol";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function resolveProjectId(): string {
  const fromEnv = process.env["VITE_FIREBASE_PROJECT_ID"]?.trim();
  if (!fromEnv || fromEnv.includes("your-project")) {
    return EMULATOR_PROJECT_ID;
  }
  return fromEnv;
}

loadEnvLocal();

const projectId = resolveProjectId();

if (process.env["FIRESTORE_EMULATOR_HOST"]) {
  process.env["GCLOUD_PROJECT"] = projectId;
}

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

async function seedPartido(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.collection("partidos").doc(id).set(data);
}

async function seedBeneficiarios(): Promise<void> {
  const now = Timestamp.now();
  const items = [
    {
      equipoHinchada: "uruguay",
      nombre: "Escuelita femenina Las Pioneras",
      ubicacion: "Casavalle, Montevideo",
      descripcion: "64 niñas entrenando",
      recibido: "18 pelotas + juego de camisetas",
      tipoImpacto: "pelotas",
      orden: 1,
      activo: true,
      createdAt: now,
    },
    {
      equipoHinchada: "uruguay",
      nombre: "Escuela N.º 157",
      ubicacion: "La Teja, Montevideo",
      descripcion: "contexto crítico · 212 estudiantes",
      recibido: "útiles escolares + 6 bancos nuevos",
      tipoImpacto: "escuelas",
      orden: 2,
      activo: true,
      createdAt: now,
    },
    {
      equipoHinchada: "uruguay",
      nombre: "Club de niños Estrella del Sur",
      ubicacion: "Paso de la Arena",
      descripcion: "merienda y deporte después de clase",
      recibido: "12 becas deportivas",
      tipoImpacto: "becas",
      orden: 3,
      activo: true,
      createdAt: now,
    },
    {
      equipoHinchada: "argentina",
      nombre: "Club Defensoras de Ezeiza",
      ubicacion: "Ezeiza, Buenos Aires",
      descripcion: "escuela de fútbol femenino",
      recibido: "24 pelotas + conos y arcos",
      tipoImpacto: "pelotas",
      orden: 1,
      activo: true,
      createdAt: now,
    },
    {
      equipoHinchada: "argentina",
      nombre: "Escuela Primaria N.º 12",
      ubicacion: "La Matanza",
      descripcion: "comedor escolar · 180 estudiantes",
      recibido: "meriendas + material deportivo",
      tipoImpacto: "escuelas",
      orden: 2,
      activo: true,
      createdAt: now,
    },
    {
      equipoHinchada: "argentina",
      nombre: "Fundación Potrero",
      ubicacion: "Villa 31, CABA",
      descripcion: "fútbol y apoyo escolar",
      recibido: "8 becas anuales",
      tipoImpacto: "becas",
      orden: 3,
      activo: true,
      createdAt: now,
    },
  ];

  for (const item of items) {
    await db.collection("beneficiarios").add(item);
  }
}

/** Seeds two live matches (Uruguay + Argentina) with demo impact data. */
export async function seed(): Promise<void> {
  if (!process.env["FIRESTORE_EMULATOR_HOST"]) {
    console.warn(
      "FIRESTORE_EMULATOR_HOST no está definido. ¿Quisiste correr npm run seed:emulator?",
    );
  }

  console.log(`Seeding Firestore project: ${projectId}`);

  const now = Timestamp.now();

  await seedPartido(PARTIDOS.uruguay, {
    equipoLocal: "Uruguay",
    equipoVisitante: "España",
    golesLocal: 2,
    golesVisitante: 1,
    estado: "en_vivo",
    minuto: 78,
    equipoHinchada: "uruguay",
    sponsor: {
      nombre: "MARCA ALIADA",
      compromiso: "1 pelota por festejo",
    },
    destino: "Escuelas de Montevideo",
    festejosPublicados: 47,
    pelotasDesbloqueadas: 47,
    becasDesbloqueadas: 12,
    escuelasBeneficiadas: 3,
    votacionCierraEn: null,
    createdAt: now,
    updatedAt: now,
  });

  await seedPartido(PARTIDOS.argentina, {
    equipoLocal: "Argentina",
    equipoVisitante: "México",
    golesLocal: 2,
    golesVisitante: 1,
    estado: "en_vivo",
    minuto: 67,
    equipoHinchada: "argentina",
    sponsor: {
      nombre: "MARCA ALIADA",
      compromiso: "1 pelota cada 20 festejos · tope 100",
    },
    destino: "Club Defensoras de Ezeiza",
    festejosPublicados: 0,
    pelotasDesbloqueadas: 0,
    becasDesbloqueadas: 0,
    escuelasBeneficiadas: 0,
    votacionCierraEn: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("counters").doc("videos").set({ gritoNumero: 0 });
  await seedBeneficiarios();

  console.log("Seed completado:", PARTIDOS.uruguay, PARTIDOS.argentina);
}

seed().catch((error: unknown) => {
  console.error("Seed falló:", error);
  process.exit(1);
});
