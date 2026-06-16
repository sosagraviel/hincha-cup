import * as admin from "firebase-admin";
import type { CopaFixtureSnapshot, ScoresProvider } from "../types/copa";

const MOCK_COLLECTION = "_sync_mock";
const MOCK_DOC = "fixtures";

interface MockStore {
  live: CopaFixtureSnapshot[];
  byDate: Record<string, CopaFixtureSnapshot[]>;
}

function emptyStore(): MockStore {
  return { live: [], byDate: {} };
}

async function readStore(db: admin.firestore.Firestore): Promise<MockStore> {
  const snap = await db.collection(MOCK_COLLECTION).doc(MOCK_DOC).get();
  if (!snap.exists) return emptyStore();
  const data = snap.data() as Partial<MockStore>;
  return {
    live: (data.live ?? []).map(reviveFixture),
    byDate: Object.fromEntries(
      Object.entries(data.byDate ?? {}).map(([date, fixtures]) => [
        date,
        fixtures.map(reviveFixture),
      ]),
    ),
  };
}

function reviveFixture(raw: CopaFixtureSnapshot): CopaFixtureSnapshot {
  return {
    ...raw,
    fechaInicio: new Date(raw.fechaInicio),
  };
}

export class MockScoresProvider implements ScoresProvider {
  constructor(private readonly db: admin.firestore.Firestore) {}

  async fetchLiveFixtures(): Promise<CopaFixtureSnapshot[]> {
    const store = await readStore(this.db);
    return store.live;
  }

  async fetchFixturesByDate(date: string): Promise<CopaFixtureSnapshot[]> {
    const store = await readStore(this.db);
    return store.byDate[date] ?? [];
  }
}

export async function writeMockLiveFixtures(
  db: admin.firestore.Firestore,
  fixtures: CopaFixtureSnapshot[],
): Promise<void> {
  const store = await readStore(db);
  store.live = fixtures;
  await db.collection(MOCK_COLLECTION).doc(MOCK_DOC).set(store, { merge: true });
}

export async function writeMockFixturesByDate(
  db: admin.firestore.Firestore,
  date: string,
  fixtures: CopaFixtureSnapshot[],
): Promise<void> {
  const store = await readStore(db);
  store.byDate[date] = fixtures;
  await db.collection(MOCK_COLLECTION).doc(MOCK_DOC).set(store, { merge: true });
}
