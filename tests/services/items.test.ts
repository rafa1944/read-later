import { beforeEach, describe, expect, it } from 'vitest';
import { createItem, deleteItem, getItem, listItems, updateItem } from '@/services/items';
import { resetDb } from '../setup/reset';

const base = {
  url: 'https://ejemplo.com/articulo',
  title: 'Un artículo',
  html: '<p>Cuerpo del artículo con unas cuantas palabras dentro.</p>',
};

beforeEach(resetDb);

describe('createItem', () => {
  it('crea el artículo saneando el HTML y derivando texto y palabras', async () => {
    const { id, created } = await createItem({
      ...base,
      html: '<p>Hola <script>malo()</script>mundo</p>',
    });

    expect(created).toBe(true);
    const guardado = await getItem(id);
    expect(guardado?.contentHtml).not.toContain('script');
    expect(guardado?.wordCount).toBeGreaterThan(0);
  });

  it('canonicaliza la URL antes de guardarla', async () => {
    const { id } = await createItem({ ...base, url: 'https://ejemplo.com/articulo?utm_source=x' });
    expect((await getItem(id))?.url).toBe('https://ejemplo.com/articulo');
  });

  it('no duplica una URL ya guardada', async () => {
    const primero = await createItem(base);
    const segundo = await createItem({ ...base, title: 'Otro título' });

    expect(segundo.created).toBe(false);
    expect(segundo.id).toBe(primero.id);
    expect((await listItems({ state: 'pendientes' })).length).toBe(1);
  });

  it('devuelve a pendientes un artículo archivado que se vuelve a guardar', async () => {
    const { id } = await createItem(base);
    await updateItem(id, { archived: true });

    await createItem(base);

    expect((await getItem(id))?.archivedAt).toBeNull();
  });

  it('rechaza una URL no válida', async () => {
    await expect(createItem({ ...base, url: 'no-es-una-url' })).rejects.toThrow();
  });
});

describe('listItems', () => {
  it('separa pendientes de archivo y ordena por fecha de guardado descendente', async () => {
    const viejo = await createItem({ ...base, url: 'https://ejemplo.com/1' });
    const nuevo = await createItem({ ...base, url: 'https://ejemplo.com/2' });
    await updateItem(viejo.id, { archived: true });

    const pendientes = await listItems({ state: 'pendientes' });
    const archivo = await listItems({ state: 'archivo' });

    expect(pendientes.map((i) => i.id)).toEqual([nuevo.id]);
    expect(archivo.map((i) => i.id)).toEqual([viejo.id]);
  });

  it('respeta el límite', async () => {
    await createItem({ ...base, url: 'https://ejemplo.com/1' });
    await createItem({ ...base, url: 'https://ejemplo.com/2' });
    expect((await listItems({ state: 'pendientes', limit: 1 })).length).toBe(1);
  });
});

describe('updateItem', () => {
  it('archiva y desarchiva', async () => {
    const { id } = await createItem(base);

    expect((await updateItem(id, { archived: true }))?.archivedAt).toBeInstanceOf(Date);
    expect((await updateItem(id, { archived: false }))?.archivedAt).toBeNull();
  });

  it('es idempotente: repetir el mismo cambio no altera el resultado', async () => {
    const { id } = await createItem(base);
    const primera = await updateItem(id, { archived: true });
    const segunda = await updateItem(id, { archived: true });

    expect(segunda?.archivedAt?.getTime()).toBe(primera?.archivedAt?.getTime());
  });

  it('guarda la posición de lectura acotada entre 0 y 1', async () => {
    const { id } = await createItem(base);

    expect((await updateItem(id, { scrollPct: 0.42 }))?.scrollPct).toBeCloseTo(0.42, 5);
    expect((await updateItem(id, { scrollPct: 5 }))?.scrollPct).toBe(1);
    expect((await updateItem(id, { scrollPct: -1 }))?.scrollPct).toBe(0);
  });

  it('devuelve null si el artículo no existe', async () => {
    expect(await updateItem('00000000-0000-0000-0000-000000000000', { archived: true })).toBeNull();
  });
});

describe('deleteItem', () => {
  it('borra de verdad', async () => {
    const { id } = await createItem(base);

    expect(await deleteItem(id)).toBe(true);
    expect(await getItem(id)).toBeNull();
    expect(await deleteItem(id)).toBe(false);
  });
});
