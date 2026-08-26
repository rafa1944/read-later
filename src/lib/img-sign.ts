import { createHmac, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './env';

export function signImage(url: string): string {
  return createHmac('sha256', requiredEnv('AUTH_SECRET'))
    .update(`img:${url}`)
    .digest('base64url')
    .slice(0, 32);
}

export function imageProxyPath(url: string): string {
  return `/api/img?url=${encodeURIComponent(url)}&sig=${signImage(url)}`;
}

export function verifyImageSig(url: string, sig: string | null): boolean {
  if (!sig) return false;
  const esperada = Buffer.from(signImage(url));
  const recibida = Buffer.from(sig);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
