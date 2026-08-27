export const CACHES = {
  estaticos: 'rl-estaticos-v1',
  paginas: 'rl-paginas-v1',
  imagenes: 'rl-imagenes-v1',
  datos: 'rl-datos-v1',
} as const;

export type Destino = keyof typeof CACHES | null;

const NUNCA = ['/login', '/api/auth/', '/sw.js'];

export function destinoDe(
  url: string,
  metodo: string,
  esNavegacion: boolean,
  origenPropio: string,
): Destino {
  if (metodo !== 'GET') return null;

  let objetivo: URL;
  try {
    objetivo = new URL(url);
  } catch {
    return null;
  }

  // El origen se pasa como argumento y no se lee de self.location: así la
  // decisión es una función pura y se puede probar entera.
  if (objetivo.origin !== origenPropio) return null;

  const ruta = objetivo.pathname;
  if (NUNCA.some((prefijo) => ruta === prefijo || ruta.startsWith(prefijo))) return null;

  if (ruta.startsWith('/_next/static/') || ruta.startsWith('/iconos/')) return 'estaticos';
  if (ruta === '/api/img') return 'imagenes';
  if (ruta.startsWith('/api/items')) return 'datos';
  if (ruta.startsWith('/api/') || ruta.startsWith('/_next/')) return null;

  // Cualquier otra ruta propia es una página. No basta con mirar si es una
  // navegación: al pulsar un enlace, Next pide el contenido por RSC y no como
  // documento, y el sincronizador tampoco navega, solo hace fetch.
  if (esNavegacion || !/\.[a-z0-9]{2,5}$/i.test(ruta)) return 'paginas';
  return 'estaticos';
}

/** Solo lo inmutable. Lo demás va primero a la red para no mostrar algo viejo. */
export function esCacheFirst(destino: Destino): boolean {
  return destino === 'estaticos' || destino === 'imagenes';
}

/**
 * Pintar de la caché y revalidar por detrás. Solo para páginas: son lo que
 * bloquea el primer pintado, y verlas al instante pesa más que verlas al día,
 * porque el cliente pide los datos frescos justo después.
 */
export function esSWR(destino: Destino): boolean {
  return destino === 'paginas';
}

export function sobrantes(enCache: string[], necesarias: string[]): string[] {
  const conjunto = new Set(necesarias);
  return enCache.filter((clave) => !conjunto.has(clave));
}
