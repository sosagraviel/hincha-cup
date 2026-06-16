import type { Timestamp } from "firebase/firestore";
import type { EquipoHinchada } from "../constants";

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
  equipoHinchada: EquipoHinchada;
  sponsor: Sponsor;
  destino: string;
  festejosPublicados: number;
  pelotasDesbloqueadas: number;
  becasDesbloqueadas: number;
  escuelasBeneficiadas: number;
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

export type TipoImpacto = "pelotas" | "becas" | "escuelas";

export interface Beneficiario {
  equipoHinchada: EquipoHinchada;
  nombre: string;
  ubicacion: string;
  descripcion: string;
  recibido: string;
  tipoImpacto: TipoImpacto;
  orden: number;
  activo: boolean;
  createdAt: Timestamp;
}

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
