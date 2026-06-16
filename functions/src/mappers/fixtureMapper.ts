import type {
  CopaEstado,
  CopaFixtureSnapshot,
  GoalEventSnapshot,
} from "../types/copa";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "LIVE"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

interface ApiFootballFixtureResponse {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    round?: string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  events?: Array<{
    time: { elapsed: number; extra?: number | null };
    team: { id: number; name: string };
    type: string;
    detail?: string;
  }>;
}

export function mapEstado(statusShort: string): CopaEstado {
  if (LIVE_STATUSES.has(statusShort)) return "en_vivo";
  if (FINISHED_STATUSES.has(statusShort)) return "finalizado";
  return "programado";
}

export function mapGoalEvents(
  raw: ApiFootballFixtureResponse,
): GoalEventSnapshot[] {
  const events = raw.events ?? [];
  const homeId = raw.teams.home.id;
  let golNumero = 0;

  return events
    .filter((event) => event.type === "Goal")
    .map((event) => {
      golNumero += 1;
      const isHome = event.team.id === homeId;
      const side = isHome ? "home" : "away";
      const extra = event.time.extra ?? 0;
      const minuto = event.time.elapsed + extra;

      return {
        externalEventKey: `${raw.fixture.id}-${minuto}-${side}-${golNumero}`,
        teamName: event.team.name,
        teamId: event.team.id,
        isHome,
        minuto,
        golNumero,
      };
    });
}

export function mapApiFootballFixture(
  raw: ApiFootballFixtureResponse,
): CopaFixtureSnapshot {
  const statusShort = raw.fixture.status.short;
  const elapsed = raw.fixture.status.elapsed ?? 0;
  const round = raw.league.round ?? "";

  const base: CopaFixtureSnapshot = {
    fixtureId: raw.fixture.id,
    equipoLocal: raw.teams.home.name,
    equipoVisitante: raw.teams.away.name,
    teamLocalId: raw.teams.home.id,
    teamVisitanteId: raw.teams.away.id,
    golesLocal: raw.goals.home ?? 0,
    golesVisitante: raw.goals.away ?? 0,
    minuto: LIVE_STATUSES.has(statusShort) ? elapsed : 0,
    statusShort,
    estado: mapEstado(statusShort),
    fechaInicio: new Date(raw.fixture.date),
    goalEvents: mapGoalEvents(raw),
  };

  if (round) {
    return { ...base, fase: round };
  }

  return base;
}

export function mapApiFootballFixtures(
  items: ApiFootballFixtureResponse[],
): CopaFixtureSnapshot[] {
  return items.map(mapApiFootballFixture);
}
