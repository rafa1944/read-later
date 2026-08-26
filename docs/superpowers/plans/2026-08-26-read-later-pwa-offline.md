# Read Later — Plan de implementación: PWA y lectura sin conexión

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar la app en el móvil y poder leer en el metro: abrirla sin red,
ver la lista de pendientes, abrir cualquiera de los artículos recientes con sus
imágenes, y archivar sabiendo que el cambio se enviará al volver la conexión.

**Architecture:** Un service worker con tres estrategias distintas según el tipo
de recurso; un sincronizador de cliente que, mientras hay red, calienta la caché
con los artículos pendientes recientes y sus imágenes; y una cola en IndexedDB
para las acciones hechas sin conexión. La lógica que decide qué se cachea y qué
se descarta vive en módulos puros con pruebas; el service worker es la capa
delgada que la ejecuta.

**Tech Stack:** el del núcleo, más `fake-indexeddb` para probar la cola. El
service worker se compila con el esbuild que ya usa la extensión.

**Spec:** `docs/superpowers/specs/2026-08-26-read-later-design.md` (sección
«Offline»)

**Planes previos:** núcleo, extensión, búsqueda y ajustes.

## Global Constraints

Se heredan las del núcleo. Añadido:

- Nada de librerías de PWA (Workbox y similares): el service worker es de
  ~150 líneas y una dependencia que genera código opaco no se paga aquí.
- **Ninguna estrategia sirve datos obsoletos sin decirlo.** Si lo que se muestra
  viene de la caché y no hay red, la interfaz lo indica.
- El service worker se genera con esbuild desde `src/sw/`: la lógica que decide
  se prueba con Vitest, no se escribe a mano en `public/`.
- Las decisiones de caché son deterministas: se cachea lo que el sincronizador
  dice, y se borra lo que ya no está en esa lista. Nada de presupuestos por
  bytes, que no se pueden comprobar de forma fiable desde el navegador.
- La posición de lectura **no** se encola: si se pierde, no pasa nada. Solo se
  encolan archivar, desarchivar y borrar.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/sw/estrategia.ts` | Funciones puras: qué caché toca cada URL, qué sobra al limpiar, qué imágenes lleva un artículo |
| `src/sw/index.ts` | El service worker: instalación, activación e intercepción |
| `scripts/build-sw.mjs` | Compila `src/sw/index.ts` a `public/sw.js` |
| `src/app/manifest.ts` | Manifiesto de la PWA |
| `src/app/sin-conexion/page.tsx` | Página de último recurso |
| `src/components/registrar-sw.tsx` | Registra el service worker |
| `src/components/sincronizador.tsx` | Calienta la caché mientras hay red |
| `src/lib/cola.ts` | Cola de acciones pendientes en IndexedDB |
| `src/components/estado-red.tsx` | Indicador de «sin conexión» |
| `public/iconos/` | Iconos de la PWA |

---

### Task 1: Manifiesto, iconos y página de último recurso

**Files:**
- Create: `src/app/manifest.ts`, `src/app/sin-conexion/page.tsx`,
  `public/iconos/192.png`, `public/iconos/512.png`, `public/iconos/180.png`
- Modify: `src/app/layout.tsx`, `src/proxy.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest`, la ruta `/sin-conexion`.

- [ ] **Step 1: Generar los iconos**

El mismo cuadrado con la espina ámbar que usa la extensión, para que en la
pantalla de inicio del móvil se reconozca:

```bash
mkdir -p public/iconos
python3 - <<'PY'
import struct, zlib
from pathlib import Path

FONDO = (20, 23, 26)
AMBAR = (224, 164, 75)

