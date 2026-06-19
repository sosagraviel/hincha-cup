import type { Timestamp } from "firebase/firestore";
import type { EquipoHinchada } from "../constants";
import type { NivelAlcanzado } from "../constants/niveles";

export interface Sponsor {
  nombre: string;
  compromiso: string;
}

export type CopaEstado = "programado" | "en_vivo" | "finalizado";

export interface Partido {
  equipoLocal: string;
  equipoVisitante: string;
  golesLocal: number;
  golesVisitante: number;
  estado: "en_vivo" | "finalizado";
  minuto: number;
  equipoHinchada: EquipoHinchada;
  fixtureId?: number;
  golesProcesados?: number;
  ultimoSyncEn?: Timestamp;
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

export interface CopaFixture {
  fixtureId: number;
  equipoLocal: string;
  equipoVisitante: string;
  codigoLocal: string;
  codigoVisitante: string;
  golesLocal: number;
  golesVisitante: number;
  minuto: number;
  statusShort: string;
  estado: CopaEstado;
  fechaInicio: Timestamp;
  fase?: string;
  grupo?: string;
  partidoId?: string;
  updatedAt: Timestamp;
}

export interface Evento {
  partidoId: string;
  equipo: string;
  minuto: number;
  golNumero: number;
  externalEventKey?: string;
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
  mimeType?: string;
  estado: VideoEstado;
  gritoNumero: number | null;
  aplausos: number;
  nivelAlcanzado: NivelAlcanzado;
  competenciaId?: string;
  moderacion: Moderacion | null;
  createdAt: Timestamp;
  publishedAt: Timestamp | null;
}

export interface Voto {
  videoId: string;
  partidoId: string;
  userId: string;
  competenciaId?: string;
  createdAt: Timestamp;
}

export type CompetenciaEstado = "activa" | "cerrada";

export interface Competencia {
  eventoId: string;
  partidoId: string;
  iniciaEn: Timestamp;
  cierraEn: Timestamp;
  estado: CompetenciaEstado;
  ganadorVideoId: string | null;
  ganadorUserId: string | null;
  videosParticipantes: string[];
}

export interface Usuario {
  fixtureFavorito: number | null;
  fixturesSecundarios: number[];
  updatedAt: Timestamp;
}
