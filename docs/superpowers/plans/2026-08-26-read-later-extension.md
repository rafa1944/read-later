# Read Later — Plan de implementación: extensión de Chrome

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar la página activa de Chrome en Read Later con un clic o un
atajo de teclado, con el artículo ya extraído y limpio.

**Architecture:** Extensión Manifest V3 con tres piezas: un service worker que
orquesta, un script de extracción que se inyecta en la pestaña y corre
Readability sobre un clon del documento, y una página de opciones donde se
guardan la dirección del servidor y el token. El único contrato con el servidor
es `POST /api/items`, que ya existe y está probado.

**Tech Stack:** TypeScript, `@mozilla/readability`, esbuild para empaquetar,
Vitest con `happy-dom` para probar la extracción sobre páginas reales.

**Spec:** `docs/superpowers/specs/2026-08-26-read-later-design.md` (sección
«Extensión de Chrome»)

**Plan previo:** `docs/superpowers/plans/2026-08-26-read-later-nucleo.md`. La
API que consume esta extensión se construyó allí (Task 6).

## Global Constraints

- Manifest V3. Permisos mínimos: `activeTab`, `scripting`, `storage`. El
  permiso de host lo concede la persona sobre su propio dominio, no se pide
  `<all_urls>` en el manifiesto.
- El token se guarda en `chrome.storage.local`, nunca en `sync`: no debe viajar
  a la cuenta de Google.
- Textos visibles en español.
- La extracción **nunca** muta el documento de la página: Readability recibe un
  clon.
- Si la extracción no da texto, se guarda igual con título y URL. Perder un
  guardado en silencio no es una opción.
- El resultado se comunica en el propio botón (badge), sin abrir pestañas ni
  ventanas.
- TDD para todo lo que no sea API de Chrome. Lo que sí es API de Chrome se
  verifica a mano, y se dice.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `extension/manifest.json` | Declaración de la extensión |
| `extension/src/extraer.ts` | Extracción pura: recibe un `Document`, devuelve un artículo. Sin APIs de Chrome |
| `extension/src/fondo.ts` | Service worker: orquesta clic → inyección → envío → badge |
| `extension/src/inyectado.ts` | Envoltorio que se inyecta en la pestaña y llama a `extraer` |
| `extension/src/opciones.ts`, `opciones.html` | Configuración de servidor y token |
| `extension/src/almacen.ts` | Lectura y escritura de la configuración |
| `extension/build.mjs` | Empaquetado con esbuild |
| `extension/iconos/` | Iconos 16/48/128 |
| `tests/extension/extraer.test.ts` | Extracción sobre las páginas de ejemplo |

## Reparto de responsabilidades

`extraer.ts` es el corazón y no toca ninguna API de Chrome: recibe un
`Document` y una URL, y devuelve el objeto que espera la API. Eso permite
probarlo con Vitest sobre HTML real. `inyectado.ts` y `fondo.ts` son la capa
delgada que sí habla con Chrome, y por eso son casi triviales.

---

### Task 1: Extracción del artículo

**Files:**
- Create: `extension/src/extraer.ts`, `tests/extension/extraer.test.ts`,
  `tests/fixtures/articulo-completo.html`, `tests/fixtures/portada.html`
- Modify: `package.json`, `vitest.config.ts`

**Interfaces:**
- Produces, en `extension/src/extraer.ts`:

```ts
export type ArticuloExtraido = {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  lang: string | null;
  excerpt: string | null;
  html: string;
  publishedTime: string | null;
};
export function extraerArticulo(documento: Document, urlPagina: string): ArticuloExtraido;
```

- [ ] **Step 1: Instalar las dependencias**

```bash
npm i @mozilla/readability
npm i -D happy-dom esbuild @types/chrome
```

- [ ] **Step 2: Permitir tests con DOM en Vitest**

