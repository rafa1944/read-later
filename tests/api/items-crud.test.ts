import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listar } from '@/app/api/items/route';
import { DELETE, GET as detalle, PATCH } from '@/app/api/items/[id]/route';
import { createItem } from '@/services/items';
import { resetDb } from '../setup/reset';

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

async function crear(url: string) {
  const { id } = await createItem({
    url,
    title: `Artículo ${url}`,
    html: '<p>Un cuerpo con unas cuantas palabras dentro.</p>',
  });
  return id;
}

function patch(id: string, cambios: unknown) {
  return PATCH(
    new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cambios),
    }),
    contexto(id),
  );
}

beforeEach(resetDb);

describe('GET /api/items', () => {
  it('lista los pendientes', async () => {
    await crear('https://ejemplo.com/1');
    const respuesta = await listar(new Request('http://localhost/api/items?state=pendientes'));

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).items.length).toBe(1);
  });

  it('lista el archivo', async () => {
    const id = await crear('https://ejemplo.com/2');
    await patch(id, { archived: true });

    const respuesta = await listar(new Request('http://localhost/api/items?state=archivo'));
    expect((await respuesta.json()).items.length).toBe(1);
  });

  it('rechaza un state desconocido', async () => {
    expect((await listar(new Request('http://localhost/api/items?state=raro'))).status).toBe(400);
  });
});

describe('GET /api/items/:id', () => {
  it('devuelve el artículo con su HTML', async () => {
    const id = await crear('https://ejemplo.com/3');
    const cuerpo = await (await detalle(new Request('http://localhost/x'), contexto(id))).json();

    expect(cuerpo.item.contentHtml).toContain('<p>');
  });

  it('responde 404 si no existe', async () => {
    const respuesta = await detalle(
      new Request('http://localhost/x'),
      contexto('00000000-0000-0000-0000-000000000000'),
    );
    expect(respuesta.status).toBe(404);
  });
});

describe('PATCH /api/items/:id', () => {
  it('archiva y responde con el artículo actualizado', async () => {
    const id = await crear('https://ejemplo.com/4');
    const cuerpo = await (await patch(id, { archived: true })).json();

    expect(cuerpo.item.archivedAt).not.toBeNull();
  });

  it('es idempotente al repetir el mismo cambio', async () => {
    const id = await crear('https://ejemplo.com/5');
    const primera = await (await patch(id, { archived: true })).json();
    const segunda = await (await patch(id, { archived: true })).json();

    expect(segunda.item.archivedAt).toBe(primera.item.archivedAt);
  });

  it('guarda la posición de lectura', async () => {
    const id = await crear('https://ejemplo.com/6');
    const cuerpo = await (await patch(id, { scrollPct: 0.5 })).json();

    expect(cuerpo.item.scrollPct).toBeCloseTo(0.5, 5);
  });

  it('rechaza campos no reconocidos', async () => {
    const id = await crear('https://ejemplo.com/7');
    expect((await patch(id, { title: 'otro' })).status).toBe(400);
  });
});

describe('DELETE /api/items/:id', () => {
  it('borra y luego responde 404', async () => {
    const id = await crear('https://ejemplo.com/8');

    expect((await DELETE(new Request('http://localhost/x'), contexto(id))).status).toBe(200);
    expect((await DELETE(new Request('http://localhost/x'), contexto(id))).status).toBe(404);
  });
});
