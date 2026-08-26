// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarItem, cambiarArchivado } from '@/lib/acciones';
import { pendientes, vaciarCola } from '@/lib/cola';

beforeEach(vaciarCola);

describe('cambiarArchivado', () => {
  it('con red, envía y no encola nada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));

    expect(await cambiarArchivado('a1', true)).toBe('ok');
    expect(await pendientes()).toEqual([]);
  });

  it('sin red, encola la acción y lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));

    expect(await cambiarArchivado('a1', true)).toBe('encolada');
    const cola = await pendientes();
    expect(cola[0]).toMatchObject({ itemId: 'a1', metodo: 'PATCH', cuerpo: { archived: true } });
  });

  it('un error del servidor no se encola: reintentarlo no lo arreglaría', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })));

    expect(await cambiarArchivado('a1', true)).toBe('error');
    expect(await pendientes()).toEqual([]);
  });
});

describe('borrarItem', () => {
  it('sin red, encola el borrado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));

    expect(await borrarItem('a2')).toBe('encolada');
    expect((await pendientes())[0]).toMatchObject({ itemId: 'a2', metodo: 'DELETE' });
  });
});