def png(lado: int) -> bytes:
    filas = []
    margen = max(1, lado // 6)
    ancho = max(1, lado // 9)
    for y in range(lado):
        fila = bytearray([0])
        for x in range(lado):
            dentro = margen <= y < lado - margen and margen <= x < margen + ancho
            fila += bytes(AMBAR if dentro else FONDO)
        filas.append(bytes(fila))
    crudo = zlib.compress(b''.join(filas), 9)

    def bloque(tipo: bytes, datos: bytes) -> bytes:
        return (struct.pack('>I', len(datos)) + tipo + datos
                + struct.pack('>I', zlib.crc32(tipo + datos) & 0xffffffff))

    return (b'\x89PNG\r\n\x1a\n'
            + bloque(b'IHDR', struct.pack('>IIBBBBB', lado, lado, 8, 2, 0, 0, 0))
            + bloque(b'IDAT', crudo)
            + bloque(b'IEND', b''))

for lado in (180, 192, 512):
    Path(f'public/iconos/{lado}.png').write_bytes(png(lado))
    print(lado)
PY
```

- [ ] **Step 2: Escribir el manifiesto**

```bash
mkdir -p src/app/sin-conexion
cat > src/app/manifest.ts <<'EOF'
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Read Later',
    short_name: 'Read Later',
    description: 'Tu cola de lectura, también sin conexión.',
    start_url: '/',
    display: 'standalone',
    background_color: '#14171a',
    theme_color: '#14171a',
    lang: 'es',
    icons: [
      { src: '/iconos/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/iconos/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/iconos/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
EOF
```

- [ ] **Step 3: Escribir la página de último recurso**

```bash
cat > src/app/sin-conexion/page.tsx <<'EOF'
import Link from 'next/link';

export default function SinConexion() {
  return (
    <main className="columna">
      <h1>Sin conexión</h1>
      <p className="vacio">
        Esta página no estaba guardada para leer sin red.{' '}
        <Link href="/">Vuelve a pendientes</Link>: lo que se sincronizó sí se puede leer.
      </p>
    </main>
  );
}
EOF
```

- [ ] **Step 4: Dejar pasar el manifiesto y el service worker sin sesión**

Un service worker que redirige a `/login` no se registra nunca, y un manifiesto
protegido impide instalar la app.

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/proxy.ts')
s = p.read_text()
s = s.replace(
    "const PUBLICAS = ['/login', '/api/auth/login', '/api/img'];",
    "const PUBLICAS = [\n  '/login',\n  '/api/auth/login',\n  '/api/img',\n  // El service worker y el manifiesto tienen que servirse sin sesión: si\n  // redirigen a /login, ni se registra ni se puede instalar la app.\n  '/sw.js',\n  '/manifest.webmanifest',\n  '/iconos',\n  '/sin-conexion',\n];",
)
p.write_text(s)
PY
```

- [ ] **Step 5: Enlazar el icono de iOS**

Safari en iOS ignora los iconos del manifiesto para la pantalla de inicio.

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/app/layout.tsx')
s = p.read_text()
s = s.replace(
    "export const metadata: Metadata = {\n  title: 'Read Later',\n};",
    "export const metadata: Metadata = {\n  title: 'Read Later',\n  appleWebApp: { capable: true, title: 'Read Later', statusBarStyle: 'default' },\n  icons: { apple: '/iconos/180.png' },\n};\n\nexport const viewport = {\n  themeColor: [\n    { media: '(prefers-color-scheme: light)', color: '#e9eae5' },\n    { media: '(prefers-color-scheme: dark)', color: '#14171a' },\n  ],\n  viewportFit: 'cover' as const,\n};",
)
p.write_text(s)
PY
npm run build
```

Expected: entre las rutas aparece `/manifest.webmanifest` y `/sin-conexion`.

- [ ] **Step 6: Commit**

```bash
git add src/app/manifest.ts src/app/sin-conexion src/app/layout.tsx src/proxy.ts public/iconos
git commit -m "$(printf 'Añadir manifiesto, iconos y página de último recurso de la PWA\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: Estrategias de caché y service worker

**Files:**
- Create: `src/sw/estrategia.ts`, `src/sw/index.ts`, `scripts/build-sw.mjs`,
  `tests/sw/estrategia.test.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces, en `src/sw/estrategia.ts`:

```ts
export const CACHES = { estaticos: 'rl-estaticos-v1', paginas: 'rl-paginas-v1',
                        imagenes: 'rl-imagenes-v1', datos: 'rl-datos-v1' } as const;
export type Destino = keyof typeof CACHES | null;
export function destinoDe(url: string, metodo: string, esNavegacion: boolean): Destino;
export function esCacheFirst(destino: Destino): boolean;
export function sobrantes(enCache: string[], necesarias: string[]): string[];
export function urlsDeImagen(html: string, origen: string): string[];
```

- [ ] **Step 1: Escribir el test que falla**

```bash
mkdir -p tests/sw
cat > tests/sw/estrategia.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { destinoDe, esCacheFirst, sobrantes, urlsDeImagen } from '@/sw/estrategia';

const O = 'https://leer.ejemplo.com';

describe('destinoDe', () => {
  it('manda los recursos compilados de Next a los estáticos', () => {
    expect(destinoDe(`${O}/_next/static/chunks/main.js`, 'GET', false)).toBe('estaticos');
    expect(destinoDe(`${O}/iconos/192.png`, 'GET', false)).toBe('estaticos');
  });

  it('manda las navegaciones a las páginas', () => {
    expect(destinoDe(`${O}/`, 'GET', true)).toBe('paginas');
    expect(destinoDe(`${O}/a/123`, 'GET', true)).toBe('paginas');
  });

  it('manda las imágenes de artículo a su propia caché', () => {
    expect(destinoDe(`${O}/api/img?url=x&sig=y`, 'GET', false)).toBe('imagenes');
  });

  it('manda las listas y los artículos en JSON a los datos', () => {
    expect(destinoDe(`${O}/api/items?state=pendientes`, 'GET', false)).toBe('datos');
    expect(destinoDe(`${O}/api/items/abc`, 'GET', false)).toBe('datos');
  });

  it('no cachea nada que no sea GET', () => {
    expect(destinoDe(`${O}/api/items/abc`, 'PATCH', false)).toBeNull();
    expect(destinoDe(`${O}/api/items`, 'POST', false)).toBeNull();
  });

  it('no cachea el login ni la salida', () => {
    expect(destinoDe(`${O}/api/auth/login`, 'POST', false)).toBeNull();
    expect(destinoDe(`${O}/login`, 'GET', true)).toBeNull();
  });

  it('no cachea nada de otro origen', () => {
    expect(destinoDe('https://otro.example/a.png', 'GET', false)).toBeNull();
  });
});

describe('esCacheFirst', () => {
  it('solo lo inmutable se sirve primero desde la caché', () => {
    expect(esCacheFirst('estaticos')).toBe(true);
    expect(esCacheFirst('imagenes')).toBe(true);
    // Las páginas y los datos van primero a la red: si hay conexión, lo que se
    // ve tiene que estar al día.
    expect(esCacheFirst('paginas')).toBe(false);
    expect(esCacheFirst('datos')).toBe(false);
  });
});

describe('sobrantes', () => {
  it('devuelve lo que está en la caché y ya no hace falta', () => {
    expect(sobrantes(['/a/1', '/a/2', '/a/3'], ['/a/2'])).toEqual(['/a/1', '/a/3']);
  });

  it('no devuelve nada si todo sigue haciendo falta', () => {
    expect(sobrantes(['/a/1'], ['/a/1', '/a/2'])).toEqual([]);
  });
});

describe('urlsDeImagen', () => {
  it('saca las imágenes del proxy de un artículo, con las entidades resueltas', () => {
    const html = '<img src="/api/img?url=https%3A%2F%2Fcdn.com%2Fa.jpg&amp;sig=abc" loading="lazy">';
    expect(urlsDeImagen(html, O)).toEqual([
      `${O}/api/img?url=https%3A%2F%2Fcdn.com%2Fa.jpg&sig=abc`,
    ]);
  });

  it('no repite la misma imagen', () => {
    const html = '<img src="/api/img?url=a&amp;sig=1"><img src="/api/img?url=a&amp;sig=1">';
    expect(urlsDeImagen(html, O).length).toBe(1);
  });

  it('devuelve vacío si el artículo no lleva imágenes', () => {
    expect(urlsDeImagen('<p>Solo texto</p>', O)).toEqual([]);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/sw/estrategia.test.ts`
Expected: FAIL, no se resuelve `@/sw/estrategia`.

- [ ] **Step 3: Implementar las estrategias**

```bash
mkdir -p src/sw
cat > src/sw/estrategia.ts <<'EOF'
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

  if (typeof self !== 'undefined' && self.location && objetivo.origin !== self.location.origin) {
    return null;
  }

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
  const absolutas = encontradas.map((ruta) => new URL(ruta.replaceAll('&amp;', '&'), origen).toString());
  return [...new Set(absolutas)];
}
EOF
```

La comprobación de origen usa `self.location` y por eso se guarda tras un
`typeof`: en las pruebas de Vitest no hay `self.location`, y ahí solo interesa
la parte de decisión por ruta. El caso de otro origen se cubre igualmente porque
`new URL` de un dominio ajeno no casa con ninguna de las rutas propias.

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/sw/estrategia.test.ts`
Expected: PASS, doce tests.

- [ ] **Step 5: Escribir el service worker**

```bash
cat > src/sw/index.ts <<'EOF'
/// <reference lib="webworker" />
import { CACHES, destinoDe, esCacheFirst, sobrantes } from './estrategia';

declare const self: ServiceWorkerGlobalScope;

const VIGENTES = new Set<string>(Object.values(CACHES));

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHES.paginas);
      // Solo el último recurso: el resto se cachea al usarse o al sincronizar.
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
    // Las redirecciones (a /login, por ejemplo) no se guardan: al servirlas
    // desde la caché el navegador las rechaza por modo de redirección.
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
    esCacheFirst(destino)
      ? desdeCache(peticion, nombre)
      : desdeRed(peticion, nombre, esNavegacion),
  );
});

/**
 * El sincronizador manda las claves que siguen haciendo falta y aquí se borra
 * todo lo demás. Así la caché no crece sin límite y lo primero que se va es lo
 * que ya no está en pendientes.
 */
self.addEventListener('message', (evento) => {
  const datos = evento.data as { tipo?: string; paginas?: string[]; imagenes?: string[] };
  if (datos?.tipo !== 'limpiar') return;

  evento.waitUntil(
    (async () => {
      for (const [nombre, necesarias] of [
        [CACHES.paginas, [...(datos.paginas ?? []), '/sin-conexion']],
        [CACHES.imagenes, datos.imagenes ?? []],
      ] as const) {
        const cache = await caches.open(nombre);
        const claves = await cache.keys();
        const rutas = claves.map((c) => new URL(c.url).pathname + new URL(c.url).search);
        const necesariasRelativas = necesarias.map((u) => {
          const url = new URL(u, self.location.origin);
          return url.pathname + url.search;
        });

        for (const ruta of sobrantes(rutas, necesariasRelativas)) {
          const clave = claves.find(
            (c) => new URL(c.url).pathname + new URL(c.url).search === ruta,
          );
          if (clave) await cache.delete(clave);
        }
      }
    })(),
  );
});
EOF
cat > scripts/build-sw.mjs <<'EOF'
import { build } from 'esbuild';

await build({
  entryPoints: ['src/sw/index.ts'],
  outfile: 'public/sw.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  logLevel: 'warning',
});
EOF
mkdir -p scripts
npm pkg set scripts.build:sw="node scripts/build-sw.mjs"
npm pkg set scripts.prebuild="node scripts/build-sw.mjs"
npm pkg set scripts.predev="node scripts/build-sw.mjs"
printf 'public/sw.js\n' >> .gitignore
npm run build:sw && head -3 public/sw.js
```

- [ ] **Step 6: Commit**

```bash
git add src/sw scripts tests/sw package.json .gitignore
git commit -m "$(printf 'Añadir service worker con estrategias de caché probadas\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: Registro y sincronizador

**Files:**
- Create: `src/components/registrar-sw.tsx`, `src/components/sincronizador.tsx`,
  `src/lib/sincronizar.ts`, `tests/lib/sincronizar.test.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces, en `@/lib/sincronizar`:

```ts
export const MAXIMO_ARTICULOS = 30;
export type ResumenSync = { paginas: string[]; imagenes: string[] };
export async function sincronizar(fetchImpl?: typeof fetch): Promise<ResumenSync>;
```

- [ ] **Step 1: Escribir el test que falla**

Se prueba contra un `fetch` de mentira porque lo que interesa es la coreografía:
qué pide, en qué orden y qué devuelve para la limpieza.

```bash
cat > tests/lib/sincronizar.test.ts <<'EOF'
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

    expect(pedidas[0]).toContain('/api/items?state=pendientes');
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
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/lib/sincronizar.test.ts`
Expected: FAIL, no se resuelve `@/lib/sincronizar`.

- [ ] **Step 3: Implementar**

```bash
cat > src/lib/sincronizar.ts <<'EOF'
import { urlsDeImagen } from '@/sw/estrategia';

export const MAXIMO_ARTICULOS = 30;

export type ResumenSync = { paginas: string[]; imagenes: string[] };

/**
 * Calienta la caché del service worker: pide las listas, los artículos
 * pendientes más recientes y las imágenes de cada uno. Devuelve todo lo que ha
 * quedado guardado para que el service worker pueda borrar el resto.
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
EOF
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/lib/sincronizar.test.ts`
Expected: PASS, cuatro tests.

- [ ] **Step 5: Registrar el service worker y lanzar el sincronizador**

```bash
cat > src/components/registrar-sw.tsx <<'EOF'
'use client';

import { useEffect } from 'react';

export function RegistrarSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[Read Later] no se pudo registrar el service worker', error);
    });
  }, []);

  return null;
}
EOF
cat > src/components/sincronizador.tsx <<'EOF'
'use client';

import { useEffect } from 'react';
import { sincronizar } from '@/lib/sincronizar';

const CLAVE_ULTIMA = 'read-later:ultima-sync';
const ESPERA_MINIMA_MS = 5 * 60 * 1000;

export function Sincronizador() {
  useEffect(() => {
    let cancelado = false;

    async function ejecutar() {
      if (cancelado || !navigator.onLine) return;

      const ultima = Number(localStorage.getItem(CLAVE_ULTIMA) ?? '0');
      if (Date.now() - ultima < ESPERA_MINIMA_MS) return;

      const resumen = await sincronizar();
      if (cancelado) return;

      localStorage.setItem(CLAVE_ULTIMA, String(Date.now()));
      const registro = await navigator.serviceWorker.ready;
      registro.active?.postMessage({ tipo: 'limpiar', ...resumen });
    }

    // Se espera a que la página esté quieta: sincronizar no debe competir con
    // lo que la persona está intentando leer ahora mismo.
    const temporizador = setTimeout(() => void ejecutar(), 3000);
    window.addEventListener('online', () => void ejecutar());

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, []);

  return null;
}
EOF
python3 - <<'PY'
from pathlib import Path
p = Path('src/app/layout.tsx')
s = p.read_text()
s = s.replace(
    "import { GUION_INICIAL } from '@/lib/ajustes';",
    "import { RegistrarSW } from '@/components/registrar-sw';\nimport { Sincronizador } from '@/components/sincronizador';\nimport { GUION_INICIAL } from '@/lib/ajustes';",
)
s = s.replace("      <body>{children}</body>",
              "      <body>\n        {children}\n        <RegistrarSW />\n        <Sincronizador />\n      </body>")
p.write_text(s)
PY
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sincronizar.ts src/components/registrar-sw.tsx src/components/sincronizador.tsx src/app/layout.tsx tests/lib/sincronizar.test.ts
git commit -m "$(printf 'Añadir registro del service worker y sincronizador de artículos\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: Cola de acciones sin conexión

**Files:**
- Create: `src/lib/cola.ts`, `tests/lib/cola.test.ts`
- Modify: `src/components/item-actions.tsx`, `src/app/globals.css`,
  `package.json`

**Interfaces:**
- Produces, en `@/lib/cola`:

```ts
export type Accion = { clave: string; itemId: string; metodo: 'PATCH' | 'DELETE'; cuerpo?: unknown };
export async function encolar(accion: Omit<Accion, 'clave'>): Promise<void>;
export async function pendientes(): Promise<Accion[]>;
export async function vaciarCola(): Promise<void>;
export async function enviarPendientes(fetchImpl?: typeof fetch): Promise<number>;
```

- [ ] **Step 1: Instalar el doble de IndexedDB**

```bash
npm i -D fake-indexeddb
```

- [ ] **Step 2: Escribir el test que falla**

```bash
cat > tests/lib/cola.test.ts <<'EOF'
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
EOF
```

Que un 404 vacíe la acción en vez de reintentar para siempre importa: si el
artículo se borró desde el escritorio, la acción encolada en el móvil no tiene
a dónde ir.

- [ ] **Step 3: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/lib/cola.test.ts`
Expected: FAIL, no se resuelve `@/lib/cola`.

- [ ] **Step 4: Implementar**

```bash
cat > src/lib/cola.ts <<'EOF'
export type Accion = {
  clave: string;
  itemId: string;
  metodo: 'PATCH' | 'DELETE';
  cuerpo?: unknown;
};

const BASE = 'read-later';
const ALMACEN = 'acciones';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore(ALMACEN, { keyPath: 'clave' });
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function transaccion<T>(
  modo: IDBTransactionMode,
  operacion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (base) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = base.transaction(ALMACEN, modo);
        const peticion = operacion(tx.objectStore(ALMACEN));
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => rechazar(peticion.error);
        tx.oncomplete = () => base.close();
      }),
  );
}

/**
 * La clave es artículo + método, así que repetir una acción sobre el mismo
 * artículo sustituye a la anterior: gana la última, que es lo que quiere quien
 * la hizo.
 */
export async function encolar(accion: Omit<Accion, 'clave'>): Promise<void> {
  const completa: Accion = { ...accion, clave: `${accion.itemId}:${accion.metodo}` };
  await transaccion('readwrite', (almacen) => almacen.put(completa));
}

export async function pendientes(): Promise<Accion[]> {
  return transaccion<Accion[]>('readonly', (almacen) => almacen.getAll());
}

export async function vaciarCola(): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.clear());
}

async function descartar(clave: string): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.delete(clave));
}

export async function enviarPendientes(fetchImpl: typeof fetch = fetch): Promise<number> {
  let enviadas = 0;

  for (const accion of await pendientes()) {
    try {
      const respuesta = await fetchImpl(`/api/items/${accion.itemId}`, {
        method: accion.metodo,
        ...(accion.cuerpo
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(accion.cuerpo) }
          : {}),
      });

      // 404: el artículo ya no está. Reintentarlo eternamente no arregla nada.
      if (respuesta.ok || respuesta.status === 404) {
        await descartar(accion.clave);
        if (respuesta.ok) enviadas += 1;
      }
    } catch {
      // Sigue sin red: se queda en la cola.
    }
  }

  return enviadas;
}
EOF
```

- [ ] **Step 5: Ejecutar el test**

Run: `npx vitest run tests/lib/cola.test.ts`
Expected: PASS, seis tests.

- [ ] **Step 6: Usar la cola en las acciones**

Cuando no hay red, la fila no desaparece: se queda marcada como pendiente de
enviar. Es más honesto que fingir que ya está archivada.

```bash
cat > src/components/item-actions.tsx <<'EOF'
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { encolar, enviarPendientes } from '@/lib/cola';

type Props = { id: string; archivado: boolean; alBorrar?: 'refrescar' | 'volver' };

export function ItemActions({ id, archivado, alBorrar = 'refrescar' }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [encolada, setEncolada] = useState<string | null>(null);

  useEffect(() => {
    async function vaciar() {
      if ((await enviarPendientes()) > 0) {
        setEncolada(null);
        iniciar(() => router.refresh());
      }
    }

    void vaciar();
    window.addEventListener('online', () => void vaciar());
    return () => window.removeEventListener('online', () => void vaciar());
  }, [router]);

  async function llamar(metodo: 'PATCH' | 'DELETE', cuerpo?: unknown) {
    setError(null);

    try {
      const respuesta = await fetch(`/api/items/${id}`, {
        method: metodo,
        ...(cuerpo
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }
          : {}),
      });
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      if (metodo === 'DELETE' && alBorrar === 'volver') {
        iniciar(() => router.push('/'));
        return;
      }
      iniciar(() => router.refresh());
    } catch {
      // Sin red: se guarda para enviarlo luego y se dice claramente.
      await encolar({ itemId: id, metodo, cuerpo });
      setEncolada(metodo === 'DELETE' ? 'Se borrará al recuperar la conexión' : 'Se enviará al recuperar la conexión');
    }
  }

  return (
    <div className="acciones">
      <button
        type="button"
        disabled={pendiente || encolada !== null}
        onClick={() => llamar('PATCH', { archived: !archivado })}
      >
        {archivado ? 'Devolver' : 'Archivar'}
      </button>
      <button
        type="button"
        className="destructiva"
        disabled={pendiente || encolada !== null}
        onClick={() => {
          if (confirm('¿Borrar este artículo? No se puede deshacer.')) llamar('DELETE');
        }}
      >
        Borrar
      </button>
      {encolada && <span className="pendiente rotulo">{encolada}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
EOF
cat >> src/app/globals.css <<'EOF'

.pendiente {
  color: var(--lampara);
  font-size: 0.62rem;
}
EOF
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/cola.ts src/components/item-actions.tsx src/app/globals.css tests/lib/cola.test.ts package.json
git commit -m "$(printf 'Añadir cola de acciones sin conexión con envío al volver la red\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 5: Indicador de conexión

**Files:**
- Create: `src/components/estado-red.tsx`
- Modify: `src/components/cabecera.tsx`, `src/app/globals.css`

- [ ] **Step 1: Escribir el componente**

```bash
cat > src/components/estado-red.tsx <<'EOF'
'use client';

import { useEffect, useState } from 'react';

export function EstadoRed() {
  const [conectado, setConectado] = useState(true);

  useEffect(() => {
    setConectado(navigator.onLine);

    const arriba = () => setConectado(true);
    const abajo = () => setConectado(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);

    return () => {
      window.removeEventListener('online', arriba);
      window.removeEventListener('offline', abajo);
    };
  }, []);

  if (conectado) return null;

  return (
    <span className="sin-red rotulo" role="status">
      Sin conexión
    </span>
  );
}
EOF
python3 - <<'PY'
from pathlib import Path
p = Path('src/components/cabecera.tsx')
s = p.read_text()
s = s.replace("import { usePathname } from 'next/navigation';",
              "import { usePathname } from 'next/navigation';\nimport { EstadoRed } from './estado-red';")
s = s.replace("      ))}\n    </header>",
              "      ))}\n      <EstadoRed />\n    </header>")
p.write_text(s)
PY
cat >> src/app/globals.css <<'EOF'

.sin-red {
  margin-left: auto;
  padding: 0.2rem 0.45rem;
  border: 1px solid var(--lampara);
  color: var(--lampara);
  font-size: 0.6rem;
}
EOF
```

- [ ] **Step 2: Commit**

```bash
git add src/components/estado-red.tsx src/components/cabecera.tsx src/app/globals.css
git commit -m "$(printf 'Añadir indicador de falta de conexión\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 6: Prueba de navegador sin conexión

Es la prueba que de verdad demuestra que el plan funciona.

**Files:**
- Create: `e2e/offline.spec.ts`

- [ ] **Step 1: Escribir la prueba**

```bash
cat > e2e/offline.spec.ts <<'EOF'
import { expect, test } from '@playwright/test';

let TITULO = '';

test.beforeEach(async ({ request, page }, info) => {
  TITULO = `Artículo para leer sin red ${info.testId}`;
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/offline-${info.testId}`,
      title: TITULO,
      siteName: 'Ejemplo',
      html: `<p>${'contenido legible '.repeat(200)}</p>`,
    },
  });
  expect(respuesta.status()).toBe(201);

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('por leer')).toBeVisible();
});

test('un artículo visitado se puede leer después sin conexión', async ({ page, context }) => {
  // Visitarlo con red lo deja en la caché del service worker.
  await page.getByRole('link', { name: TITULO }).first().click();
  await expect(page.locator('.cuerpo')).toContainText('contenido legible');
  const url = page.url();

  await context.setOffline(true);
  await page.goto(url);

  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
  await expect(page.locator('.cuerpo')).toContainText('contenido legible');
  await context.setOffline(false);
});

test('la lista se abre sin conexión y avisa de que no hay red', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto('/');

  await expect(page.getByRole('link', { name: TITULO }).first()).toBeVisible();
  await expect(page.getByText('Sin conexión')).toBeVisible();
  await context.setOffline(false);
});

