import { config as loadEnv } from 'dotenv';
import { defineConfig } from '@playwright/test';

loadEnv({ path: '.env.test', override: true });

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    // next build + start en lugar de next dev: Next no admite dos servidores
    // de desarrollo en el mismo directorio, y así se prueba el modo producción.
    command: 'npx next build && npx next start --port 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      APP_PASSWORD: process.env.APP_PASSWORD!,
      AUTH_SECRET: process.env.AUTH_SECRET!,
      INGEST_TOKEN: process.env.INGEST_TOKEN!,
    },
  },
});
