// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { MAXIMO_ARTICULOS, sincronizar } from '@/lib/sincronizar';

function fetchFalso(items: { id: string }[], htmlPorId: Record<string, string> = {}) {
  const pedidas: string[] = [];

  const impl = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    pedidas.push(url);

    if (url.includes('/api/items?')) {
      return new Response(JSON.stringify({ items }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    const id = url.split('/a/')[1];
    if (id) return new Response(htmlPorId[id] ?? '<p>sin imágenes</p>');
    return new Response('', { status: 200 });
  }) as unknown as typeof fetch;

  return { impl, pedidas };
}

describe('sincronizar', () => {
  it('pide la lista de pendientes y luego cada artículo', async () => {
    const { impl, pedidas } = fetchFalso([{ id: 'a1' }, { id: 'a2' }]);

    const resumen = await sincronizar(impl);

    expect(pedidas.some((u) => u.includes('/api/items?state=pendientes'))).toBe(true);
    expect(pedidas).toContain('/a/a1');
    expect(pedidas).toContain('/a/a2');
    expect(resumen.paginas).toEqual(['/', '/archivo', '/a/a1', '/a/a2']);
  });

  it('descarga también las imágenes que lleva cada artículo', async () => {
    const { impl, pedidas } = fetchFalso([{ id: 'a1' }], {
      a1: '<img src="/api/img?url=x&amp;sig=1"><img src="/api/img?url=y&amp;sig=2">',
    });

    const resumen = await sincronizar(impl);

    expect(resumen.imagenes.length).toBe(2);
    expect(pedidas.some((u) => u.includes('/api/img?url=x&sig=1'))).toBe(true);
  });

  it('no pasa del máximo de artículos', async () => {
    const muchos = Array.from({ length: MAXIMO_ARTICULOS + 12 }, (_, i) => ({ id: `a${i}` }));
    const { impl } = fetchFalso(muchos);

    const resumen = await sincronizar(impl);

    expect(resumen.paginas.length).toBe(MAXIMO_ARTICULOS + 2);
  });

  it('un artículo que falla no tumba la sincronización', async () => {
    const impl = vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(entrada);
      if (url.includes('/api/items?')) {
        return new Response(JSON.stringify({ items: [{ id: 'a1' }, { id: 'a2' }] }));
      }
      if (url.endsWith('/a/a1')) throw new Error('sin red');
      return new Response('<p>bien</p>');
    }) as unknown as typeof fetch;

    const resumen = await sincronizar(impl);

    expect(resumen.paginas).toContain('/a/a2');
    expect(resumen.paginas).not.toContain('/a/a1');
  });
});
