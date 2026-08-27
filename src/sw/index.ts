/// <reference lib="webworker" />
import { CACHES, cachesObsoletas, destinoDe, esCacheFirst, esSWR, sobrantes } from './estrategia';

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
      const obsoletas = cachesObsoletas(await caches.keys(), [...VIGENTES]);
      for (const nombre of obsoletas) await caches.delete(nombre);
      await self.clients.claim();
    })(),
  );
});

/*
 * ignoreVary en todas las lecturas: Next responde con Vary sobre cabeceras
 * propias del enrutador, y sin esto cache.match no acierta nunca.
 */
const COINCIDENCIA: CacheQueryOptions = { ignoreVary: true };

async function desdeCache(peticion: Request, nombre: string): Promise<Response> {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(peticion, COINCIDENCIA);
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
    if (sirviendoDesdeCache) {
      sirviendoDesdeCache = false;
      void avisar('con-red');
    }
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(peticion, COINCIDENCIA);
    if (guardada) {
      sirviendoDesdeCache = true;
      void avisar('sin-red');
      return guardada;
    }
    if (esNavegacion) {
      const ultimo = await cache.match('/sin-conexion', COINCIDENCIA);
      if (ultimo) {
        sirviendoDesdeCache = true;
        void avisar('sin-red');
        return ultimo;
      }
    }
    throw error;
  }
}

let sirviendoDesdeCache = false;

type Aviso = 'sin-red' | 'con-red' | 'servido-de-cache';

async function avisar(tipo: Aviso) {
  for (const cliente of await self.clients.matchAll()) cliente.postMessage({ tipo });
}

/**
 * Pinta lo guardado al instante y revalida por detrás. El cliente recibe
 * 'servido-de-cache' y pide los datos frescos, así que lo que se ve al abrir
 * aparece de inmediato y se corrige solo en cuanto llega la red.
 */
async function desdeCacheYRevalidar(
  evento: FetchEvent,
  peticion: Request,
  nombre: string,
): Promise<Response> {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(peticion, COINCIDENCIA);

  const revalidacion = fetch(peticion)
    .then(async (respuesta) => {
      if (respuesta.ok && !respuesta.redirected) await cache.put(peticion, respuesta.clone());
      if (sirviendoDesdeCache) {
        sirviendoDesdeCache = false;
        void avisar('con-red');
      }
      return respuesta;
    })
    .catch(() => null);

  /*
   * Sin waitUntil el navegador puede matar el service worker en cuanto se
   * devuelve la copia guardada, y la revalidación no llega a completarse: la
   * caché no se actualiza nunca y se sirve la versión vieja para siempre.
   */
  evento.waitUntil(revalidacion);

  if (!guardada) {
    const fresca = await revalidacion;
    if (fresca) return fresca;

    const ultimo = await cache.match('/sin-conexion', COINCIDENCIA);
    if (ultimo) {
      sirviendoDesdeCache = true;
      void avisar('sin-red');
      return ultimo;
    }
    return new Response('Sin conexión y sin copia guardada', { status: 504 });
  }

  void revalidacion.then((fresca) => {
    if (!fresca) {
      sirviendoDesdeCache = true;
      void avisar('sin-red');
    }
  });

  void avisar('servido-de-cache');
  return guardada;
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Las peticiones RSC comparten URL con el documento pero devuelven otra cosa.
  // Cachearlas haría que offline se sirviera un payload donde toca una página.
  if (peticion.headers.has('RSC') || peticion.headers.has('Next-Router-State-Tree')) return;

  const esNavegacion = peticion.mode === 'navigate';
  const destino = destinoDe(peticion.url, peticion.method, esNavegacion, self.location.origin);
  if (!destino) return;

  const nombre = CACHES[destino];
  if (esCacheFirst(destino)) {
    evento.respondWith(desdeCache(peticion, nombre));
  } else if (esSWR(destino)) {
    evento.respondWith(desdeCacheYRevalidar(evento, peticion, nombre));
  } else {
    evento.respondWith(desdeRed(peticion, nombre, esNavegacion));
  }
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

  // Al servir una navegación desde la caché, el aviso llega a la página que se
  // está abandonando, no a la nueva. Por eso la nueva pregunta al cargar.
  if (datos?.tipo === 'estado') {
    evento.waitUntil(avisar(sirviendoDesdeCache ? 'sin-red' : 'con-red'));
    return;
  }

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
