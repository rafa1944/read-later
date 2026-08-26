export const CACHES = {
  estaticos: 'rl-estaticos-v1',
  paginas: 'rl-paginas-v1',
  imagenes: 'rl-imagenes-v1',
  datos: 'rl-datos-v1',
} as const;

export type Destino = keyof typeof CACHES | null;

const NUNCA = ['/login', '/api/auth/', '/sw.js'];

export function destinoDe(url: string, metodo: string, esNavegacion: boolean): Destino {
  if (metodo !== 'GET') return null;

  let objetivo: URL;
  try {
    objetivo = new URL(url);
  } catch {
    return null;
  }

  // En el service worker se compara con el propio origen; en las pruebas no hay
  // self.location y basta con que la ruta no case con ninguna conocida.
  const propio = typeof self !== 'undefined' ? self.location?.origin : undefined;
  if (propio && objetivo.origin !== propio) return null;

  const ruta = objetivo.pathname;
  if (NUNCA.some((prefijo) => ruta === prefijo || ruta.startsWith(prefijo))) return null;

  if (ruta.startsWith('/_next/static/') || ruta.startsWith('/iconos/')) return 'estaticos';
  if (ruta === '/api/img') return 'imagenes';
  if (ruta.startsWith('/api/items')) return 'datos';
  if (esNavegacion) return 'paginas';
  return null;
}

/** Solo lo inmutable. Lo demás va primero a la red para no mostrar algo viejo. */
export function esCacheFirst(destino: Destino): boolean {
  return destino === 'estaticos' || destino === 'imagenes';
}

export function sobrantes(enCache: string[], necesarias: string[]): string[] {
  const conjunto = new Set(necesarias);
  return enCache.filter((clave) => !conjunto.has(clave));
}

export function urlsDeImagen(html: string, origen: string): string[] {
  const encontradas = html.match(/\/api\/img\?[^"'\s>]+/g) ?? [];
  const absolutas = encontradas.map((ruta) =>
    new URL(ruta.replaceAll('&amp;', '&'), origen).toString(),
  );
  return [...new Set(absolutas)];
}
