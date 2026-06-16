/**
 * Lists FIFA World Cup 2026 fixtures from API-Football and prints IDs
 * for Uruguay / Argentina campaign matches.
 *
 * Usage:
 *   API_FOOTBALL_KEY=your-key tsx scripts/fetch-fixture-ids.ts
 *   API_FOOTBALL_KEY=your-key tsx scripts/fetch-fixture-ids.ts --date 2026-06-15
 */

const BASE_URL = "https://v3.football.api-sports.io";
const LEAGUE = 1;
const SEASON = 2026;

interface FixtureRow {
  fixture: { id: number; date: string };
  teams: {
    home: { name: string };
    away: { name: string };
  };
  league: { round?: string };
}

async function fetchFixtures(date?: string): Promise<FixtureRow[]> {
  const key = process.env["API_FOOTBALL_KEY"];
  if (!key) {
    throw new Error("Set API_FOOTBALL_KEY environment variable");
  }

  const params = new URLSearchParams({
    league: String(LEAGUE),
    season: String(SEASON),
    timezone: "UTC",
  });

  if (date) {
    params.set("date", date);
  }

  const response = await fetch(`${BASE_URL}/fixtures?${params}`, {
    headers: { "x-apisports-key": key },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const body = (await response.json()) as { response: FixtureRow[] };
  return body.response ?? [];
}

function matchesCampaign(row: FixtureRow): boolean {
  const names = [
    row.teams.home.name.toLowerCase(),
    row.teams.away.name.toLowerCase(),
  ];
  return names.some((n) => n.includes("uruguay") || n.includes("argentina"));
}

async function main(): Promise<void> {
  const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
  const date = dateArg?.slice("--date=".length);

  const fixtures = await fetchFixtures(date);

  console.log(`World Cup ${SEASON} — ${fixtures.length} fixtures\n`);

  for (const row of fixtures) {
    const label = `${row.teams.home.name} vs ${row.teams.away.name}`;
    const marker = matchesCampaign(row) ? " ★" : "";
    console.log(
      `${row.fixture.id}\t${row.fixture.date.slice(0, 10)}\t${row.league.round ?? ""}\t${label}${marker}`,
    );
  }

  console.log("\n★ = Uruguay or Argentina — copy fixture IDs into FIXTURE_IDS in src/constants.ts");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
