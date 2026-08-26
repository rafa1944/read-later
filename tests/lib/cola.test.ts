// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encolar, enviarPendientes, pendientes, vaciarCola } from '@/lib/cola';

beforeEach(vaciarCola);

describe('cola de acciones', () => {
  it('guarda una acción y la devuelve', async () => {
    await encolar({ itemId: 'a1', metodo: 'PATCH', cuerpo: { archived: true } });

    const cola = await pendientes();
    expect(cola.length).toBe(1);
    expect(cola[0].itemId).toBe('a1');
  });

  it('la última acción sobre el mismo artículo sustituye a la anterior', async () => {
    await encolar({ itemId: 'a1', metodo: 'PATCH', cuerpo: { archived: true } });
    await encolar({ itemId: 'a1', metodo: 'PATCH', cuerpo: { archived: false } });

    const cola = await pendientes();
    expect(cola.length).toBe(1);
    expect(cola[0].cuerpo).toEqual({ archived: false });
  });

  it('distingue archivar de borrar sobre el mismo artículo', async () => {
    await encolar({ itemId: 'a1', metodo: 'PATCH', cuerpo: { archived: true } });
    await encolar({ itemId: 'a1', metodo: 'DELETE' });

    expect((await pendientes()).length).toBe(2);
  });

  it('envía lo pendiente y vacía la cola', async () => {
    await encolar({ itemId: 'a1', metodo: 'PATCH', cuerpo: { archived: true } });
    const impl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

    expect(await enviarPendientes(impl)).toBe(1);
    expect(await pendientes()).toEqual([]);
  });

  it('conserva lo que no se pudo enviar', async () => {
    await encolar({ itemId: 'a1', metodo: 'PATCH', cuerpo: { archived: true } });
    const impl = vi.fn(async () => {
      throw new Error('sin red');
    }) as unknown as typeof fetch;

    expect(await enviarPendientes(impl)).toBe(0);
    expect((await pendientes()).length).toBe(1);
  });

  it('descarta una acción sobre un artículo que ya no existe', async () => {
    await encolar({ itemId: 'fantasma', metodo: 'DELETE' });
    const impl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;

    await enviarPendientes(impl);
    expect(await pendientes()).toEqual([]);
  });
});
