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
