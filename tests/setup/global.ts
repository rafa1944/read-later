import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export default async function setup() {
  config({ path: '.env.test', override: true });
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: './src/db/migrations' });
  await client.end();
}
