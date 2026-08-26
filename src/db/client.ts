import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { requiredEnv } from '@/lib/env';
import * as schema from './schema';

type Cache = { client?: ReturnType<typeof postgres> };
const cache = globalThis as unknown as { __rlDb?: Cache };
cache.__rlDb ??= {};

cache.__rlDb.client ??= postgres(requiredEnv('DATABASE_URL'), { prepare: false });

export const sqlClient = cache.__rlDb.client;
export const db = drizzle(sqlClient, { schema });
