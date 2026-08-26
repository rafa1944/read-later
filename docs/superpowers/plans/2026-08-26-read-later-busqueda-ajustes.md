# Read Later — Plan de implementación: búsqueda y ajustes de lectura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encontrar cualquier artículo guardado buscando por su texto, y poder
ajustar tamaño de letra, ancho de columna y tema para leer cómodo en cada sitio.

**Architecture:** La búsqueda se apoya en la columna `tsvector` generada que ya
existe en la tabla: una función nueva en el servicio, un parámetro `q` en la
ruta de lista y una pantalla. Los ajustes de lectura son enteramente de cliente:
viven en `localStorage`, se aplican como atributos en `<html>` y el CSS
reacciona con variables. No tocan el servidor ni la base de datos.

**Tech Stack:** el del núcleo. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-26-read-later-design.md`

**Planes previos:** núcleo (`…-nucleo.md`), extensión (`…-extension.md`).

## Global Constraints

Se heredan las del plan del núcleo. Añadido:

- Los ajustes de lectura son **por dispositivo**: `localStorage`, nunca el
  servidor. Leer en el móvil con letra grande no debe cambiar el escritorio.
- El tema elegido se aplica **antes del primer pintado**. Un parpadeo de blanco
  al abrir la app de noche es un defecto, no un detalle.
- La búsqueda usa `websearch_to_tsquery` con la configuración `simple`, igual
  que la columna indexada. Si se usara otra configuración el índice no serviría.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/services/items.ts` | Se le añade `searchItems` |
| `src/app/api/items/route.ts` | Acepta `q` |
| `src/app/buscar/page.tsx` | Pantalla de búsqueda |
| `src/components/cabecera.tsx` | Enlace a la búsqueda |
| `src/components/resultado.tsx` | Fila de resultado con fragmento resaltado |
| `src/lib/ajustes.ts` | Tipos, valores por defecto y aplicación de los ajustes |
| `src/components/ajustes-lectura.tsx` | Control «Aa» del lector |
| `src/app/layout.tsx` | Script que aplica el tema antes de pintar |
| `src/app/globals.css` | Variables que reaccionan a los ajustes, tema sepia |

---

### Task 1: Búsqueda en el servicio

**Files:**
- Modify: `src/services/items.ts`
- Create: `tests/services/buscar.test.ts`

**Interfaces:**
- Produces:

```ts
export type ItemResultado = ItemSummary & { snippet: string };
export async function searchItems(consulta: string, limite?: number): Promise<ItemResultado[]>;
```

- [ ] **Step 1: Escribir el test que falla**

```bash
cat > tests/services/buscar.test.ts <<'EOF'
import { beforeEach, describe, expect, it } from 'vitest';
import { createItem, searchItems, updateItem } from '@/services/items';
import { resetDb } from '../setup/reset';

async function sembrar() {
  const pan = await createItem({
    url: 'https://ejemplo.com/pan',
    title: 'El pan de masa madre',
    html: '<p>La masa madre es un cultivo de harina y agua con levaduras salvajes.</p>',
  });
  const sopa = await createItem({
    url: 'https://ejemplo.com/sopa',
    title: 'Sopa de cebolla',
    html: '<p>Una receta clásica que empieza por pochar mucha cebolla muy despacio.</p>',
  });
  return { pan, sopa };
}

beforeEach(resetDb);

describe('searchItems', () => {
  it('encuentra por una palabra del cuerpo', async () => {
    const { pan } = await sembrar();
    const resultados = await searchItems('levaduras');

    expect(resultados.map((r) => r.id)).toEqual([pan.id]);
  });

  it('encuentra por una palabra del título', async () => {
    const { sopa } = await sembrar();
    expect((await searchItems('cebolla')).map((r) => r.id)).toContain(sopa.id);
  });

  it('exige todas las palabras de la consulta', async () => {
    await sembrar();
    expect(await searchItems('masa cebolla')).toEqual([]);
  });

  it('admite frases entre comillas', async () => {
    const { pan } = await sembrar();

    expect((await searchItems('"masa madre"')).map((r) => r.id)).toEqual([pan.id]);
    expect(await searchItems('"madre masa"')).toEqual([]);
  });

  it('devuelve un fragmento con la palabra encontrada marcada', async () => {
    await sembrar();
    const [resultado] = await searchItems('levaduras');

    expect(resultado.snippet).toContain('<mark>levaduras</mark>');
  });

  it('busca también en el archivo', async () => {
    const { pan } = await sembrar();
    await updateItem(pan.id, { archived: true });

    expect((await searchItems('levaduras')).map((r) => r.id)).toEqual([pan.id]);
  });

  it('devuelve vacío ante una consulta vacía o de solo signos', async () => {
    await sembrar();

    expect(await searchItems('')).toEqual([]);
    expect(await searchItems('   ')).toEqual([]);
    expect(await searchItems('&&&')).toEqual([]);
  });
});
EOF
```

