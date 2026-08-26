import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/items/route';
import { createItem } from '@/services/items';
import { resetDb } from '../setup/reset';

beforeEach(resetDb);

describe('GET /api/items?q=', () => {
  it('devuelve los artículos que coinciden, con fragmento', async () => {
    await createItem({
      url: 'https://ejemplo.com/pan',
      title: 'El pan de masa madre',
      html: '<p>Un cultivo de harina y agua con levaduras salvajes que leva el pan.</p>',
    });

    const respuesta = await GET(new Request('http://localhost/api/items?q=levaduras'));
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo.items.length).toBe(1);
    expect(cuerpo.items[0].snippet).toContain('<mark>');
  });

  it('una consulta sin resultados devuelve una lista vacía, no un error', async () => {
    const respuesta = await GET(new Request('http://localhost/api/items?q=zzzzz'));

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).items).toEqual([]);
  });
});
