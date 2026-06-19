import { mapApiFootballFixtures } from "../mappers/fixtureMapper";
import type { CopaFixtureSnapshot, ScoresProvider } from "../types/copa";

const BASE_URL = "https://v3.football.api-sports.io";
const WC_LEAGUE_ID = 1;
const WC_SEASON = 2026;

interface ApiFootballListResponse {
  response: unknown[];
  errors?: Record<string, string>;
}

export class ApiFootballProvider implements ScoresProvider {
  constructor(private readonly apiKey: string) {}

  private async request(path: string, params: Record<string, string>): Promise<unknown[]> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      headers: { "x-apisports-key": this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`API-Football HTTP ${response.status}: ${response.statusText}`);
    }

    const body = (await response.json()) as ApiFootballListResponse;

    if (body.errors && Object.keys(body.errors).length > 0) {
      throw new Error(`API-Football error: ${JSON.stringify(body.errors)}`);
    }

    return body.response ?? [];
  }

  async fetchLiveFixtures(): Promise<CopaFixtureSnapshot[]> {
    // Use live=all+league filter: avoids season gating on demo/free API plans
    const items = await this.request("/fixtures", {
      live: "all",
      league: String(WC_LEAGUE_ID),
    });

    return mapApiFootballFixtures(
      items as Parameters<typeof mapApiFootballFixtures>[0],
    );
  }

  async fetchFixturesByDate(date: string): Promise<CopaFixtureSnapshot[]> {
    try {
      const items = await this.request("/fixtures", {
        league: String(WC_LEAGUE_ID),
        season: String(WC_SEASON),
        date,
        timezone: "UTC",
      });
      return mapApiFootballFixtures(
        items as Parameters<typeof mapApiFootballFixtures>[0],
      );
    } catch {
      // Demo/free API plans block season=2026; live fixtures still sync via fetchLiveFixtures
      return [];
    }
  }
}
