import { Client } from 'pg';
import users from './data/users.json' with { type: 'json' };

interface SeedUser {
  email: string;
  displayName: string;
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const u of users as SeedUser[]) {
      await client.query(
        'INSERT INTO users (email, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [u.email, u.displayName],
      );
    }
    console.warn(`seeded ${users.length} users`);
  } finally {
    await client.end();
  }
}

void main();
