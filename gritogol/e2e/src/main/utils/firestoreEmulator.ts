/**
 * Minimal REST client for the LOCAL Firestore emulator (test data reset and read-only state checks).
 * Local only: refuses any host that is not localhost/127.0.0.1, so it can never touch a real project.
 * `Authorization: Bearer owner` is the emulator's built-in rules bypass; it is not a credential and has
 * no effect outside the emulator.
 */
export type FirestoreValue =
  | null
  | string
  | number
  | boolean
  | FirestoreValue[]
  | { [key: string]: FirestoreValue };

export type FirestoreDoc = { id: string; fields: Record<string, FirestoreValue> };

type RestValue = Record<string, unknown>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function decode(value: RestValue): FirestoreValue {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue as string;
  if ('booleanValue' in value) return value.booleanValue as boolean;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue as string;
  if ('referenceValue' in value) return value.referenceValue as string;
  if ('arrayValue' in value) {
    const values = ((value.arrayValue as { values?: RestValue[] }).values ?? []).map(decode);
    return values;
  }
  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, RestValue> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
  }
  return null;
}

export class FirestoreEmulator {
  private readonly baseUrl: string;

  constructor(
    emulatorUrl: string = process.env.FIRESTORE_EMULATOR_URL ?? 'http://127.0.0.1:8081',
    private readonly projectId: string = process.env.FIREBASE_PROJECT_ID ?? 'gritogol',
  ) {
    const host = new URL(emulatorUrl).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`FirestoreEmulator: refusing non-local host "${host}" (local emulator only)`);
    }
    this.baseUrl = emulatorUrl.replace(/\/$/, '');
  }

  private get documentsPath(): string {
    return `projects/${this.projectId}/databases/(default)/documents`;
  }

  /** Deletes every document of the emulator's default database (emulator-only endpoint). */
  async clearAllDocuments(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/emulator/v1/${this.documentsPath}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Firestore emulator reset failed: HTTP ${res.status} ${await res.text()}`);
  }

  /** Read-only query: documents of `collection` whose `field` equals the string `value`. */
  async findByField(collection: string, field: string, value: string): Promise<FirestoreDoc[]> {
    const res = await fetch(`${this.baseUrl}/v1/${this.documentsPath}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
        },
      }),
    });
    if (!res.ok) throw new Error(`Firestore emulator query failed: HTTP ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, RestValue> } }>;
    return rows
      .filter((r) => r.document)
      .map((r) => ({
        id: r.document!.name.split('/').pop()!,
        fields: Object.fromEntries(Object.entries(r.document!.fields ?? {}).map(([k, v]) => [k, decode(v)])),
      }));
  }
}