Que la búsqueda cubra también el archivo es deliberado: buscar es justo lo que
se hace cuando se quiere recuperar algo ya leído.

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/services/buscar.test.ts`
Expected: FAIL, `searchItems` no está exportada.

- [ ] **Step 3: Implementar**

```bash
cat >> src/services/items.ts <<'EOF'

export type ItemResultado = ItemSummary & { snippet: string };

/**
 * Usa websearch_to_tsquery, que entiende comillas para frases y guiones para
 * excluir, y la configuración 'simple': la misma de la columna generada, o el
 * índice no se usaría.
 */
export async function searchItems(consulta: string, limite = 50): Promise<ItemResultado[]> {
  const texto = consulta.trim();
  if (!texto) return [];

  const filas = await db.execute(sql`
    with q as (select websearch_to_tsquery('simple', ${texto}) as consulta)
    select
      ${items.id} as id,
      ${items.url} as url,
      ${items.title} as title,
      ${items.siteName} as "siteName",
      ${items.excerpt} as excerpt,
      ${items.wordCount} as "wordCount",
      ${items.savedAt} as "savedAt",
      ${items.archivedAt} as "archivedAt",
      ${items.scrollPct} as "scrollPct",
      ts_headline(
        'simple',
        ${items.contentText},
        q.consulta,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=12, MaxFragments=1'
      ) as snippet
    from ${items}, q
    where q.consulta is not null
      and ${items.search} @@ q.consulta
    order by ts_rank(${items.search}, q.consulta) desc, ${items.savedAt} desc
    limit ${Math.min(limite, 200)}
  `);

  return (filas as unknown as ItemResultado[]).map((fila) => ({
    ...fila,
    savedAt: new Date(fila.savedAt),
    archivedAt: fila.archivedAt ? new Date(fila.archivedAt) : null,
  }));
}
EOF
python3 - <<'PY'
from pathlib import Path
p = Path('src/services/items.ts')
s = p.read_text()
s = s.replace(
    "import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';",
    "import { and, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';",
)
p.write_text(s)
PY
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/services/buscar.test.ts`
Expected: PASS, siete tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/items.ts tests/services/buscar.test.ts
git commit -m "$(printf 'Añadir búsqueda de texto completo sobre los artículos\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: La búsqueda en la API y en la interfaz

**Files:**
- Modify: `src/app/api/items/route.ts`, `src/components/cabecera.tsx`
- Create: `src/app/buscar/page.tsx`, `src/components/resultado.tsx`,
  `tests/api/buscar.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `searchItems`, `ItemResultado`.
- Produces: `GET /api/items?q=…` devuelve `{ items: ItemResultado[] }`.

- [ ] **Step 1: Escribir el test que falla**

```bash
cat > tests/api/buscar.test.ts <<'EOF'
import { beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/items/route';
import { createItem } from '@/services/items';
import { resetDb } from '../setup/reset';

beforeEach(resetDb);

describe('GET /api/items?q=', () => {
  it('devuelve los artículos que coinciden, con fragmento', async () => {
    await createItem({
      url: 'https://ejemplo.com/pan',
      title: 'El pan de masa madre',
      html: '<p>Un cultivo de harina y agua con levaduras salvajes que leva el pan.</p>',
    });

    const respuesta = await GET(new Request('http://localhost/api/items?q=levaduras'));
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo.items.length).toBe(1);
    expect(cuerpo.items[0].snippet).toContain('<mark>');
  });

  it('una consulta sin resultados devuelve una lista vacía, no un error', async () => {
    const respuesta = await GET(new Request('http://localhost/api/items?q=zzzzz'));

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).items).toEqual([]);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/api/buscar.test.ts`
Expected: FAIL, devuelve la lista de pendientes en vez de resultados.