La suite existente es de entorno `node`; la extracción necesita un DOM. Se
declara por fichero con un comentario `@vitest-environment`, así que basta con
incluir el nuevo directorio:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('vitest.config.ts')
s = p.read_text()
s = s.replace(
    "include: ['tests/**/*.test.ts'],",
    "include: ['tests/**/*.test.ts'],",
)
p.write_text(s)
PY
```

No hace falta cambio: `tests/extension/` ya entra en el patrón. El fichero de
test declarará su propio entorno.

- [ ] **Step 3: Crear las páginas de ejemplo**

```bash
cat > tests/fixtures/articulo-completo.html <<'EOF'
<!doctype html>
<html lang="es">
<head>
  <title>El pan de masa madre — Cocina Lenta</title>
  <meta property="og:site_name" content="Cocina Lenta">
  <meta property="article:published_time" content="2026-02-14T09:30:00Z">
  <meta name="author" content="Marta Ruiz">
  <link rel="canonical" href="https://cocinalenta.example/pan-masa-madre">
</head>
<body>
  <nav><a href="/">Inicio</a><a href="/recetas">Recetas</a></nav>
  <article>
    <h1>El pan de masa madre</h1>
    <p>La masa madre es un cultivo de harina y agua donde conviven levaduras
    salvajes y bacterias lácticas. Alimentarla a diario la mantiene activa y
    lista para levar un pan sin levadura comercial.</p>
    <p>El proceso completo lleva entre dieciocho y veinticuatro horas, casi todo
    tiempo de espera. Lo importante no es amasar mucho, sino respetar los
    reposos y controlar la temperatura de la cocina.</p>
    <p>Con la práctica se aprende a leer la masa: cuánto ha crecido, cómo huele
    y qué resistencia ofrece al dedo cuando está lista para el horno.</p>
  </article>
  <aside>Publicidad y artículos relacionados que no deben viajar.</aside>
  <footer>Cocina Lenta, 2026</footer>
</body>
</html>
EOF
cat > tests/fixtures/portada.html <<'EOF'
<!doctype html>
<html lang="es">
<head><title>Cocina Lenta</title></head>
<body>
  <h1>Cocina Lenta</h1>
  <ul>
    <li><a href="/a">Pan</a></li>
    <li><a href="/b">Sopa</a></li>
  </ul>
</body>
</html>
EOF
```

- [ ] **Step 4: Escribir el test que falla**

```bash
mkdir -p tests/extension
cat > tests/extension/extraer.test.ts <<'EOF'
// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extraerArticulo } from '../../extension/src/extraer';

function documento(nombre: string): Document {
  const html = readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extraerArticulo', () => {
  it('saca título, autor, sitio y fecha de un artículo normal', () => {
    const a = extraerArticulo(documento('articulo-completo.html'), 'https://cocinalenta.example/pan?utm_source=x');

    expect(a.title).toBe('El pan de masa madre');
    expect(a.byline).toContain('Marta Ruiz');
    expect(a.siteName).toBe('Cocina Lenta');
    expect(a.lang).toBe('es');
    expect(a.publishedTime).toBe('2026-02-14T09:30:00Z');
  });

  it('prefiere la URL canónica a la de la barra de direcciones', () => {
    const a = extraerArticulo(documento('articulo-completo.html'), 'https://cocinalenta.example/pan?utm_source=x');
    expect(a.url).toBe('https://cocinalenta.example/pan-masa-madre');
  });

  it('conserva el cuerpo y descarta navegación, anuncios y pie', () => {
    const a = extraerArticulo(documento('articulo-completo.html'), 'https://cocinalenta.example/pan');

    expect(a.html).toContain('levaduras salvajes');
    expect(a.html).not.toContain('Publicidad');
    expect(a.html).not.toContain('Inicio');
  });

  it('no muta el documento original', () => {
    const doc = documento('articulo-completo.html');
    const antes = doc.body.innerHTML;
    extraerArticulo(doc, 'https://cocinalenta.example/pan');
    expect(doc.body.innerHTML).toBe(antes);
  });

  it('devuelve título y URL aunque no haya artículo que extraer', () => {
    const a = extraerArticulo(documento('portada.html'), 'https://cocinalenta.example/');

    expect(a.title).toBe('Cocina Lenta');
    expect(a.url).toBe('https://cocinalenta.example/');
    expect(typeof a.html).toBe('string');
  });
});
EOF
```

- [ ] **Step 5: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/extension/extraer.test.ts`
Expected: FAIL, no se resuelve `extension/src/extraer`.

- [ ] **Step 6: Implementar**

