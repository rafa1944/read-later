/// <reference lib="webworker" />
import { CACHES, destinoDe, esCacheFirst, sobrantes } from './estrategia';

declare const self: ServiceWorkerGlobalScope;

const VIGENTES = new Set<string>(Object.values(CACHES));

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHES.paginas);
      // Solo el último recurso: lo demás se cachea al usarse o al sincronizar.
      await cache.add('/sin-conexion').catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith('rl-') && !VIGENTES.has(nombre)) await caches.delete(nombre);
      }
      await self.clients.claim();
    })(),
  );
});

async function desdeCache(peticion: Request, nombre: string): Promise<Response> {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;

  const respuesta = await fetch(peticion);
  if (respuesta.ok) await cache.put(peticion, respuesta.clone());
  return respuesta;
}

async function desdeRed(
  peticion: Request,
  nombre: string,
  esNavegacion: boolean,
): Promise<Response> {
  const cache = await caches.open(nombre);
  try {
    const respuesta = await fetch(peticion);
    // Las redirecciones (a /login, por ejemplo) no se guardan: servidas desde
    // la caché, el navegador las rechaza por el modo de redirección.
    if (respuesta.ok && !respuesta.redirected) await cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(peticion);
    if (guardada) return guardada;
    if (esNavegacion) {
      const ultimo = await cache.match('/sin-conexion');
      if (ultimo) return ultimo;
    }
    throw error;
  }
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  const esNavegacion = peticion.mode === 'navigate';
  const destino = destinoDe(peticion.url, peticion.method, esNavegacion);
  if (!destino) return;

  const nombre = CACHES[destino];
  evento.respondWith(
    esCacheFirst(destino) ? desdeCache(peticion, nombre) : desdeRed(peticion, nombre, esNavegacion),
  );
});

function claveRelativa(url: string): string {
  const objetivo = new URL(url, self.location.origin);
  return objetivo.pathname + objetivo.search;
}

/**
 * El sincronizador manda las claves que siguen haciendo falta y aquí se borra
 * el resto: así la caché no crece sin límite y lo primero que se va es lo que
 * ya no está en pendientes.
 */
self.addEventListener('message', (evento) => {
  const datos = evento.data as { tipo?: string; paginas?: string[]; imagenes?: string[] };
  if (datos?.tipo !== 'limpiar') return;

  evento.waitUntil(
    (async () => {
      const grupos = [
        [CACHES.paginas, [...(datos.paginas ?? []), '/sin-conexion']],
        [CACHES.imagenes, datos.imagenes ?? []],
      ] as const;

      for (const [nombre, necesarias] of grupos) {
        const cache = await caches.open(nombre);
        const claves = await cache.keys();
        const enCache = claves.map((peticion) => claveRelativa(peticion.url));
        const aBorrar = new Set(sobrantes(enCache, necesarias.map(claveRelativa)));

        for (const peticion of claves) {
          if (aBorrar.has(claveRelativa(peticion.url))) await cache.delete(peticion);
        }
      }
    })(),
  );
});
