import { config as loadEnv } from 'dotenv';
import { defineConfig } from '@playwright/test';

loadEnv({ path: '.env.test', override: true });

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/setup/global.ts',
  timeout: 60_000,
  /*
   * Los cinco segundos de serie se quedan cortos aquí: la app sirve la copia
   * del service worker y la corrige después, así que lo recién guardado tarda
   * en aparecer, y con varios navegadores a la vez ese margen se agota.
   */
  expect: { timeout: 15_000 },
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
