import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/session';

describe('sesión', () => {
  it('acepta un token propio', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it('rechaza un token ausente, vacío o manipulado', async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken('')).toBe(false);
    expect(await verifySessionToken(`${await createSessionToken()}x`)).toBe(false);
  });
});

describe('cookie de sesión', () => {
  const peticion = (url: string, cabeceras: Record<string, string> = {}) =>
    new Request(url, { headers: cabeceras });

  it('detecta https por el protocolo o por la cabecera del proxy', async () => {
    const { esHttps } = await import('@/lib/session');
    expect(esHttps(peticion('http://localhost/x'))).toBe(false);
    expect(esHttps(peticion('https://ejemplo.com/x'))).toBe(true);
    expect(esHttps(peticion('http://interno/x', { 'x-forwarded-proto': 'https' }))).toBe(true);
  });

  it('solo marca Secure cuando la conexión lo es', async () => {
    const { cookieDeSesion } = await import('@/lib/session');
    expect(cookieDeSesion('t', { seguro: false })).not.toContain('Secure');
    expect(cookieDeSesion('t', { seguro: true })).toContain('Secure');
  });
});