```bash
mkdir -p extension/src
cat > extension/src/extraer.ts <<'EOF'
import { Readability } from '@mozilla/readability';

export type ArticuloExtraido = {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  lang: string | null;
  excerpt: string | null;
  html: string;
  publishedTime: string | null;
};

function meta(documento: Document, ...nombres: string[]): string | null {
  for (const nombre of nombres) {
    const etiqueta =
      documento.querySelector(`meta[property="${nombre}"]`) ??
      documento.querySelector(`meta[name="${nombre}"]`);
    const valor = etiqueta?.getAttribute('content')?.trim();
    if (valor) return valor;
  }
  return null;
}

function urlCanonica(documento: Document, urlPagina: string): string {
  const enlace = documento.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const candidata = enlace ?? meta(documento, 'og:url');
  if (!candidata) return urlPagina;
  try {
    return new URL(candidata, urlPagina).toString();
  } catch {
    return urlPagina;
  }
}

export function extraerArticulo(documento: Document, urlPagina: string): ArticuloExtraido {
  // Readability muta el documento que recibe, así que se le pasa un clon.
  const clon = documento.cloneNode(true) as Document;
  const articulo = new Readability(clon).parse();

  return {
    url: urlCanonica(documento, urlPagina),
    title: articulo?.title?.trim() || documento.title.trim() || urlPagina,
    byline: articulo?.byline?.trim() || meta(documento, 'author', 'article:author'),
    siteName: articulo?.siteName?.trim() || meta(documento, 'og:site_name'),
    lang: documento.documentElement.getAttribute('lang') || meta(documento, 'og:locale'),
    excerpt: articulo?.excerpt?.trim() || meta(documento, 'description', 'og:description'),
    html: articulo?.content ?? '',
    publishedTime: meta(documento, 'article:published_time', 'og:article:published_time'),
  };
}
EOF
```

- [ ] **Step 7: Ejecutar el test**

Run: `npx vitest run tests/extension/extraer.test.ts`
Expected: PASS, cinco tests.

- [ ] **Step 8: Commit**

```bash
git add extension tests/extension tests/fixtures package.json package-lock.json
git commit -m "$(printf 'Añadir extracción de artículos con Readability para la extensión\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: Configuración de la extensión

**Files:**
- Create: `extension/src/almacen.ts`, `tests/extension/almacen.test.ts`

**Interfaces:**
- Produces:

```ts
export type Config = { servidor: string; token: string };
export function normalizarServidor(valor: string): string;   // lanza si no vale
export async function leerConfig(): Promise<Config | null>;
export async function guardarConfig(config: Config): Promise<void>;
```

- [ ] **Step 1: Escribir el test que falla**

Solo se prueba `normalizarServidor`, que es la parte con lógica; leer y escribir
en `chrome.storage.local` son dos líneas sin nada que verificar más allá de que
llaman a la API correcta.

```bash
cat > tests/extension/almacen.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { normalizarServidor } from '../../extension/src/almacen';