test('archivar sin conexión se anuncia y se envía al volver la red', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto('/');

  const fila = page.locator('.fila', { hasText: TITULO });
  await fila.getByRole('button', { name: 'Archivar' }).click();
  await expect(fila.getByText('Se enviará al recuperar la conexión')).toBeVisible();

  await context.setOffline(false);
  await page.goto('/archivo');
  await expect(page.getByRole('link', { name: TITULO }).first()).toBeVisible();
});
EOF
```

- [ ] **Step 2: Esperar al service worker en la prueba**

Las pruebas de arriba dependen de que el service worker esté activo y haya
cacheado la página. Hay que esperarlo explícitamente o son inestables:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('e2e/offline.spec.ts')
s = p.read_text()
s = s.replace("  await expect(page.getByText('por leer')).toBeVisible();\n});",
"""  await expect(page.getByText('por leer')).toBeVisible();

  // Sin esto las pruebas son inestables: el service worker tarda un momento en
  // activarse y hasta entonces no cachea nada.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect(page.getByText('por leer')).toBeVisible();
});""")
p.write_text(s)
PY
```

- [ ] **Step 3: Ejecutar**

Run: `npm run test:e2e`
Expected: PASS, siete pruebas en total.

- [ ] **Step 4: Verificación manual en el móvil**

