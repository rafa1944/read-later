import { SignJWT, jwtVerify } from 'jose';
import { requiredEnv } from './env';

export const NOMBRE_COOKIE = 'rl_session';
const DIAS = 180;
const ALGORITMO = 'HS256';

function clave(): Uint8Array {
  return new TextEncoder().encode(`session:${requiredEnv('AUTH_SECRET')}`);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: 'propietario' })
    .setProtectedHeader({ alg: ALGORITMO })
    .setIssuedAt()
    .setExpirationTime(`${DIAS}d`)
    .sign(clave());
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, clave(), { algorithms: [ALGORITMO] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Se decide por el protocolo de la petición y no por NODE_ENV: marcar Secure en
 * una conexión HTTP hace que el navegador descarte la cookie sin más.
 */
export function esHttps(request: Request): boolean {
  if (request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https') return true;
  return new URL(request.url).protocol === 'https:';
}

/**
 * Se serializa a mano en lugar de usar cookies() de next/headers para que las
 * rutas se puedan probar llamándolas directamente, sin un servidor detrás.
 */
export function cookieDeSesion(
  token: string,
  { seguro, maxAge = DIAS * 24 * 60 * 60 }: { seguro: boolean; maxAge?: number },
): string {
  const partes = [
    `${NOMBRE_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

export function cookieBorrada(seguro: boolean): string {
  return cookieDeSesion('', { seguro, maxAge: 0 });
}