describe('normalizarServidor', () => {
  it('quita la barra final', () => {
    expect(normalizarServidor('https://leer.ejemplo.com/')).toBe('https://leer.ejemplo.com');
  });

  it('añade https cuando no hay esquema', () => {
    expect(normalizarServidor('leer.ejemplo.com')).toBe('https://leer.ejemplo.com');
  });

  it('respeta http en localhost, que es donde se desarrolla', () => {
    expect(normalizarServidor('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rechaza lo que no es una dirección', () => {
    expect(() => normalizarServidor('')).toThrow();
    expect(() => normalizarServidor('javascript:alert(1)')).toThrow();
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/extension/almacen.test.ts`
Expected: FAIL, no se resuelve el módulo.

- [ ] **Step 3: Implementar**

```bash
cat > extension/src/almacen.ts <<'EOF'
export type Config = { servidor: string; token: string };

const CLAVE = 'read-later';

export function normalizarServidor(valor: string): string {
  const texto = valor.trim();
  if (!texto) throw new Error('Escribe la dirección del servidor');

  const conEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;

  let url: URL;
  try {
    url = new URL(conEsquema);
  } catch {
    throw new Error('La dirección no es válida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('La dirección no es válida');
  }

  return url.origin;
}

export async function leerConfig(): Promise<Config | null> {
  const guardado = await chrome.storage.local.get(CLAVE);
  const config = guardado[CLAVE] as Config | undefined;
  return config?.servidor && config?.token ? config : null;
}

export async function guardarConfig(config: Config): Promise<void> {
  // local y no sync: el token no debe viajar a la cuenta de Google.
  await chrome.storage.local.set({ [CLAVE]: config });
}
EOF
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/extension/almacen.test.ts`
Expected: PASS, cuatro tests.

- [ ] **Step 5: Commit**

```bash
git add extension/src/almacen.ts tests/extension/almacen.test.ts
git commit -m "$(printf 'Añadir configuración de servidor y token de la extensión\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: Service worker, inyección y página de opciones

Aquí vive todo lo que habla con Chrome. Se mantiene deliberadamente delgado
porque no se puede probar automáticamente.

**Files:**
- Create: `extension/manifest.json`, `extension/src/fondo.ts`,
  `extension/src/inyectado.ts`, `extension/opciones.html`,
  `extension/src/opciones.ts`, `extension/build.mjs`, `extension/iconos/*.png`
- Modify: `package.json` (scripts `ext:build`, `ext:watch`)

**Interfaces:**
- Consumes: `extraerArticulo` de `extension/src/extraer`, `leerConfig` de
  `extension/src/almacen`.

- [ ] **Step 1: Escribir el manifiesto**

```bash
cat > extension/manifest.json <<'EOF'
{
  "manifest_version": 3,
  "name": "Read Later",
  "version": "1.0.0",
  "description": "Guarda el artículo de la pestaña actual para leerlo después.",
  "permissions": ["activeTab", "scripting", "storage"],
  "background": { "service_worker": "fondo.js", "type": "module" },
  "options_ui": { "page": "opciones.html", "open_in_tab": true },
  "action": { "default_title": "Guardar en Read Later" },
  "commands": {
    "_execute_action": {
      "suggested_key": { "default": "Alt+S", "mac": "Alt+S" },
      "description": "Guardar en Read Later"
    }
  },
  "icons": { "16": "iconos/16.png", "48": "iconos/48.png", "128": "iconos/128.png" }
}
EOF
```

No hay `host_permissions`: `activeTab` concede acceso a la pestaña solo cuando
se pulsa el botón, que es exactamente cuando hace falta, y evita que la
extensión pida permiso sobre todos los sitios.

Para el `fetch` al servidor sí hace falta permiso de host. Se declara como
opcional y se pide la primera vez desde la página de opciones:

```bash
python3 - <<'PY'
import json
from pathlib import Path
p = Path('extension/manifest.json')
m = json.loads(p.read_text())
m['optional_host_permissions'] = ['https://*/*', 'http://localhost/*']
p.write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
PY
```

- [ ] **Step 2: Escribir el script que se inyecta**

```bash
cat > extension/src/inyectado.ts <<'EOF'
import { extraerArticulo, type ArticuloExtraido } from './extraer';

/**
 * Este módulo se inyecta entero en la pestaña. Devuelve el artículo al service
 * worker como valor de retorno de chrome.scripting.executeScript.
 */
export function capturar(): ArticuloExtraido {
  return extraerArticulo(document, location.href);
}
EOF
```

- [ ] **Step 3: Escribir el service worker**

```bash
cat > extension/src/fondo.ts <<'EOF'
import { leerConfig } from './almacen';
import { capturar } from './inyectado';

const VERDE = '#2f7d4f';
const ROJO = '#a3341f';

async function señal(tabId: number, texto: string, color: string, ms = 2500) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text: texto });
  setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }), ms);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith('http')) return;

  const config = await leerConfig();
  if (!config) {
    await señal(tab.id, '⚙', ROJO, 4000);
    await chrome.runtime.openOptionsPage();
    return;
  }

  try {
    const [resultado] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: capturar,
    });

    const articulo = resultado?.result;
    if (!articulo) throw new Error('No se pudo leer la página');

    const respuesta = await fetch(`${config.servidor}/api/items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(articulo),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`${respuesta.status} ${detalle.slice(0, 120)}`);
    }

    const { created } = (await respuesta.json()) as { created: boolean };
    // El check distingue guardado nuevo de artículo que ya estaba.
    await señal(tab.id, created ? '✓' : '=', VERDE);
  } catch (error) {
    console.error('[Read Later]', error);
    await señal(tab.id, '!', ROJO, 5000);
  }
});
EOF
```

`chrome.scripting.executeScript` con `func` serializa la función y la ejecuta en
la pestaña. Como `capturar` importa `extraerArticulo`, el empaquetado tiene que
dejar todo en un mismo fichero sin referencias externas: de eso se encarga
esbuild con `bundle`.

- [ ] **Step 4: Escribir la página de opciones**

```bash
cat > extension/opciones.html <<'EOF'
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Read Later — Ajustes</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      max-width: 26rem;
      margin: 3rem auto;
      padding: 0 1.5rem;
      font: 0.95rem/1.6 ui-sans-serif, system-ui, sans-serif;
    }
    h1 { font-size: 1.15rem; margin-bottom: 1.75rem; }
    label { display: block; margin-top: 1.25rem; font-size: 0.8rem; }
    input {
      width: 100%;
      margin-top: 0.35rem;
      padding: 0.5rem;
      font: inherit;
    }
    p.ayuda { margin: 0.35rem 0 0; font-size: 0.78rem; opacity: 0.7; }
    button { margin-top: 1.75rem; padding: 0.5rem 1rem; font: inherit; }
    #aviso { margin-top: 1rem; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Read Later</h1>
  <form id="ajustes">
    <label>
      Dirección del servidor
      <input id="servidor" type="text" placeholder="https://leer.ejemplo.com" autocomplete="off">
    </label>
    <p class="ayuda">La dirección donde tienes desplegada la aplicación.</p>

    <label>
      Token
      <input id="token" type="password" autocomplete="off">
    </label>
    <p class="ayuda">El valor de INGEST_TOKEN de tu servidor.</p>

    <button type="submit">Guardar ajustes</button>
  </form>
  <p id="aviso"></p>
  <script type="module" src="opciones.js"></script>
</body>
</html>
EOF
cat > extension/src/opciones.ts <<'EOF'
import { guardarConfig, leerConfig, normalizarServidor } from './almacen';

const formulario = document.getElementById('ajustes') as HTMLFormElement;
const campoServidor = document.getElementById('servidor') as HTMLInputElement;
const campoToken = document.getElementById('token') as HTMLInputElement;
const aviso = document.getElementById('aviso') as HTMLParagraphElement;

function mostrar(texto: string, error = false) {
  aviso.textContent = texto;
  aviso.style.color = error ? '#a3341f' : '#2f7d4f';
}

void (async () => {
  const config = await leerConfig();
  if (config) {
    campoServidor.value = config.servidor;
    campoToken.value = config.token;
  }
})();

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  let servidor: string;
  try {
    servidor = normalizarServidor(campoServidor.value);
  } catch (error) {
    mostrar(error instanceof Error ? error.message : 'La dirección no es válida', true);
    return;
  }

  const token = campoToken.value.trim();
  if (!token) {
    mostrar('Escribe el token del servidor', true);
    return;
  }

  const concedido = await chrome.permissions.request({ origins: [`${servidor}/*`] });
  if (!concedido) {
    mostrar('Sin permiso para ese dominio la extensión no puede guardar nada', true);
    return;
  }

  await guardarConfig({ servidor, token });
  campoServidor.value = servidor;
  mostrar('Ajustes guardados. Ya puedes usar el botón de la barra.');
});
EOF
```

- [ ] **Step 5: Escribir el empaquetado**

```bash
cat > extension/build.mjs <<'EOF'
import { context } from 'esbuild';

