import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/items/route';
import { listItems } from '@/services/items';
import { resetDb } from '../setup/reset';

const TOKEN = 'token-de-prueba';

function peticion(cuerpo: unknown, token: string | null = TOKEN): Request {
  return new Request('http://localhost/api/items', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(cuerpo),
  });
}

const articulo = {
  url: 'https://ejemplo.com/a',
  title: 'Título',
  html: '<p>Cuerpo con varias palabras.</p>',
};

beforeEach(resetDb);

describe('POST /api/items', () => {
  it('crea el artículo y responde 201 con su id', async () => {
    const respuesta = await POST(peticion(articulo));
    expect(respuesta.status).toBe(201);

    const cuerpo = await respuesta.json();
    expect(cuerpo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cuerpo.created).toBe(true);
  });

  it('responde 200 y el id existente si la URL ya estaba guardada', async () => {
    await POST(peticion(articulo));
    const respuesta = await POST(peticion(articulo));

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).created).toBe(false);
    expect((await listItems({ state: 'pendientes' })).length).toBe(1);
  });

  it('rechaza sin token', async () => {
    expect((await POST(peticion(articulo, null))).status).toBe(401);
  });

  it('rechaza con un token incorrecto', async () => {
    expect((await POST(peticion(articulo, 'otro-token'))).status).toBe(401);
  });

  it('rechaza un cuerpo sin url o sin title', async () => {
    expect((await POST(peticion({ title: 'x', html: '<p>y</p>' }))).status).toBe(400);
    expect((await POST(peticion({ url: 'https://ejemplo.com/b', html: '<p>y</p>' }))).status).toBe(400);
  });

  it('rechaza una url que no es http', async () => {
    expect((await POST(peticion({ ...articulo, url: 'javascript:alert(1)' }))).status).toBe(400);
  });

  it('rechaza un cuerpo mayor de 5 MB', async () => {
    const grande = new Request('http://localhost/api/items', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        'content-length': String(6 * 1024 * 1024),
      },
      body: JSON.stringify(articulo),
    });
    expect((await POST(grande)).status).toBe(413);
  });
});
