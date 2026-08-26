import { beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { verifySessionToken } from '@/lib/session';
import { resetDb } from '../setup/reset';

function peticion(password: string, ip = '203.0.113.7'): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ password }),
  });
}

function tokenDeCookie(respuesta: Response): string | undefined {
  return respuesta.headers.get('set-cookie')?.match(/rl_session=([^;]+)/)?.[1];
}

beforeEach(resetDb);

describe('POST /api/auth/login', () => {
  it('con la contraseña correcta devuelve una cookie de sesión válida', async () => {
    const respuesta = await login(peticion('contrasena-de-prueba'));

    expect(respuesta.status).toBe(200);
    const token = tokenDeCookie(respuesta);
    expect(token).toBeDefined();
    expect(await verifySessionToken(decodeURIComponent(token!))).toBe(true);
  });

  it('marca la cookie como httpOnly y con SameSite=Lax', async () => {
    const cookie = (await login(peticion('contrasena-de-prueba'))).headers.get('set-cookie') ?? '';
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
  });

  it('con la contraseña incorrecta responde 401 y no da cookie', async () => {
    const respuesta = await login(peticion('incorrecta'));
    expect(respuesta.status).toBe(401);
    expect(tokenDeCookie(respuesta)).toBeUndefined();
  });

  it('bloquea tras diez intentos fallidos desde la misma IP', async () => {
    for (let i = 0; i < 10; i += 1) {
      await login(peticion('incorrecta', '198.51.100.4'));
    }
    const respuesta = await login(peticion('contrasena-de-prueba', '198.51.100.4'));
    expect(respuesta.status).toBe(429);
  });

  it('el bloqueo es por IP y no afecta a otra distinta', async () => {
    for (let i = 0; i < 10; i += 1) {
      await login(peticion('incorrecta', '198.51.100.5'));
    }
    expect((await login(peticion('contrasena-de-prueba', '198.51.100.6'))).status).toBe(200);
  });
});