const observar = process.argv.includes('--watch');

const ctx = await context({
  entryPoints: ['extension/src/fondo.ts', 'extension/src/opciones.ts'],
  outdir: 'extension/dist',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  logLevel: 'info',
});

if (observar) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
EOF
```

Chrome carga la extensión desde una carpeta con el manifiesto, el HTML y los
`.js` juntos, así que el empaquetado copia también los ficheros estáticos:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('extension/build.mjs')
s = p.read_text()
s = s.replace(
    "import { context } from 'esbuild';",
    "import { cp, mkdir } from 'node:fs/promises';\nimport { context } from 'esbuild';",
)
s = s.replace(
    "const ctx = await context({",
    "await mkdir('extension/dist', { recursive: true });\nfor (const fichero of ['manifest.json', 'opciones.html', 'iconos']) {\n  await cp(`extension/${fichero}`, `extension/dist/${fichero}`, { recursive: true });\n}\n\nconst ctx = await context({",
)
p.write_text(s)
PY
npm pkg set scripts.ext:build="node extension/build.mjs"
npm pkg set scripts.ext:watch="node extension/build.mjs --watch"
printf 'extension/dist/\n' >> .gitignore
```

- [ ] **Step 6: Crear los iconos**

Un cuadrado con la espina ámbar del lector, para que la extensión y la app se
reconozcan como la misma cosa. Se genera con Python, sin dependencias externas:

```bash
mkdir -p extension/iconos
python3 - <<'PY'
import struct, zlib
from pathlib import Path

FONDO = (20, 23, 26)
AMBAR = (224, 164, 75)

def png(lado: int) -> bytes:
    filas = []
    margen = max(1, lado // 8)
    ancho_espina = max(1, lado // 8)
    for y in range(lado):
        fila = bytearray([0])
        for x in range(lado):
            dentro = margen <= y < lado - margen and margen <= x < margen + ancho_espina
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

for lado in (16, 48, 128):
    Path(f'extension/iconos/{lado}.png').write_bytes(png(lado))
    print(f'iconos/{lado}.png')
PY
npm run ext:build
```

Expected: `extension/dist/` contiene `manifest.json`, `opciones.html`,
`fondo.js`, `opciones.js` e `iconos/`.

- [ ] **Step 7: Verificación manual en Chrome**

Esto no se puede automatizar de forma que valga la pena, y así se declara.

1. Abrir `chrome://extensions`, activar «Modo de desarrollador».
2. «Cargar descomprimida» y elegir la carpeta `extension/dist`.
3. Se abre la página de ajustes (o se abre desde la extensión): poner
   `http://localhost:3000` y el `INGEST_TOKEN` de `.env.local`. Aceptar el
   permiso de dominio que pide Chrome.
4. Con `npm run dev` en marcha, visitar un artículo real, por ejemplo
   `https://es.wikipedia.org/wiki/Tinta`, y pulsar el botón de la barra.
5. Comprobar: aparece un check verde, y el artículo sale en
   `http://localhost:3000` con su texto y sus imágenes.
6. Pulsar el botón otra vez en la misma página: aparece `=`, y en la lista sigue
   habiendo un solo artículo.
7. Probar el atajo `Alt+S` en otra página.
8. Poner un token incorrecto en los ajustes y comprobar que sale `!` en rojo.

- [ ] **Step 8: Commit**

```bash
git add extension package.json .gitignore
git commit -m "$(printf 'Añadir extensión de Chrome con botón, atajo y ajustes\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: Documentar la instalación

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Añadir la sección al README**

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('README.md')
s = p.read_text()
seccion = """
## La extensión de Chrome

```bash
npm run ext:build
```

Después, en `chrome://extensions`: activar el modo de desarrollador, «Cargar
descomprimida» y elegir `extension/dist`. En los ajustes de la extensión hay que
poner la dirección del servidor y el `INGEST_TOKEN`, y conceder el permiso de
dominio que pide Chrome.

El botón de la barra guarda la pestaña actual; el atajo por defecto es `Alt+S`.
El resultado se ve en el propio botón: `✓` guardado, `=` ya lo tenías, `!` error
(el detalle sale en la consola del service worker), `⚙` falta configurarla.

"""
s = s.replace('## Variables de entorno', seccion.lstrip('\n') + '## Variables de entorno')
p.write_text(s)
PY
git add README.md
git commit -m "$(printf 'Documentar la instalación de la extensión\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

## Cobertura del spec en este plan

| Requisito del spec | Dónde |
|---|---|
| Manifest V3 con `activeTab`, `scripting`, `storage` | Task 3 |
| Permiso de host solo para el dominio de la app | Task 3 (permiso opcional, concedido desde ajustes) |
| Botón en la barra y atajo de teclado | Task 3 |
| Clon del documento antes de Readability | Task 1 |
| Metadatos `og:`/`article:` y `link rel=canonical` | Task 1 |
| Envío con token Bearer | Task 3 |
| Badge verde / rojo con el resultado | Task 3 |
| Guardar igual cuando la extracción falla | Task 1 (`html: ''`) y núcleo (aviso en el lector) |
| Token en `chrome.storage.local`, no en `sync` | Task 2 |
| Verificación manual del botón en Chrome | Task 3, Step 7 |