- [ ] **Step 3: Aceptar `q` en la ruta**

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/app/api/items/route.ts')
s = p.read_text()
s = s.replace(
    "import { createItem, listItems } from '@/services/items';",
    "import { createItem, listItems, searchItems } from '@/services/items';",
)
s = s.replace(
    """  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state') ?? 'pendientes';""",
    """  const { searchParams } = new URL(request.url);

  const consulta = searchParams.get('q')?.trim();
  if (consulta) {
    return Response.json({ items: await searchItems(consulta) });
  }

  const state = searchParams.get('state') ?? 'pendientes';""",
)
p.write_text(s)
PY
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/api/buscar.test.ts`
Expected: PASS, dos tests.

- [ ] **Step 5: Escribir la pantalla de búsqueda**

El formulario envía por GET, así que la búsqueda queda en la URL: se puede
recargar, compartir y volver atrás. No hace falta JavaScript para buscar.

```bash
cat > src/components/resultado.tsx <<'EOF'
import Link from 'next/link';
import { fechaCorta, minutosDeLectura } from '@/lib/formato';
import type { ItemResultado } from '@/services/items';

export function Resultado({ item }: { item: ItemResultado }) {
  const minutos = minutosDeLectura(item.wordCount);

  return (
    <article className="fila">
      <div className="espina" style={{ ['--avance' as string]: item.scrollPct }}>
        <i />
      </div>

      <div className={minutos === null ? 'coste rotulo sin-texto' : 'coste rotulo'}>
        <b>{minutos ?? '—'}</b>
        {minutos !== null && <span>min</span>}
      </div>

      <div>
        <h2 className="titulo">
          <Link href={`/a/${item.id}`}>{item.title}</Link>
        </h2>
        <p className="pista rotulo">
          {[item.siteName, fechaCorta(item.savedAt), item.archivedAt ? 'archivado' : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {/* Seguro: ts_headline solo inserta <mark> sobre texto ya sin etiquetas. */}
        <p className="fragmento" dangerouslySetInnerHTML={{ __html: item.snippet }} />
      </div>
    </article>
  );
}
EOF
cat > src/app/buscar/page.tsx <<'EOF'
import { Cabecera } from '@/components/cabecera';
import { Resultado } from '@/components/resultado';
import { searchItems } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const consulta = q?.trim() ?? '';
  const resultados = consulta ? await searchItems(consulta) : [];

  return (
    <main className="columna">
      <Cabecera />

      <form className="buscador" action="/buscar" method="get" role="search">
        <label htmlFor="q" className="rotulo">
          Buscar en todo lo guardado
        </label>
        <input id="q" name="q" type="search" defaultValue={consulta} autoFocus placeholder="palabra o «frase entre comillas»" />
      </form>

      {consulta && resultados.length === 0 && (
        <p className="vacio">
          Nada coincide con «{consulta}». Prueba con otra palabra: la búsqueda no reconoce plurales
          ni conjugaciones.
        </p>
      )}

      {resultados.length > 0 && (
        <p className="titular">
          {resultados.length === 1 ? '1 resultado' : `${resultados.length} resultados`}
        </p>
      )}

      {resultados.map((item) => (
        <Resultado key={item.id} item={item} />
      ))}
    </main>
  );
}
EOF
python3 - <<'PY'
from pathlib import Path
p = Path('src/components/cabecera.tsx')
s = p.read_text()
s = s.replace(
    "  { href: '/archivo', texto: 'Archivo' },",
    "  { href: '/archivo', texto: 'Archivo' },\n  { href: '/buscar', texto: 'Buscar' },",
)
p.write_text(s)
PY
cat >> src/app/globals.css <<'EOF'

/* ---------- Búsqueda ---------- */

.buscador { margin: 2rem 0 0; }

.buscador label { display: block; }

.buscador input {
  width: 100%;
  margin-top: 0.6rem;
  padding: 0.4rem 0;
  border: 0;
  border-bottom: 1px solid var(--linea);
  background: none;
  color: inherit;
  font: 1.15rem/1.4 var(--serif);
}

.buscador input:focus {
  outline: 0;
  border-bottom-color: var(--lampara);
}

.fragmento {
  margin: 0.5rem 0 0;
  color: var(--tenue);
  font-size: 0.92rem;
  line-height: 1.5;
}

.fragmento mark {
  background: none;
  color: var(--tinta);
  box-shadow: inset 0 -0.35em 0 color-mix(in srgb, var(--lampara) 35%, transparent);
}
EOF
```

- [ ] **Step 6: Verificar en el navegador**

Con `npm run dev` y artículos guardados: buscar una palabra que esté en el
cuerpo de uno de ellos, comprobar que sale con el fragmento resaltado, que el
enlace lleva al lector, y que recargar la página mantiene la búsqueda.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/items/route.ts src/app/buscar src/components src/app/globals.css tests/api/buscar.test.ts
git commit -m "$(printf 'Añadir pantalla y API de búsqueda con fragmentos resaltados\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: Ajustes de lectura

**Files:**
- Create: `src/lib/ajustes.ts`, `src/components/ajustes-lectura.tsx`,
  `tests/lib/ajustes.test.ts`
- Modify: `src/app/layout.tsx`, `src/app/a/[id]/page.tsx`,
  `src/app/globals.css`

**Interfaces:**
- Produces, en `@/lib/ajustes`:

```ts
export type Tema = 'auto' | 'claro' | 'oscuro' | 'sepia';
export type Ajustes = { escala: number; ancho: 'estrecho' | 'medio' | 'ancho'; tema: Tema };
export const AJUSTES_POR_DEFECTO: Ajustes;
export const CLAVE_AJUSTES = 'read-later:lectura';
export function normalizarAjustes(valor: unknown): Ajustes;
export function aplicarAjustes(ajustes: Ajustes, raiz?: HTMLElement): void;
export const GUION_INICIAL: string;  // se inserta en <head> para evitar el parpadeo
```

- [ ] **Step 1: Escribir el test que falla**

```bash
cat > tests/lib/ajustes.test.ts <<'EOF'
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { AJUSTES_POR_DEFECTO, aplicarAjustes, normalizarAjustes } from '@/lib/ajustes';

describe('normalizarAjustes', () => {
  it('acepta unos ajustes válidos', () => {
    const ajustes = { escala: 1.2, ancho: 'ancho' as const, tema: 'sepia' as const };
    expect(normalizarAjustes(ajustes)).toEqual(ajustes);
  });

  it('cae en los valores por defecto ante basura', () => {
    expect(normalizarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO);
    expect(normalizarAjustes('{}')).toEqual(AJUSTES_POR_DEFECTO);
    expect(normalizarAjustes({ tema: 'fucsia' })).toEqual(AJUSTES_POR_DEFECTO);
  });

  it('acota la escala a un rango legible', () => {
    expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, escala: 9 }).escala).toBe(1.6);
    expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, escala: 0.1 }).escala).toBe(0.85);
  });
});

