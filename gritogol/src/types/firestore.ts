import type { Timestamp } from "firebase/firestore";

export interface Sponsor {
  nombre: string;
  compromiso: string;
}

export interface Partido {
  equipoLocal: string;
  equipoVisitante: string;
  golesLocal: number;
  golesVisitante: number;
  estado: "en_vivo" | "finalizado";
  minuto: number;
  sponsor: Sponsor;
  destino: string;
  festejosPublicados: number;
  pelotasDesbloqueadas: number;
  votacionCierraEn: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Evento {
  partidoId: string;
  equipo: string;
  minuto: number;
  golNumero: number;
  ventanaAbreEn: Timestamp;
  ventanaCierraEn: Timestamp;
  createdAt: Timestamp;
}

export type VideoEstado = "revisando" | "publicado" | "rechazado";

export interface Moderacion {
  aprobado: boolean;
  razon?: string;
  timestamp: Timestamp;
}

export interface Video {
  partidoId: string;
  eventoId: string;
  golNumero: number;
  userId: string;
  autorAlias: string;
  storagePath: string;
  estado: VideoEstado;
  gritoNumero: number | null;
  aplausos: number;
  moderacion: Moderacion | null;
  createdAt: Timestamp;
  publishedAt: Timestamp | null;
}

export interface Voto {
  videoId: string;
  partidoId: string;
  userId: string;
  createdAt: Timestamp;
}
