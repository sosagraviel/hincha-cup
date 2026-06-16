export type CopaEstado = "programado" | "en_vivo" | "finalizado";

export interface GoalEventSnapshot {
  externalEventKey: string;
  teamName: string;
  teamId: number;
  isHome: boolean;
  minuto: number;
  golNumero: number;
}

export interface CopaFixtureSnapshot {
  fixtureId: number;
  equipoLocal: string;
  equipoVisitante: string;
  teamLocalId: number;
  teamVisitanteId: number;
  golesLocal: number;
  golesVisitante: number;
  minuto: number;
  statusShort: string;
  estado: CopaEstado;
  fechaInicio: Date;
  fase?: string;
  grupo?: string;
  goalEvents: GoalEventSnapshot[];
}

export interface ScoresProvider {
  fetchLiveFixtures(): Promise<CopaFixtureSnapshot[]>;
  fetchFixturesByDate(date: string): Promise<CopaFixtureSnapshot[]>;
}
