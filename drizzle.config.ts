import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: process.env.DOTENV_CONFIG_PATH ?? '.env.local' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
