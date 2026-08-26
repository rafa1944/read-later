import { createHash, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './env';

function iguales(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function verifyIngestToken(header: string | null): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  return iguales(header.slice('Bearer '.length), requiredEnv('INGEST_TOKEN'));
}

export function verifyPassword(given: string): boolean {
  return iguales(given, requiredEnv('APP_PASSWORD'));
}

const MAX_INTENTOS = 10;
const VENTANA_MINUTOS = 15;

// Las importaciones son dinámicas para que verifyIngestToken no abra conexión a
// la base de datos por el mero hecho de importar este módulo.
export async function tooManyAttempts(ip: string): Promise<boolean> {
  const { db } = await import('@/db/client');
  const { loginAttempts } = await import('@/db/schema');
  const { and, count, eq, gte } = await import('drizzle-orm');

  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60 * 1000);
  const [fila] = await db
    .select({ total: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.attemptedAt, desde)));

  return Number(fila?.total ?? 0) >= MAX_INTENTOS;
}

export async function recordAttempt(ip: string): Promise<void> {
  const { db } = await import('@/db/client');
  const { loginAttempts } = await import('@/db/schema');
  await db.insert(loginAttempts).values({ ip });
}

export async function clearAttempts(ip: string): Promise<void> {
  const { db } = await import('@/db/client');
  const { loginAttempts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
}