Con la app desplegada (o con el servidor local accesible desde el teléfono):

1. Abrirla en el móvil y añadirla a la pantalla de inicio.
2. Abrirla desde el icono: debe salir a pantalla completa, sin barra del
   navegador, y con el color de fondo correcto al arrancar.
3. Con red, dejarla abierta unos segundos en pendientes para que sincronice.
4. Poner el teléfono en modo avión.
5. Abrir la app desde el icono: la lista tiene que salir, con el aviso «sin
   conexión», y cualquiera de los artículos sincronizados tiene que abrirse con
   su texto y sus imágenes.
6. Archivar uno: debe decir que se enviará al recuperar la conexión.
7. Quitar el modo avión y recargar: ese artículo tiene que estar en el archivo.

- [ ] **Step 5: Documentar y commit**

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('README.md')
s = p.read_text()
seccion = """## Lectura sin conexión

La app es una PWA instalable. Al tenerla abierta con red, un sincronizador
guarda en la caché del navegador las dos listas, los 30 artículos pendientes más
recientes y sus imágenes; a partir de ahí se pueden leer sin cobertura.

Lo que se archiva o se borra sin red va a una cola en IndexedDB y se envía solo
al volver la conexión. La fila lo dice mientras tanto, en vez de fingir que ya
está hecho.

El service worker se compila desde `src/sw/` a `public/sw.js`; `npm run dev` y
`npm run build` lo hacen solos.

"""
s = s.replace('## Variables de entorno', seccion + '## Variables de entorno')
p.write_text(s)
PY
git add e2e/offline.spec.ts README.md
git commit -m "$(printf 'Cubrir la lectura sin conexión en las pruebas de navegador\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

## Cobertura del spec en este plan

| Requisito del spec | Dónde |
|---|---|
| PWA instalable | Task 1 |
| Armazón de la app cacheado, abre sin red | Task 2 (`estaticos`, cache-first) |
| Artículos pendientes recientes descargados en segundo plano | Task 3 |
| Imágenes descargadas por el proxy | Tasks 2 y 3 |
| Límite de 30 artículos y expulsión de lo que sobra | Tasks 2 (`sobrantes`) y 3 |
| Cola de acciones en IndexedDB | Task 4 |
| Envío al recuperar la conexión | Task 4 |
| Último-escribe-gana | Task 4 (clave artículo + método) |
| Indicador discreto de falta de conexión | Task 5 |
| Verificación real sin red | Task 6 |