describe('aplicarAjustes', () => {
  it('escribe los atributos y la variable de escala en la raíz', () => {
    const raiz = document.documentElement;
    aplicarAjustes({ escala: 1.15, ancho: 'ancho', tema: 'oscuro' }, raiz);

    expect(raiz.dataset.tema).toBe('oscuro');
    expect(raiz.dataset.ancho).toBe('ancho');
    expect(raiz.style.getPropertyValue('--escala')).toBe('1.15');
  });

  it('con tema automático no fija ningún tema, para dejar mandar al sistema', () => {
    const raiz = document.documentElement;
    aplicarAjustes({ escala: 1, ancho: 'medio', tema: 'auto' }, raiz);

    expect(raiz.dataset.tema).toBeUndefined();
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/lib/ajustes.test.ts`
Expected: FAIL, no se resuelve `@/lib/ajustes`.

- [ ] **Step 3: Implementar**

```bash
cat > src/lib/ajustes.ts <<'EOF'
export type Tema = 'auto' | 'claro' | 'oscuro' | 'sepia';
export type Ancho = 'estrecho' | 'medio' | 'ancho';
export type Ajustes = { escala: number; ancho: Ancho; tema: Tema };

export const CLAVE_AJUSTES = 'read-later:lectura';

export const AJUSTES_POR_DEFECTO: Ajustes = { escala: 1, ancho: 'medio', tema: 'auto' };

export const ESCALA_MINIMA = 0.85;
export const ESCALA_MAXIMA = 1.6;
export const PASO_ESCALA = 0.075;

const TEMAS: Tema[] = ['auto', 'claro', 'oscuro', 'sepia'];
const ANCHOS: Ancho[] = ['estrecho', 'medio', 'ancho'];

export function normalizarAjustes(valor: unknown): Ajustes {
  if (!valor || typeof valor !== 'object') return AJUSTES_POR_DEFECTO;
  const bruto = valor as Partial<Ajustes>;

  if (!TEMAS.includes(bruto.tema as Tema)) return AJUSTES_POR_DEFECTO;
  if (!ANCHOS.includes(bruto.ancho as Ancho)) return AJUSTES_POR_DEFECTO;
  if (typeof bruto.escala !== 'number' || Number.isNaN(bruto.escala)) return AJUSTES_POR_DEFECTO;

  return {
    tema: bruto.tema as Tema,
    ancho: bruto.ancho as Ancho,
    escala: Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, bruto.escala)),
  };
}

export function aplicarAjustes(ajustes: Ajustes, raiz = document.documentElement): void {
  if (ajustes.tema === 'auto') {
    delete raiz.dataset.tema;
  } else {
    raiz.dataset.tema = ajustes.tema;
  }
  raiz.dataset.ancho = ajustes.ancho;
  raiz.style.setProperty('--escala', String(ajustes.escala));
}

/**
 * Se ejecuta en el <head>, antes del primer pintado: sin esto, abrir la app de
 * noche con tema oscuro elegido daría un fogonazo blanco.
 */
export const GUION_INICIAL = `
try {
  var a = JSON.parse(localStorage.getItem(${JSON.stringify(CLAVE_AJUSTES)}) || '{}');
  var r = document.documentElement;
  if (a.tema && a.tema !== 'auto') r.dataset.tema = a.tema;
  if (a.ancho) r.dataset.ancho = a.ancho;
  if (a.escala) r.style.setProperty('--escala', String(a.escala));
} catch (e) {}
`.trim();
EOF
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/lib/ajustes.test.ts`
Expected: PASS, cinco tests.

- [ ] **Step 5: Enganchar el guión inicial en el layout**

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/app/layout.tsx')
s = p.read_text()
s = s.replace(
    "import type { Metadata } from 'next';",
    "import type { Metadata } from 'next';\nimport { GUION_INICIAL } from '@/lib/ajustes';",
)
s = s.replace(
    "    <html lang=\"es\">\n      <body>{children}</body>",
    "    <html lang=\"es\">\n      <head>\n        <script dangerouslySetInnerHTML={{ __html: GUION_INICIAL }} />\n      </head>\n      <body>{children}</body>",
)
p.write_text(s)
PY
```

- [ ] **Step 6: Hacer que el CSS reaccione a los ajustes**

```bash
cat >> src/app/globals.css <<'EOF'

/* ---------- Ajustes de lectura ---------- */

/*
 * Tema elegido a mano. Prevalece sobre prefers-color-scheme porque un atributo
 * en la raíz gana a la consulta de medios que define :root más arriba.
 */
:root[data-tema='claro'] {
  color-scheme: light;
  --fondo: #e9eae5;
  --tinta: #16181a;
  --tenue: #62666a;
  --linea: #d2d4ce;
  --lampara: #b4761a;
  --peligro: #a3341f;
}

:root[data-tema='oscuro'] {
  color-scheme: dark;
  --fondo: #14171a;
  --tinta: #e4e2dc;
  --tenue: #8a8f94;
  --linea: #262a2e;
  --lampara: #e0a44b;
  --peligro: #e07a62;
}

:root[data-tema='sepia'] {
  color-scheme: light;
  --fondo: #efe6d5;
  --tinta: #2b241a;
  --tenue: #6e6353;
  --linea: #ddd0b8;
  --lampara: #a2661d;
  --peligro: #97331d;
}

:root[data-ancho='estrecho'] { --medida: 28rem; }
:root[data-ancho='ancho'] { --medida: 42rem; }

.cuerpo { font-size: calc(1.14rem * var(--escala, 1)); }
.lector h1 { font-size: calc(1.85rem * var(--escala, 1)); }

/* ---------- Control de ajustes ---------- */

.ajustes {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 3;
}

.ajustes > button {
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid var(--linea);
  border-radius: 50%;
  background: var(--fondo);
  color: var(--tenue);
  cursor: pointer;
  font: 500 0.95rem/1 var(--serif);
}

.ajustes > button:hover { color: var(--tinta); }

.panel {
  position: absolute;
  right: 0;
  bottom: 3.25rem;
  width: 15rem;
  padding: 1.1rem 1.15rem 1.25rem;
  border: 1px solid var(--linea);
  background: var(--fondo);
  box-shadow: 0 6px 28px rgb(0 0 0 / 12%);
}

.panel fieldset {
  margin: 0 0 1.1rem;
  padding: 0;
  border: 0;
}

.panel fieldset:last-of-type { margin-bottom: 0; }

.panel legend {
  padding: 0 0 0.5rem;
  font: 600 0.62rem/1 var(--sans);
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--tenue);
}

.opciones { display: flex; gap: 0.4rem; }

.opciones button {
  flex: 1;
  padding: 0.4rem 0;
  border: 1px solid var(--linea);
  background: none;
  color: var(--tenue);
  cursor: pointer;
  font: 0.72rem/1 var(--sans);
}

.opciones button[aria-pressed='true'] {
  border-color: var(--lampara);
  color: var(--tinta);
}

@media (max-width: 30rem) {
  .panel { width: min(15rem, calc(100vw - 2rem)); }
}
EOF
```

Ojo con el orden: el bloque `@media (prefers-color-scheme: dark)` está antes en
el fichero, así que `:root[data-tema='claro']` gana por especificidad aunque el
sistema esté en oscuro. Es exactamente lo que se quiere.

- [ ] **Step 7: Escribir el control**

```bash
cat > src/components/ajustes-lectura.tsx <<'EOF'
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AJUSTES_POR_DEFECTO,
  CLAVE_AJUSTES,
  ESCALA_MAXIMA,
  ESCALA_MINIMA,
  PASO_ESCALA,
  aplicarAjustes,
  normalizarAjustes,
  type Ajustes,
  type Ancho,
  type Tema,
} from '@/lib/ajustes';

const TEMAS: { valor: Tema; texto: string }[] = [
  { valor: 'auto', texto: 'Auto' },
  { valor: 'claro', texto: 'Claro' },
  { valor: 'oscuro', texto: 'Oscuro' },
  { valor: 'sepia', texto: 'Sepia' },
];

const ANCHOS: { valor: Ancho; texto: string }[] = [
  { valor: 'estrecho', texto: 'Estrecho' },
  { valor: 'medio', texto: 'Medio' },
  { valor: 'ancho', texto: 'Ancho' },
];

export function AjustesLectura() {
  const [abierto, setAbierto] = useState(false);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_POR_DEFECTO);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setAjustes(normalizarAjustes(JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? 'null')));
    } catch {
      setAjustes(AJUSTES_POR_DEFECTO);
    }
  }, []);

  useEffect(() => {
    if (!abierto) return;

    function fuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function escape(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  function cambiar(parcial: Partial<Ajustes>) {
    const nuevos = normalizarAjustes({ ...ajustes, ...parcial });
    setAjustes(nuevos);
    aplicarAjustes(nuevos);
    try {
      localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevos));
    } catch {
      // Navegación privada con almacenamiento bloqueado: se pierde al salir.
    }
  }

  return (
    <div className="ajustes" ref={contenedor}>
      {abierto && (
        <div className="panel" role="dialog" aria-label="Ajustes de lectura">
          <fieldset>
            <legend>Tamaño de letra</legend>
            <div className="opciones">
              <button
                type="button"
                onClick={() => cambiar({ escala: ajustes.escala - PASO_ESCALA })}
                disabled={ajustes.escala <= ESCALA_MINIMA}
                aria-label="Reducir el tamaño de letra"
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => cambiar({ escala: ajustes.escala + PASO_ESCALA })}
                disabled={ajustes.escala >= ESCALA_MAXIMA}
                aria-label="Aumentar el tamaño de letra"
              >
                A+
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend>Ancho de columna</legend>
            <div className="opciones">
              {ANCHOS.map(({ valor, texto }) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={ajustes.ancho === valor}
                  onClick={() => cambiar({ ancho: valor })}
                >
                  {texto}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Tema</legend>
            <div className="opciones">
              {TEMAS.map(({ valor, texto }) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={ajustes.tema === valor}
                  onClick={() => cambiar({ tema: valor })}
                >
                  {texto}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label="Ajustes de lectura"
        title="Ajustes de lectura"
      >
        Aa
      </button>
    </div>
  );
}
EOF
python3 - <<'PY'
from pathlib import Path
p = Path('src/app/a/[id]/page.tsx')
s = p.read_text()
s = s.replace(
    "import { ItemActions } from '@/components/item-actions';",
    "import { AjustesLectura } from '@/components/ajustes-lectura';\nimport { ItemActions } from '@/components/item-actions';",
)
s = s.replace("      <Rail id={item.id} inicial={item.scrollPct} />",
              "      <Rail id={item.id} inicial={item.scrollPct} />\n      <AjustesLectura />")
p.write_text(s)
PY
```

- [ ] **Step 8: Verificar en el navegador**

Abrir un artículo y comprobar, en este orden:

1. El botón «Aa» abre el panel; se cierra con Escape y al pulsar fuera.
2. `A+` agranda el texto del artículo y el título, no el resto de la interfaz.
3. Los tres anchos cambian la medida de la columna.
4. Los cuatro temas cambian los colores, y «Auto» devuelve el mando al sistema.
5. Recargar mantiene los ajustes **sin ningún parpadeo de color** al cargar.
6. Los ajustes valen también en las listas (el tema y el ancho), porque están en
   la raíz del documento.

- [ ] **Step 9: Ejecutar toda la suite y compilar**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo verde.

- [ ] **Step 10: Commit**

```bash
git add src/lib/ajustes.ts src/components/ajustes-lectura.tsx src/app/layout.tsx 'src/app/a' src/app/globals.css tests/lib/ajustes.test.ts
git commit -m "$(printf 'Añadir ajustes de lectura de tamaño, ancho y tema\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: Cubrir búsqueda y ajustes en la prueba de navegador

**Files:**
- Create: `e2e/busqueda-ajustes.spec.ts`

- [ ] **Step 1: Escribir la prueba**

```bash
cat > e2e/busqueda-ajustes.spec.ts <<'EOF'
import { expect, test } from '@playwright/test';

const PALABRA = 'higrómetro';

test.beforeEach(async ({ request, page }) => {
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/busqueda-${Date.now()}-${Math.random()}`,
      title: 'Medir la humedad del horno',
      siteName: 'Cocina Lenta',
      html: `<p>Para controlar la fermentación conviene un ${PALABRA} barato. ${'texto de relleno '.repeat(60)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('por leer')).toBeVisible();
});

test('buscar por una palabra del cuerpo y abrir el resultado', async ({ page }) => {
  await page.getByRole('link', { name: 'Buscar' }).click();
  await page.getByLabel('Buscar en todo lo guardado').fill(PALABRA);
  await page.keyboard.press('Enter');

  await expect(page.locator('mark')).toContainText(PALABRA);
  await page.getByRole('link', { name: 'Medir la humedad del horno' }).click();
  await expect(page.getByRole('heading', { name: 'Medir la humedad del horno' })).toBeVisible();
});

test('los ajustes de lectura se aplican y sobreviven a una recarga', async ({ page }) => {
  await page.getByRole('link', { name: 'Medir la humedad del horno' }).click();

  await page.getByRole('button', { name: 'Ajustes de lectura' }).click();
  await page.getByRole('button', { name: 'Oscuro' }).click();
  await page.getByRole('button', { name: 'Ancho', exact: true }).click();

  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
  await expect(page.locator('html')).toHaveAttribute('data-ancho', 'ancho');
});
EOF
```

- [ ] **Step 2: Ejecutar**

Run: `npm run test:e2e`
Expected: PASS, cuatro pruebas en total.

- [ ] **Step 3: Commit**

```bash
git add e2e/busqueda-ajustes.spec.ts
git commit -m "$(printf 'Cubrir búsqueda y ajustes de lectura en las pruebas de navegador\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

## Cobertura del spec en este plan

| Requisito del spec | Dónde |
|---|---|
| Búsqueda de texto sobre título y contenido | Task 1 |
| Configuración `simple`, la misma del índice | Task 1 |
| Parámetro `q` en `GET /api/items` | Task 2 |
| Pantalla de búsqueda | Task 2 |
| Tamaño de letra, ancho de columna y tema | Task 3 |
| Ajustes por dispositivo, en `localStorage` | Task 3 |
| Sin parpadeo al cargar con tema elegido | Task 3 (`GUION_INICIAL`) |
