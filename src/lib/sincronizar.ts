import { urlsDeImagen } from '@/sw/estrategia';

export const MAXIMO_ARTICULOS = 30;

export type ResumenSync = { paginas: string[]; imagenes: string[] };

/**
 * Calienta la caché del service worker: pide las listas, los artículos
 * pendientes más recientes y las imágenes de cada uno. Devuelve todo lo que ha
 * quedado guardado, para que el service worker pueda borrar el resto.
 */
export async function sincronizar(fetchImpl: typeof fetch = fetch): Promise<ResumenSync> {
  const origen = typeof location === 'undefined' ? 'http://localhost' : location.origin;

  const paginas: string[] = [];
  const imagenes: string[] = [];

  for (const ruta of ['/', '/archivo']) {
    try {
      await fetchImpl(ruta);
      paginas.push(ruta);
    } catch {
      // Sin red no hay nada que calentar.
    }
  }

  let ids: string[] = [];
  try {
    const respuesta = await fetchImpl(`/api/items?state=pendientes&limit=${MAXIMO_ARTICULOS}`);
    const cuerpo = (await respuesta.json()) as { items: { id: string }[] };
    ids = cuerpo.items.slice(0, MAXIMO_ARTICULOS).map((item) => item.id);
  } catch {
    return { paginas, imagenes };
  }

  for (const id of ids) {
    try {
      const respuesta = await fetchImpl(`/a/${id}`);
      const html = await respuesta.text();
      paginas.push(`/a/${id}`);

      for (const imagen of urlsDeImagen(html, origen)) {
        try {
          await fetchImpl(imagen);
          imagenes.push(imagen);
        } catch {
          // Una imagen que no llega no debe impedir leer el texto.
        }
      }
    } catch {
      // Un artículo que falla no tumba la sincronización de los demás.
    }
  }

  return { paginas, imagenes };
}
