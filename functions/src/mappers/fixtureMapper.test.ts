import { describe, expect, it } from "vitest";
import {
  mapApiFootballFixture,
  mapEstado,
  mapGoalEvents,
} from "../mappers/fixtureMapper";

describe("fixtureMapper", () => {
  const baseFixture = {
    fixture: {
      id: 999001,
      date: "2026-06-15T18:00:00+00:00",
      status: { short: "2H", elapsed: 78 },
    },
    league: { round: "Group H - 1" },
    teams: {
      home: { id: 10, name: "Uruguay" },
      away: { id: 20, name: "España" },
    },
    goals: { home: 2, away: 1 },
    events: [
      {
        time: { elapsed: 12 },
        team: { id: 10, name: "Uruguay" },
        type: "Goal",
        detail: "Normal Goal",
      },
      {
        time: { elapsed: 44 },
        team: { id: 20, name: "España" },
        type: "Goal",
      },
      {
        time: { elapsed: 77 },
        team: { id: 10, name: "Uruguay" },
        type: "Goal",
      },
    ],
  };

  it("maps estado from status short", () => {
    expect(mapEstado("1H")).toBe("en_vivo");
    expect(mapEstado("FT")).toBe("finalizado");
    expect(mapEstado("NS")).toBe("programado");
  });

  it("maps fixture snapshot with goals and minute", () => {
    const snapshot = mapApiFootballFixture(baseFixture);
    expect(snapshot.fixtureId).toBe(999001);
    expect(snapshot.golesLocal).toBe(2);
    expect(snapshot.golesVisitante).toBe(1);
    expect(snapshot.minuto).toBe(78);
    expect(snapshot.estado).toBe("en_vivo");
    expect(snapshot.fase).toBe("Group H - 1");
  });

  it("maps goal events with stable keys", () => {
    const goals = mapGoalEvents(baseFixture);
    expect(goals).toHaveLength(3);
    expect(goals[0]?.externalEventKey).toBe("999001-12-home-1");
    expect(goals[2]?.golNumero).toBe(3);
    expect(goals[2]?.isHome).toBe(true);
  });
});
