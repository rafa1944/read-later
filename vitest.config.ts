import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Se carga en un objeto aparte para no contaminar el process.env de quien
// lance vitest, y se inyecta explícitamente en los workers con test.env.
const entorno = loadEnv({ path: '.env.test', processEnv: {} }).parsed ?? {};

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup/global.ts'],
    env: entorno,
    fileParallelism: false,
  },
});
