# Read Later — Plan de implementación: núcleo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tener la aplicación de lectura funcionando y desplegada en Vercel con
Neon Postgres, protegida por contraseña, de modo que se puedan guardar artículos
por API y leerlos, archivarlos y borrarlos desde el móvil.

**Architecture:** Un único proyecto Next.js (App Router) que expone la API y
sirve la web app; Postgres como fuente de verdad mediante Drizzle. El HTML de
los artículos se sanea al escribir, nunca al leer, y las imágenes se reescriben
a un proxy firmado del propio dominio. La autenticación tiene dos caminos
separados: cookie de sesión firmada para la web app y token Bearer para el
ingreso de artículos.

**Tech Stack:** TypeScript, Next.js (App Router), React, Postgres 17,
Drizzle ORM + drizzle-kit, `postgres` (postgres.js), `sanitize-html`, `jose`,
Vitest, Playwright, Docker Compose para el Postgres local.

**Spec:** `docs/superpowers/specs/2026-08-26-read-later-design.md`

**Alcance de este plan:** fases 1 y 2 del spec. Quedan explícitamente fuera, con
plan propio: la extensión de Chrome (fase 3), la búsqueda y los ajustes de
lectura (fase 4), la PWA y el offline (fase 5). La columna `tsvector` y su
índice GIN **sí** se crean aquí, para no necesitar una migración después; lo que
se deja fuera es el parámetro `q` de la lista.

## Global Constraints

- Node.js 24 LTS. Nada de código específico de runtime Edge.
- Un solo usuario. No existe tabla de usuarios ni concepto de sesión múltiple.
- Todos los textos visibles de la interfaz van en español.
- Variables de entorno obligatorias, sin valores por defecto en el código:
  `DATABASE_URL`, `APP_PASSWORD`, `AUTH_SECRET`, `INGEST_TOKEN`. Si falta
  alguna, el código lanza un error con el nombre de la variable.
- `AUTH_SECRET` se usa para dos cosas con etiquetas separadas: `session:` para
  la cookie y `img:` para la firma de imágenes. Nunca sin etiqueta.
- Búsqueda de texto con la configuración `simple` de Postgres, nunca `spanish`
  ni `english`.
- El HTML de artículo se sanea **antes de guardarse**. Ninguna ruta de lectura
  vuelve a sanear: se confía en que lo almacenado ya es seguro.
- El texto plano y el número de palabras los deriva siempre el servidor del HTML
  saneado. El cliente no los envía.
- Sin librerías de UI ni de CSS: CSS propio con propiedades personalizadas.
- TDD: cada tarea empieza por un test que falla.
- Un commit por tarea como mínimo, en español, con `Co-Authored-By`.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `docker-compose.yml` | Postgres local para desarrollo y pruebas |
| `docker/init.sql` | Crea la base de datos de pruebas |
| `drizzle.config.ts` | Configuración de drizzle-kit |
| `vitest.config.ts` | Alias `@/`, entorno node, setup de entorno y migraciones |
| `tests/setup/global.ts` | Aplica migraciones antes de la suite |
| `tests/setup/reset.ts` | Vacía tablas entre tests |
| `src/db/schema.ts` | Tablas `items` y `login_attempts` |
| `src/db/client.ts` | Conexión Drizzle única |
| `src/lib/env.ts` | Lectura obligatoria de variables de entorno |
| `src/lib/url.ts` | Canonicalización de URLs |
| `src/lib/img-sign.ts` | Firma y verificación de URLs de imagen |
| `src/lib/net-guard.ts` | Detección de direcciones IP privadas (anti-SSRF) |
| `src/lib/sanitize.ts` | Saneado de HTML, reescritura de imágenes, texto plano |
| `src/lib/session.ts` | Cookie de sesión firmada |
| `src/lib/auth.ts` | Contraseña, token de ingreso, límite de intentos |
| `src/services/items.ts` | Operaciones de negocio sobre artículos |
| `src/app/api/items/route.ts` | POST (token) y GET (cookie) |
| `src/app/api/items/[id]/route.ts` | GET, PATCH, DELETE (cookie) |
| `src/app/api/auth/login/route.ts` | Entrada con contraseña |
| `src/app/api/auth/logout/route.ts` | Salida |
| `src/app/api/img/route.ts` | Proxy de imágenes |
| `src/middleware.ts` | Protege rutas de la web app |
| `src/app/layout.tsx`, `src/app/globals.css` | Armazón y estilos |
| `src/app/page.tsx`, `src/app/archivo/page.tsx` | Listas |
| `src/app/a/[id]/page.tsx` | Lector |
| `src/app/login/page.tsx` | Formulario de entrada |
| `src/components/item-card.tsx` | Tarjeta de artículo |
| `src/components/item-actions.tsx` | Archivar / desarchivar / borrar (cliente) |
| `src/components/scroll-tracker.tsx` | Guarda y restaura la posición (cliente) |
| `e2e/` | Pruebas de navegador con Playwright |

---

### Task 1: Andamiaje del proyecto y base de datos

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`,
  `.env.local`, `.env.test`, `docker-compose.yml`, `docker/init.sql`,
  `drizzle.config.ts`, `vitest.config.ts`, `src/lib/env.ts`,
  `src/db/schema.ts`, `src/db/client.ts`, `tests/setup/global.ts`,
  `tests/setup/reset.ts`, `tests/db/schema.test.ts`,
  `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
  - `db` — instancia de Drizzle exportada por `@/db/client`.
  - `items`, `loginAttempts` — tablas exportadas por `@/db/schema`.
  - `requiredEnv(name: string): string` en `@/lib/env`.
  - `resetDb(): Promise<void>` en `tests/setup/reset`.

- [ ] **Step 1: Crear `package.json` e instalar dependencias**

```bash
cat > package.json <<'EOF'
{
  "name": "read-later",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:up": "docker compose up -d db"
  }
}
EOF
npm i next@latest react@latest react-dom@latest drizzle-orm postgres sanitize-html jose
npm i -D typescript @types/node @types/react @types/react-dom @types/sanitize-html drizzle-kit vitest dotenv
```

- [ ] **Step 2: Crear la configuración de TypeScript y Next**

```bash
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "allowJs": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF
cat > next.config.ts <<'EOF'
import type { NextConfig } from 'next';

const config: NextConfig = {};

export default config;
EOF
```

- [ ] **Step 3: Levantar Postgres en Docker**

```bash
mkdir -p docker
cat > docker/init.sql <<'EOF'
CREATE DATABASE readlater_test;
EOF
cat > docker-compose.yml <<'EOF'
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: readlater
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
volumes:
  pgdata:
EOF
npm run db:up
```

El puerto es 5433 a propósito, para no chocar con un Postgres que ya esté
escuchando en el 5432 de la máquina.

Verificar que responde:

```bash
until docker compose exec -T db pg_isready -U postgres; do sleep 1; done
```

- [ ] **Step 4: Crear los ficheros de entorno**

`AUTH_SECRET` e `INGEST_TOKEN` se generan aleatorios; no se inventan a mano.

```bash
cat > .env.example <<'EOF'
DATABASE_URL=postgres://postgres:postgres@localhost:5433/readlater
APP_PASSWORD=cambia-esto
AUTH_SECRET=genera-32-bytes-con-openssl-rand-base64-32
INGEST_TOKEN=genera-32-bytes-con-openssl-rand-base64-32
EOF
cat > .env.local <<EOF
DATABASE_URL=postgres://postgres:postgres@localhost:5433/readlater
APP_PASSWORD=desarrollo
AUTH_SECRET=$(openssl rand -base64 32)
INGEST_TOKEN=$(openssl rand -base64 32)
EOF
cat > .env.test <<EOF
DATABASE_URL=postgres://postgres:postgres@localhost:5433/readlater_test
APP_PASSWORD=contrasena-de-prueba
AUTH_SECRET=$(openssl rand -base64 32)
INGEST_TOKEN=token-de-prueba
EOF
printf '\n.env.local\n.env.test\n' >> .gitignore
```

- [ ] **Step 5: Escribir el lector de variables de entorno**

```bash
mkdir -p src/lib
cat > src/lib/env.ts <<'EOF'
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`La variable de entorno ${name} no está definida`);
  }
  return value;
}
EOF
```

- [ ] **Step 6: Escribir el esquema de la base de datos**

```bash
mkdir -p src/db
cat > src/db/schema.ts <<'EOF'
import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    byline: text('byline'),
    siteName: text('site_name'),
    lang: text('lang'),
    excerpt: text('excerpt'),
    contentHtml: text('content_html').notNull(),
    contentText: text('content_text').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    scrollPct: real('scroll_pct').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    search: tsvector('search').generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content_text, ''))`,
    ),
  },
  (table) => [
    uniqueIndex('items_url_key').on(table.url),
    index('items_archived_saved_idx').on(table.archivedAt, table.savedAt.desc()),
    index('items_search_idx').using('gin', table.search),
  ],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('login_attempts_ip_idx').on(table.ip, table.attemptedAt)],
);
EOF
```

`to_tsvector` con la configuración indicada explícitamente es `IMMUTABLE`, que
es lo que Postgres exige en una columna generada. Sin el primer argumento no
compilaría.

- [ ] **Step 7: Escribir el cliente de base de datos**

El cliente se memoiza en `globalThis` porque en desarrollo Next recarga los
módulos y, sin esto, cada recarga abriría un pool nuevo.

```bash
cat > src/db/client.ts <<'EOF'
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { requiredEnv } from '@/lib/env';
import * as schema from './schema';

type Cache = { client?: ReturnType<typeof postgres> };
const cache = globalThis as unknown as { __rlDb?: Cache };
cache.__rlDb ??= {};

cache.__rlDb.client ??= postgres(requiredEnv('DATABASE_URL'), { prepare: false });

export const sqlClient = cache.__rlDb.client;
export const db = drizzle(sqlClient, { schema });
EOF
```

- [ ] **Step 8: Configurar drizzle-kit y generar la primera migración**

```bash
cat > drizzle.config.ts <<'EOF'
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
EOF
npm run db:generate
```

Revisar el SQL generado en `src/db/migrations/`: debe contener la columna
`search` como `generated always as (...) stored` y el índice `items_search_idx`
con `using gin`. Si falta alguno de los dos, añadirlo a mano a ese fichero de
migración antes de aplicarlo.

```bash
npm run db:migrate
```

- [ ] **Step 9: Configurar Vitest con migraciones automáticas**

```bash
mkdir -p tests/setup tests/db
cat > tests/setup/global.ts <<'EOF'
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export default async function setup() {
  config({ path: '.env.test', override: true });
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: './src/db/migrations' });
  await client.end();
}
EOF
cat > tests/setup/reset.ts <<'EOF'
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export async function resetDb(): Promise<void> {
  await db.execute(sql`truncate table items, login_attempts`);
}
EOF
cat > vitest.config.ts <<'EOF'
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup/global.ts'],
    env: { NODE_ENV: 'test' },
    setupFiles: ['dotenv/config'],
    fileParallelism: false,
  },
});
EOF
```

`fileParallelism: false` porque todos los ficheros comparten una única base de
datos y se vacían entre tests; en paralelo se pisarían.

Para que `dotenv/config` lea `.env.test`, añadir la variable que dotenv usa para
elegir el fichero:

```bash
cat >> vitest.config.ts <<'EOF'
// DOTENV_CONFIG_PATH lo consume el setupFile 'dotenv/config'
process.env.DOTENV_CONFIG_PATH ??= '.env.test';
EOF
```

- [ ] **Step 10: Escribir el test que falla**

```bash
cat > tests/db/schema.test.ts <<'EOF'
import { beforeEach, expect, it } from 'vitest';
import { db } from '@/db/client';
import { items } from '@/db/schema';
import { resetDb } from '../setup/reset';

beforeEach(resetDb);

it('guarda un artículo y lo recupera con valores por defecto', async () => {
  const [row] = await db
    .insert(items)
    .values({
      url: 'https://ejemplo.com/a',
      title: 'Un título',
      contentHtml: '<p>Hola</p>',
      contentText: 'Hola',
    })
    .returning();

  expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(row.archivedAt).toBeNull();
  expect(row.scrollPct).toBe(0);
  expect(row.wordCount).toBe(0);
});

it('rechaza dos artículos con la misma URL', async () => {
  const values = {
    url: 'https://ejemplo.com/dup',
    title: 'T',
    contentHtml: '<p>x</p>',
    contentText: 'x',
  };
  await db.insert(items).values(values);
  await expect(db.insert(items).values(values)).rejects.toThrow();
});
EOF
```

- [ ] **Step 11: Ejecutar el test**

Run: `npm test`
Expected: PASS, dos tests. Si falla con `DATABASE_URL no está definida`,
revisar que `DOTENV_CONFIG_PATH` apunta a `.env.test`.

- [ ] **Step 12: Crear el armazón mínimo de Next para que compile**

```bash
mkdir -p src/app
cat > src/app/globals.css <<'EOF'
:root {
  color-scheme: light dark;
  --fondo: #fbfaf8;
  --texto: #1c1b19;
  --tenue: #6b6862;
  --borde: #e2ded7;
  --acento: #8a4b2a;
  --medida: 38rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --fondo: #16150f;
    --texto: #ece9e2;
    --tenue: #9b968c;
    --borde: #302e28;
    --acento: #d99a6c;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--fondo);
  color: var(--texto);
  font: 1rem/1.6 ui-serif, Georgia, "Times New Roman", serif;
  -webkit-text-size-adjust: 100%;
}

a { color: var(--acento); }
EOF
cat > src/app/layout.tsx <<'EOF'
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Read Later',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
EOF
cat > src/app/page.tsx <<'EOF'
export default function Home() {
  return <p>Read Later</p>;
}
EOF
npm run build
```

Expected: la compilación termina sin errores.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "$(printf 'Añadir andamiaje del proyecto, esquema y pruebas contra Postgres\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: Canonicalización de URLs

Sirve para que guardar la misma página dos veces, con distinta basura de
seguimiento en la URL, no cree dos artículos.

**Files:**
- Create: `src/lib/url.ts`, `tests/lib/url.test.ts`

**Interfaces:**
- Produces: `canonicalizeUrl(raw: string): string` en `@/lib/url`. Lanza
  `Error` si la URL no es `http`/`https` o no se puede parsear.

- [ ] **Step 1: Escribir el test que falla**

```bash
mkdir -p tests/lib
cat > tests/lib/url.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from '@/lib/url';

describe('canonicalizeUrl', () => {
  it('quita los parámetros de seguimiento', () => {
    expect(
      canonicalizeUrl('https://ejemplo.com/a?utm_source=x&utm_medium=y&id=7'),
    ).toBe('https://ejemplo.com/a?id=7');
  });

  it('quita el fragmento', () => {
    expect(canonicalizeUrl('https://ejemplo.com/a#seccion')).toBe('https://ejemplo.com/a');
  });

  it('quita la barra final salvo en la raíz', () => {
    expect(canonicalizeUrl('https://ejemplo.com/a/')).toBe('https://ejemplo.com/a');
    expect(canonicalizeUrl('https://ejemplo.com/')).toBe('https://ejemplo.com/');
  });

  it('pasa el host a minúsculas y quita el puerto por defecto', () => {
    expect(canonicalizeUrl('https://EJEMPLO.com:443/a')).toBe('https://ejemplo.com/a');
  });

  it('ordena los parámetros que conserva', () => {
    expect(canonicalizeUrl('https://ejemplo.com/a?b=2&a=1')).toBe('https://ejemplo.com/a?a=1&b=2');
  });

  it('rechaza esquemas que no son http o https', () => {
    expect(() => canonicalizeUrl('javascript:alert(1)')).toThrow();
    expect(() => canonicalizeUrl('no es una url')).toThrow();
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/lib/url.test.ts`
Expected: FAIL, no se puede resolver `@/lib/url`.

- [ ] **Step 3: Implementar**

```bash
cat > src/lib/url.ts <<'EOF'
const PARAMETROS_DE_SEGUIMIENTO = [
  /^utm_/,
  /^ga_/,
  /^_hs/,
  /^mc_/,
  /^vero_/,
  /^icid$/,
  /^fbclid$/,
  /^gclid$/,
  /^gbraid$/,
  /^wbraid$/,
  /^msclkid$/,
  /^igshid$/,
  /^mkt_tok$/,
  /^ref$/,
  /^ref_src$/,
  /^s_cid$/,
  /^cmpid$/,
];

export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`URL no válida: ${raw}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Esquema no admitido: ${url.protocol}`);
  }

  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  const conservados = [...url.searchParams.entries()]
    .filter(([clave]) => !PARAMETROS_DE_SEGUIMIENTO.some((patron) => patron.test(clave)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  url.search = '';
  for (const [clave, valor] of conservados) {
    url.searchParams.append(clave, valor);
  }

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}
EOF
```

`new URL` ya elimina el puerto por defecto y normaliza el host, así que no hace
falta tratarlos a mano.

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/lib/url.test.ts`
Expected: PASS, seis tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/url.ts tests/lib/url.test.ts
git commit -m "$(printf 'Añadir canonicalización de URLs para deduplicar artículos\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: Firma de URLs de imagen

El proxy de imágenes solo debe servir URLs que haya firmado el propio servidor.
Sin esto, cualquiera podría usar la app como proxy abierto.

**Files:**
- Create: `src/lib/img-sign.ts`, `tests/lib/img-sign.test.ts`

**Interfaces:**
- Consumes: `requiredEnv` de `@/lib/env`.
- Produces, en `@/lib/img-sign`:
  - `signImage(url: string): string`
  - `imageProxyPath(url: string): string` — devuelve `/api/img?url=…&sig=…`
  - `verifyImageSig(url: string, sig: string | null): boolean`

- [ ] **Step 1: Escribir el test que falla**

```bash
cat > tests/lib/img-sign.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { imageProxyPath, signImage, verifyImageSig } from '@/lib/img-sign';

describe('firma de imágenes', () => {
  it('acepta su propia firma', () => {
    const url = 'https://cdn.ejemplo.com/foto.jpg';
    expect(verifyImageSig(url, signImage(url))).toBe(true);
  });

  it('rechaza una firma de otra URL', () => {
    expect(verifyImageSig('https://cdn.ejemplo.com/a.jpg', signImage('https://cdn.ejemplo.com/b.jpg'))).toBe(false);
  });

  it('rechaza una firma ausente o vacía', () => {
    expect(verifyImageSig('https://cdn.ejemplo.com/a.jpg', null)).toBe(false);
    expect(verifyImageSig('https://cdn.ejemplo.com/a.jpg', '')).toBe(false);
  });

  it('construye una ruta de proxy con la URL codificada', () => {
    const ruta = imageProxyPath('https://cdn.ejemplo.com/f.jpg?w=2');
    expect(ruta.startsWith('/api/img?url=https%3A%2F%2Fcdn.ejemplo.com%2Ff.jpg%3Fw%3D2&sig=')).toBe(true);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/lib/img-sign.test.ts`
Expected: FAIL, no se puede resolver `@/lib/img-sign`.

- [ ] **Step 3: Implementar**

```bash
cat > src/lib/img-sign.ts <<'EOF'
import { createHmac, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './env';

export function signImage(url: string): string {
  return createHmac('sha256', requiredEnv('AUTH_SECRET'))
    .update(`img:${url}`)
    .digest('base64url')
    .slice(0, 32);
}

export function imageProxyPath(url: string): string {
  return `/api/img?url=${encodeURIComponent(url)}&sig=${signImage(url)}`;
}

export function verifyImageSig(url: string, sig: string | null): boolean {
  if (!sig) return false;
  const esperada = Buffer.from(signImage(url));
  const recibida = Buffer.from(sig);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
EOF
```

La comparación de longitudes va antes de `timingSafeEqual` porque esa función
lanza si los búferes miden distinto. La longitud de la firma no es secreta.

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/lib/img-sign.test.ts`
Expected: PASS, cuatro tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/img-sign.ts tests/lib/img-sign.test.ts
git commit -m "$(printf 'Añadir firma HMAC de URLs de imagen\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: Saneado del HTML del artículo

Es la tarea más importante del plan en términos de seguridad: convierte HTML
ajeno en algo que se puede inyectar en la página sin riesgo, y de paso deja las
imágenes apuntando al proxy propio.

**Files:**
- Create: `src/lib/sanitize.ts`, `tests/lib/sanitize.test.ts`,
  `tests/fixtures/blog-sencillo.html`, `tests/fixtures/periodico.html`

**Interfaces:**
- Consumes: `imageProxyPath` de `@/lib/img-sign`.
- Produces, en `@/lib/sanitize`:
  - `type SanitizedArticle = { html: string; text: string; wordCount: number }`
  - `sanitizeArticle(dirtyHtml: string, baseUrl: string): SanitizedArticle`

- [ ] **Step 1: Crear las páginas de ejemplo**

Son ficheros de prueba, no páginas reales descargadas: contienen a propósito
todo lo que debe sobrevivir y todo lo que debe desaparecer.

```bash
mkdir -p tests/fixtures
cat > tests/fixtures/blog-sencillo.html <<'EOF'
<article>
  <h1>Cómo hacer pan</h1>
  <p>Primero la <strong>harina</strong>, después el agua.</p>
  <figure>
    <img src="/imagenes/masa.jpg" alt="Masa reposando">
    <figcaption>La masa tras dos horas</figcaption>
  </figure>
  <p>Más en <a href="/receta-completa">la receta completa</a>.</p>
  <script>window.rastreame = true;</script>
</article>
EOF
cat > tests/fixtures/periodico.html <<'EOF'
<div class="cuerpo">
  <p onclick="alert('no')">Texto del reportaje con &amp; entidades.</p>
  <img src="https://cdn.diario.com/foto.jpg" srcset="https://cdn.diario.com/foto-2x.jpg 2x" alt="Foto">
  <iframe src="https://publicidad.example/anuncio"></iframe>
  <form action="/suscribirse"><input name="email"></form>
  <p style="color:red">Con estilo en línea.</p>
  <blockquote>Una cita.</blockquote>
  <a href="javascript:alert(1)">Enlace malicioso</a>
</div>
EOF
```

- [ ] **Step 2: Escribir el test que falla**

```bash
cat > tests/lib/sanitize.test.ts <<'EOF'
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanitizeArticle } from '@/lib/sanitize';

const leer = (nombre: string) =>
  readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url), 'utf8');

describe('sanitizeArticle', () => {
  const blog = sanitizeArticle(leer('blog-sencillo.html'), 'https://blog.ejemplo.com/pan');
  const periodico = sanitizeArticle(leer('periodico.html'), 'https://diario.com/noticia');

  it('conserva el texto y la estructura del artículo', () => {
    expect(blog.html).toContain('<h1>Cómo hacer pan</h1>');
    expect(blog.html).toContain('<strong>harina</strong>');
    expect(blog.html).toContain('<figcaption>');
    expect(periodico.html).toContain('<blockquote>');
  });

  it('elimina scripts, iframes, formularios y estilos', () => {
    expect(blog.html).not.toContain('<script');
    expect(blog.html).not.toContain('rastreame');
    expect(periodico.html).not.toContain('<iframe');
    expect(periodico.html).not.toContain('<form');
    expect(periodico.html).not.toContain('<input');
    expect(periodico.html).not.toContain('style=');
  });

  it('elimina los atributos de evento', () => {
    expect(periodico.html).not.toContain('onclick');
  });

  it('elimina los enlaces con esquema javascript', () => {
    expect(periodico.html).not.toContain('javascript:');
  });

  it('reescribe las imágenes al proxy y resuelve las rutas relativas', () => {
    expect(blog.html).toContain('/api/img?url=https%3A%2F%2Fblog.ejemplo.com%2Fimagenes%2Fmasa.jpg&sig=');
    expect(blog.html).toContain('alt="Masa reposando"');
    expect(blog.html).not.toContain('src="/imagenes/masa.jpg"');
  });

  it('descarta srcset para que no se salte el proxy', () => {
    expect(periodico.html).not.toContain('srcset');
  });

  it('convierte los enlaces relativos en absolutos y los abre con seguridad', () => {
    expect(blog.html).toContain('href="https://blog.ejemplo.com/receta-completa"');
    expect(blog.html).toContain('rel="noopener noreferrer"');
    expect(blog.html).toContain('target="_blank"');
  });

  it('extrae texto plano con las entidades resueltas y cuenta palabras', () => {
    expect(periodico.text).toContain('Texto del reportaje con & entidades.');
    expect(periodico.text).not.toContain('&amp;');
    expect(periodico.text).not.toContain('<');
    expect(blog.wordCount).toBeGreaterThan(10);
  });

  it('separa los bloques con espacio en el texto plano', () => {
    expect(blog.text).toContain('Cómo hacer pan');
    expect(blog.text).not.toContain('panPrimero');
  });
});
EOF
```

- [ ] **Step 3: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/lib/sanitize.test.ts`
Expected: FAIL, no se puede resolver `@/lib/sanitize`.

- [ ] **Step 4: Implementar**

```bash
cat > src/lib/sanitize.ts <<'EOF'
import sanitizeHtml from 'sanitize-html';
import { imageProxyPath } from './img-sign';

export type SanitizedArticle = {
  html: string;
  text: string;
  wordCount: number;
};

const ETIQUETAS_PERMITIDAS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'q', 'cite', 'pre', 'code',
  'em', 'strong', 'i', 'b', 'u', 's', 'sup', 'sub', 'abbr', 'time', 'small',
  'br', 'hr', 'span', 'div', 'section',
  'a', 'img', 'figure', 'figcaption', 'picture',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
];

const BLOQUES = new Set([
  'p', 'div', 'section', 'figure', 'figcaption', 'li', 'tr', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'td', 'th', 'caption',
]);

function absolutizar(href: string, baseUrl: string): string | null {
  try {
    const resuelta = new URL(href, baseUrl);
    if (resuelta.protocol !== 'http:' && resuelta.protocol !== 'https:') return null;
    return resuelta.toString();
  } catch {
    return null;
  }
}

export function sanitizeArticle(dirtyHtml: string, baseUrl: string): SanitizedArticle {
  const html = sanitizeHtml(dirtyHtml, {
    allowedTags: ETIQUETAS_PERMITIDAS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      time: ['datetime'],
      abbr: ['title'],
      '*': ['lang', 'dir'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_etiqueta, atributos) => {
        const href = atributos.href ? absolutizar(atributos.href, baseUrl) : null;
        if (!href) return { tagName: 'span', attribs: {} };
        return {
          tagName: 'a',
          attribs: { href, target: '_blank', rel: 'noopener noreferrer' },
        };
      },
      img: (_etiqueta, atributos) => {
        const origen = atributos.src ? absolutizar(atributos.src, baseUrl) : null;
        if (!origen) return { tagName: 'span', attribs: {} };
        return {
          tagName: 'img',
          attribs: {
            src: imageProxyPath(origen),
            alt: atributos.alt ?? '',
            loading: 'lazy',
          },
        };
      },
    },
  });

  const text = aTextoPlano(html);
  return { html, text, wordCount: contarPalabras(text) };
}

function aTextoPlano(html: string): string {
  const conSeparadores = html.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (etiqueta, nombre: string) =>
    BLOQUES.has(nombre.toLowerCase()) ? '\n' : ' ',
  );
  return decodificarEntidades(conSeparadores)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (completa, cuerpo: string) => {
    if (cuerpo.startsWith('#x') || cuerpo.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(cuerpo.slice(2), 16));
    }
    if (cuerpo.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(cuerpo.slice(1), 10));
    }
    return ENTIDADES[cuerpo.toLowerCase()] ?? completa;
  });
}

function contarPalabras(texto: string): number {
  const palabras = texto.match(/\p{L}[\p{L}\p{M}'’-]*/gu);
  return palabras ? palabras.length : 0;
}
EOF
```

Dos detalles que hay que respetar o los tests fallan de forma confusa:
`target` y `rel` tienen que estar en `allowedAttributes.a`, y `loading` en
`allowedAttributes.img`, porque `sanitize-html` filtra los atributos **después**
de aplicar `transformTags`. Y `srcset` desaparece por no estar en la lista, que
es justo lo que queremos: si sobreviviera, el navegador cargaría la imagen
original saltándose el proxy.

- [ ] **Step 5: Ejecutar el test**

Run: `npx vitest run tests/lib/sanitize.test.ts`
Expected: PASS, nueve tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sanitize.ts tests/lib/sanitize.test.ts tests/fixtures
git commit -m "$(printf 'Añadir saneado de HTML con reescritura de imágenes al proxy\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 5: Servicio de artículos

Toda la lógica de negocio en un módulo que no sabe nada de HTTP. Las rutas de
la API se limitarán a traducir peticiones a llamadas de aquí.

**Files:**
- Create: `src/services/items.ts`, `tests/services/items.test.ts`

**Interfaces:**
- Consumes: `db` de `@/db/client`, `items` de `@/db/schema`,
  `canonicalizeUrl` de `@/lib/url`, `sanitizeArticle` de `@/lib/sanitize`.
- Produces, en `@/services/items`:

```ts
export type NewItemInput = {
  url: string;
  title: string;
  byline?: string | null;
  siteName?: string | null;
  lang?: string | null;
  excerpt?: string | null;
  html: string;
  publishedTime?: string | null;
};
export type CreateResult = { id: string; created: boolean };
export type ItemSummary = {
  id: string; url: string; title: string; siteName: string | null;
  excerpt: string | null; wordCount: number; savedAt: Date;
  archivedAt: Date | null; scrollPct: number;
};
export type ItemDetail = ItemSummary & {
  byline: string | null; lang: string | null;
  contentHtml: string; publishedAt: Date | null;
};
export type ListOptions = { state: 'pendientes' | 'archivo'; limit?: number; before?: Date };
export type ItemPatch = { archived?: boolean; scrollPct?: number };

export async function createItem(input: NewItemInput): Promise<CreateResult>;
export async function listItems(options: ListOptions): Promise<ItemSummary[]>;
export async function getItem(id: string): Promise<ItemDetail | null>;
export async function updateItem(id: string, patch: ItemPatch): Promise<ItemDetail | null>;
export async function deleteItem(id: string): Promise<boolean>;
```

- [ ] **Step 1: Escribir el test que falla**

```bash
mkdir -p tests/services
cat > tests/services/items.test.ts <<'EOF'
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
} from '@/services/items';
import { resetDb } from '../setup/reset';

const base = {
  url: 'https://ejemplo.com/articulo',
  title: 'Un artículo',
  html: '<p>Cuerpo del artículo con unas cuantas palabras dentro.</p>',
};

beforeEach(resetDb);

describe('createItem', () => {
  it('crea el artículo saneando el HTML y derivando texto y palabras', async () => {
    const { id, created } = await createItem({
      ...base,
      html: '<p>Hola <script>malo()</script>mundo</p>',
    });

    expect(created).toBe(true);
    const guardado = await getItem(id);
    expect(guardado?.contentHtml).not.toContain('script');
    expect(guardado?.wordCount).toBeGreaterThan(0);
  });

  it('canonicaliza la URL antes de guardarla', async () => {
    const { id } = await createItem({ ...base, url: 'https://ejemplo.com/articulo?utm_source=x' });
    expect((await getItem(id))?.url).toBe('https://ejemplo.com/articulo');
  });

  it('no duplica una URL ya guardada', async () => {
    const primero = await createItem(base);
    const segundo = await createItem({ ...base, title: 'Otro título' });

    expect(segundo.created).toBe(false);
    expect(segundo.id).toBe(primero.id);
    expect((await listItems({ state: 'pendientes' })).length).toBe(1);
  });

  it('devuelve a pendientes un artículo archivado que se vuelve a guardar', async () => {
    const { id } = await createItem(base);
    await updateItem(id, { archived: true });

    await createItem(base);

    expect((await getItem(id))?.archivedAt).toBeNull();
  });

  it('rechaza una URL no válida', async () => {
    await expect(createItem({ ...base, url: 'no-es-una-url' })).rejects.toThrow();
  });
});

describe('listItems', () => {
  it('separa pendientes de archivo y ordena por fecha de guardado descendente', async () => {
    const viejo = await createItem({ ...base, url: 'https://ejemplo.com/1' });
    const nuevo = await createItem({ ...base, url: 'https://ejemplo.com/2' });
    await updateItem(viejo.id, { archived: true });

    const pendientes = await listItems({ state: 'pendientes' });
    const archivo = await listItems({ state: 'archivo' });

    expect(pendientes.map((i) => i.id)).toEqual([nuevo.id]);
    expect(archivo.map((i) => i.id)).toEqual([viejo.id]);
  });

  it('respeta el límite', async () => {
    await createItem({ ...base, url: 'https://ejemplo.com/1' });
    await createItem({ ...base, url: 'https://ejemplo.com/2' });
    expect((await listItems({ state: 'pendientes', limit: 1 })).length).toBe(1);
  });
});

describe('updateItem', () => {
  it('archiva y desarchiva', async () => {
    const { id } = await createItem(base);

    expect((await updateItem(id, { archived: true }))?.archivedAt).toBeInstanceOf(Date);
    expect((await updateItem(id, { archived: false }))?.archivedAt).toBeNull();
  });

  it('es idempotente: repetir el mismo cambio no altera el resultado', async () => {
    const { id } = await createItem(base);
    const primera = await updateItem(id, { archived: true });
    const segunda = await updateItem(id, { archived: true });

    expect(segunda?.archivedAt?.getTime()).toBe(primera?.archivedAt?.getTime());
  });

  it('guarda la posición de lectura acotada entre 0 y 1', async () => {
    const { id } = await createItem(base);

    expect((await updateItem(id, { scrollPct: 0.42 }))?.scrollPct).toBeCloseTo(0.42, 5);
    expect((await updateItem(id, { scrollPct: 5 }))?.scrollPct).toBe(1);
    expect((await updateItem(id, { scrollPct: -1 }))?.scrollPct).toBe(0);
  });

  it('devuelve null si el artículo no existe', async () => {
    expect(await updateItem('00000000-0000-0000-0000-000000000000', { archived: true })).toBeNull();
  });
});

describe('deleteItem', () => {
  it('borra de verdad', async () => {
    const { id } = await createItem(base);

    expect(await deleteItem(id)).toBe(true);
    expect(await getItem(id)).toBeNull();
    expect(await deleteItem(id)).toBe(false);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/services/items.test.ts`
Expected: FAIL, no se puede resolver `@/services/items`.

- [ ] **Step 3: Implementar**

```bash
mkdir -p src/services
cat > src/services/items.ts <<'EOF'
import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { items } from '@/db/schema';
import { sanitizeArticle } from '@/lib/sanitize';
import { canonicalizeUrl } from '@/lib/url';

export type NewItemInput = {
  url: string;
  title: string;
  byline?: string | null;
  siteName?: string | null;
  lang?: string | null;
  excerpt?: string | null;
  html: string;
  publishedTime?: string | null;
};

export type CreateResult = { id: string; created: boolean };

export type ItemSummary = {
  id: string;
  url: string;
  title: string;
  siteName: string | null;
  excerpt: string | null;
  wordCount: number;
  savedAt: Date;
  archivedAt: Date | null;
  scrollPct: number;
};

export type ItemDetail = ItemSummary & {
  byline: string | null;
  lang: string | null;
  contentHtml: string;
  publishedAt: Date | null;
};

export type ListOptions = {
  state: 'pendientes' | 'archivo';
  limit?: number;
  before?: Date;
};

export type ItemPatch = { archived?: boolean; scrollPct?: number };

const COLUMNAS_RESUMEN = {
  id: items.id,
  url: items.url,
  title: items.title,
  siteName: items.siteName,
  excerpt: items.excerpt,
  wordCount: items.wordCount,
  savedAt: items.savedAt,
  archivedAt: items.archivedAt,
  scrollPct: items.scrollPct,
};

const COLUMNAS_DETALLE = {
  ...COLUMNAS_RESUMEN,
  byline: items.byline,
  lang: items.lang,
  contentHtml: items.contentHtml,
  publishedAt: items.publishedAt,
};

export async function createItem(input: NewItemInput): Promise<CreateResult> {
  const url = canonicalizeUrl(input.url);

  const [existente] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.url, url))
    .limit(1);

  if (existente) {
    await db
      .update(items)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(items.id, existente.id));
    return { id: existente.id, created: false };
  }

  const saneado = sanitizeArticle(input.html, url);
  const publishedAt = input.publishedTime ? new Date(input.publishedTime) : null;

  const [creado] = await db
    .insert(items)
    .values({
      url,
      title: input.title.trim() || url,
      byline: input.byline ?? null,
      siteName: input.siteName ?? null,
      lang: input.lang ?? null,
      excerpt: input.excerpt ?? null,
      contentHtml: saneado.html,
      contentText: saneado.text,
      wordCount: saneado.wordCount,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    })
    .returning({ id: items.id });

  return { id: creado.id, created: true };
}

export async function listItems(options: ListOptions): Promise<ItemSummary[]> {
  const estado = options.state === 'archivo' ? isNotNull(items.archivedAt) : isNull(items.archivedAt);
  const condiciones = options.before
    ? and(estado, lt(items.savedAt, options.before))
    : estado;

  return db
    .select(COLUMNAS_RESUMEN)
    .from(items)
    .where(condiciones)
    .orderBy(desc(items.savedAt))
    .limit(Math.min(options.limit ?? 50, 200));
}

export async function getItem(id: string): Promise<ItemDetail | null> {
  const [fila] = await db.select(COLUMNAS_DETALLE).from(items).where(eq(items.id, id)).limit(1);
  return fila ?? null;
}

export async function updateItem(id: string, patch: ItemPatch): Promise<ItemDetail | null> {
  const cambios: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.archived !== undefined) {
    const [actual] = await db
      .select({ archivedAt: items.archivedAt })
      .from(items)
      .where(eq(items.id, id))
      .limit(1);
    if (!actual) return null;

    if (patch.archived) {
      // Idempotente: si ya estaba archivado se conserva la fecha original.
      cambios.archivedAt = actual.archivedAt ?? new Date();
    } else {
      cambios.archivedAt = null;
    }
  }

  if (patch.scrollPct !== undefined) {
    cambios.scrollPct = Math.min(1, Math.max(0, patch.scrollPct));
  }

  const [actualizado] = await db
    .update(items)
    .set(cambios)
    .where(eq(items.id, id))
    .returning(COLUMNAS_DETALLE);

  return actualizado ?? null;
}

export async function deleteItem(id: string): Promise<boolean> {
  const borrados = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
  return borrados.length > 0;
}
EOF
```

Nota sobre la deduplicación: se consulta y luego se escribe, sin transacción.
Con un solo usuario pulsando un botón, la carrera no existe en la práctica; el
índice único de `url` es la red de seguridad si alguna vez ocurre.

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/services/items.test.ts`
Expected: PASS, doce tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/items.ts tests/services/items.test.ts
git commit -m "$(printf 'Añadir servicio de artículos con deduplicación y archivado\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 6: Ingreso de artículos por API con token

La puerta que usará la extensión. Se prueba y se estrena antes de que exista la
extensión: con `curl` ya se puede llenar la biblioteca.

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/items/route.ts`,
  `tests/api/items-post.test.ts`

**Interfaces:**
- Consumes: `createItem` de `@/services/items`, `requiredEnv` de `@/lib/env`.
- Produces:
  - `verifyIngestToken(header: string | null): boolean` en `@/lib/auth`
  - `POST` en `src/app/api/items/route.ts`

- [ ] **Step 1: Escribir el test que falla**

```bash
mkdir -p tests/api
cat > tests/api/items-post.test.ts <<'EOF'
import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/items/route';
import { listItems } from '@/services/items';
import { resetDb } from '../setup/reset';

const TOKEN = 'token-de-prueba';

function peticion(cuerpo: unknown, token: string | null = TOKEN): Request {
  return new Request('http://localhost/api/items', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(cuerpo),
  });
}

const articulo = {
  url: 'https://ejemplo.com/a',
  title: 'Título',
  html: '<p>Cuerpo con varias palabras.</p>',
};

beforeEach(resetDb);

describe('POST /api/items', () => {
  it('crea el artículo y responde 201 con su id', async () => {
    const respuesta = await POST(peticion(articulo));
    expect(respuesta.status).toBe(201);

    const cuerpo = await respuesta.json();
    expect(cuerpo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cuerpo.created).toBe(true);
  });

  it('responde 200 y el id existente si la URL ya estaba guardada', async () => {
    await POST(peticion(articulo));
    const respuesta = await POST(peticion(articulo));

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).created).toBe(false);
    expect((await listItems({ state: 'pendientes' })).length).toBe(1);
  });

  it('rechaza sin token', async () => {
    expect((await POST(peticion(articulo, null))).status).toBe(401);
  });

  it('rechaza con un token incorrecto', async () => {
    expect((await POST(peticion(articulo, 'otro-token'))).status).toBe(401);
  });

  it('rechaza un cuerpo sin url o sin title', async () => {
    expect((await POST(peticion({ title: 'x', html: '<p>y</p>' }))).status).toBe(400);
    expect((await POST(peticion({ url: 'https://ejemplo.com/b', html: '<p>y</p>' }))).status).toBe(400);
  });

  it('rechaza una url que no es http', async () => {
    expect((await POST(peticion({ ...articulo, url: 'javascript:alert(1)' }))).status).toBe(400);
  });

  it('rechaza un cuerpo mayor de 5 MB', async () => {
    const grande = new Request('http://localhost/api/items', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        'content-length': String(6 * 1024 * 1024),
      },
      body: JSON.stringify(articulo),
    });
    expect((await POST(grande)).status).toBe(413);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/api/items-post.test.ts`
Expected: FAIL, no se puede resolver `@/app/api/items/route`.

- [ ] **Step 3: Implementar la verificación del token**

```bash
cat > src/lib/auth.ts <<'EOF'
import { createHash, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './env';

function iguales(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function verifyIngestToken(header: string | null): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  return iguales(header.slice('Bearer '.length), requiredEnv('INGEST_TOKEN'));
}
EOF
```

Se comparan los resúmenes SHA-256 y no las cadenas: así los búferes siempre
miden lo mismo y `timingSafeEqual` no filtra la longitud del secreto ni lanza.

- [ ] **Step 4: Implementar la ruta**

```bash
mkdir -p src/app/api/items
cat > src/app/api/items/route.ts <<'EOF'
import { verifyIngestToken } from '@/lib/auth';
import { createItem } from '@/services/items';

const LIMITE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!verifyIngestToken(request.headers.get('authorization'))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const declarado = Number(request.headers.get('content-length') ?? '0');
  if (declarado > LIMITE_BYTES) {
    return Response.json({ error: 'El artículo es demasiado grande' }, { status: 413 });
  }

  const crudo = await request.text();
  if (crudo.length > LIMITE_BYTES) {
    return Response.json({ error: 'El artículo es demasiado grande' }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'JSON no válido' }, { status: 400 });
  }

  const url = typeof cuerpo.url === 'string' ? cuerpo.url : null;
  const title = typeof cuerpo.title === 'string' ? cuerpo.title : null;
  if (!url || !title) {
    return Response.json({ error: 'Faltan url o title' }, { status: 400 });
  }

  const texto = (clave: string): string | null =>
    typeof cuerpo[clave] === 'string' ? (cuerpo[clave] as string) : null;

  try {
    const resultado = await createItem({
      url,
      title,
      byline: texto('byline'),
      siteName: texto('siteName'),
      lang: texto('lang'),
      excerpt: texto('excerpt'),
      html: texto('html') ?? '',
      publishedTime: texto('publishedTime'),
    });

    return Response.json(resultado, { status: resultado.created ? 201 : 200 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al guardar';
    return Response.json({ error: mensaje }, { status: 400 });
  }
}
EOF
```

- [ ] **Step 5: Ejecutar el test**

Run: `npx vitest run tests/api/items-post.test.ts`
Expected: PASS, siete tests.

- [ ] **Step 6: Comprobarlo a mano contra el servidor de desarrollo**

```bash
npm run dev
```

En otra terminal, con el token de `.env.local`:

```bash
curl -si -X POST http://localhost:3000/api/items \
  -H "authorization: Bearer $(grep '^INGEST_TOKEN=' .env.local | cut -d= -f2-)" \
  -H 'content-type: application/json' \
  -d '{"url":"https://ejemplo.com/prueba","title":"Prueba manual","html":"<p>Un párrafo de prueba con suficientes palabras.</p>"}'
```

Expected: `HTTP/1.1 201` y un `id` en el cuerpo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/app/api/items/route.ts tests/api/items-post.test.ts
git commit -m "$(printf 'Añadir ingreso de artículos por API con token Bearer\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 7: Sesión, contraseña y protección de rutas

**Files:**
- Create: `src/lib/session.ts`, `src/app/api/auth/login/route.ts`,
  `src/app/api/auth/logout/route.ts`, `src/app/login/page.tsx`,
  `src/middleware.ts`, `tests/lib/session.test.ts`, `tests/api/auth.test.ts`
- Modify: `src/lib/auth.ts`

**Interfaces:**
- Consumes: `requiredEnv` de `@/lib/env`, `db` y `loginAttempts`.
- Produces:
  - En `@/lib/session`: `NOMBRE_COOKIE`, `createSessionToken(): Promise<string>`,
    `verifySessionToken(token: string | undefined | null): Promise<boolean>`,
    `opcionesCookie(): { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number }`
  - En `@/lib/auth`, añadido: `verifyPassword(given: string): boolean`,
    `tooManyAttempts(ip: string): Promise<boolean>`,
    `recordAttempt(ip: string): Promise<void>`,
    `clearAttempts(ip: string): Promise<void>`

- [ ] **Step 1: Escribir los tests que fallan**

```bash
cat > tests/lib/session.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/session';

describe('sesión', () => {
  it('acepta un token propio', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it('rechaza un token ausente, vacío o manipulado', async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken('')).toBe(false);
    expect(await verifySessionToken(`${await createSessionToken()}x`)).toBe(false);
  });
});
EOF
cat > tests/api/auth.test.ts <<'EOF'
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { verifySessionToken } from '@/lib/session';
import { resetDb } from '../setup/reset';

function peticion(password: string, ip = '203.0.113.7'): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ password }),
  });
}

function tokenDeCookie(respuesta: Response): string | undefined {
  return respuesta.headers.get('set-cookie')?.match(/rl_session=([^;]+)/)?.[1];
}

beforeEach(resetDb);

describe('POST /api/auth/login', () => {
  it('con la contraseña correcta devuelve una cookie de sesión válida', async () => {
    const respuesta = await login(peticion('contrasena-de-prueba'));

    expect(respuesta.status).toBe(200);
    const token = tokenDeCookie(respuesta);
    expect(token).toBeDefined();
    expect(await verifySessionToken(decodeURIComponent(token!))).toBe(true);
  });

  it('marca la cookie como httpOnly y con SameSite=Lax', async () => {
    const cookie = (await login(peticion('contrasena-de-prueba'))).headers.get('set-cookie') ?? '';
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
  });

  it('con la contraseña incorrecta responde 401 y no da cookie', async () => {
    const respuesta = await login(peticion('incorrecta'));
    expect(respuesta.status).toBe(401);
    expect(tokenDeCookie(respuesta)).toBeUndefined();
  });

  it('bloquea tras diez intentos fallidos desde la misma IP', async () => {
    for (let i = 0; i < 10; i += 1) {
      await login(peticion('incorrecta', '198.51.100.4'));
    }
    const respuesta = await login(peticion('contrasena-de-prueba', '198.51.100.4'));
    expect(respuesta.status).toBe(429);
  });

  it('el bloqueo es por IP y no afecta a otra distinta', async () => {
    for (let i = 0; i < 10; i += 1) {
      await login(peticion('incorrecta', '198.51.100.5'));
    }
    expect((await login(peticion('contrasena-de-prueba', '198.51.100.6'))).status).toBe(200);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run tests/lib/session.test.ts tests/api/auth.test.ts`
Expected: FAIL, no se pueden resolver los módulos.

- [ ] **Step 3: Implementar la sesión**

```bash
cat > src/lib/session.ts <<'EOF'
import { SignJWT, jwtVerify } from 'jose';
import { requiredEnv } from './env';

export const NOMBRE_COOKIE = 'rl_session';
const DIAS = 180;
const ALGORITMO = 'HS256';

function clave(): Uint8Array {
  return new TextEncoder().encode(`session:${requiredEnv('AUTH_SECRET')}`);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: 'propietario' })
    .setProtectedHeader({ alg: ALGORITMO })
    .setIssuedAt()
    .setExpirationTime(`${DIAS}d`)
    .sign(clave());
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, clave(), { algorithms: [ALGORITMO] });
    return true;
  } catch {
    return false;
  }
}

export function opcionesCookie() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/' as const,
    maxAge: DIAS * 24 * 60 * 60,
  };
}
EOF
```

- [ ] **Step 4: Añadir contraseña y límite de intentos a `src/lib/auth.ts`**

```bash
cat >> src/lib/auth.ts <<'EOF'

export function verifyPassword(given: string): boolean {
  return iguales(given, requiredEnv('APP_PASSWORD'));
}

const MAX_INTENTOS = 10;
const VENTANA_MINUTOS = 15;

export async function tooManyAttempts(ip: string): Promise<boolean> {
  const { db } = await import('@/db/client');
  const { loginAttempts } = await import('@/db/schema');
  const { and, count, eq, gte } = await import('drizzle-orm');

  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60 * 1000);
  const [fila] = await db
    .select({ total: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.attemptedAt, desde)));

  return Number(fila?.total ?? 0) >= MAX_INTENTOS;
}

export async function recordAttempt(ip: string): Promise<void> {
  const { db } = await import('@/db/client');
  const { loginAttempts } = await import('@/db/schema');
  await db.insert(loginAttempts).values({ ip });
}

export async function clearAttempts(ip: string): Promise<void> {
  const { db } = await import('@/db/client');
  const { loginAttempts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
}
EOF
```

Las importaciones son dinámicas a propósito: `verifyIngestToken` se usa desde
rutas que no deben abrir conexión a la base de datos solo por importar este
módulo.

- [ ] **Step 5: Implementar las rutas de entrada y salida**

```bash
mkdir -p src/app/api/auth/login src/app/api/auth/logout
cat > src/app/api/auth/login/route.ts <<'EOF'
import { cookies } from 'next/headers';
import { clearAttempts, recordAttempt, tooManyAttempts, verifyPassword } from '@/lib/auth';
import { NOMBRE_COOKIE, createSessionToken, opcionesCookie } from '@/lib/session';

function direccion(request: Request): string {
  const cabecera = request.headers.get('x-forwarded-for') ?? '';
  return cabecera.split(',')[0]?.trim() || 'desconocida';
}

export async function POST(request: Request): Promise<Response> {
  const ip = direccion(request);

  if (await tooManyAttempts(ip)) {
    return Response.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }

  let password = '';
  try {
    const cuerpo = (await request.json()) as { password?: unknown };
    password = typeof cuerpo.password === 'string' ? cuerpo.password : '';
  } catch {
    password = '';
  }

  if (!password || !verifyPassword(password)) {
    await recordAttempt(ip);
    return Response.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }

  await clearAttempts(ip);
  (await cookies()).set(NOMBRE_COOKIE, await createSessionToken(), opcionesCookie());
  return Response.json({ ok: true });
}
EOF
cat > src/app/api/auth/logout/route.ts <<'EOF'
import { cookies } from 'next/headers';
import { NOMBRE_COOKIE } from '@/lib/session';

export async function POST(): Promise<Response> {
  (await cookies()).delete(NOMBRE_COOKIE);
  return Response.json({ ok: true });
}
EOF
```

- [ ] **Step 6: Implementar el middleware**

```bash
cat > src/middleware.ts <<'EOF'
import { NextResponse, type NextRequest } from 'next/server';
import { NOMBRE_COOKIE, verifySessionToken } from '@/lib/session';

const PUBLICAS = ['/login', '/api/auth/login', '/api/img'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // La extensión entra por POST /api/items con token Bearer, no con cookie.
  if (pathname === '/api/items' && request.method === 'POST') {
    return NextResponse.next();
  }

  if (PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))) {
    return NextResponse.next();
  }

  if (await verifySessionToken(request.cookies.get(NOMBRE_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const destino = new URL('/login', request.url);
  destino.searchParams.set('volver', pathname);
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'],
};
EOF
```

- [ ] **Step 7: Implementar la página de entrada**

```bash
mkdir -p src/app/login
cat > src/app/login/page.tsx <<'EOF'
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (respuesta.ok) {
      router.replace(params.get('volver') || '/');
      return;
    }

    const cuerpo = await respuesta.json().catch(() => ({ error: 'No se pudo entrar' }));
    setError(cuerpo.error ?? 'No se pudo entrar');
    setEnviando(false);
  }

  return (
    <main style={{ maxWidth: '20rem', margin: '6rem auto', padding: '0 1rem' }}>
      <h1>Read Later</h1>
      <form onSubmit={enviar}>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(evento) => setPassword(evento.target.value)}
          style={{ display: 'block', width: '100%', padding: '0.6rem', margin: '0.5rem 0 1rem' }}
        />
        <button type="submit" disabled={enviando} style={{ padding: '0.6rem 1rem' }}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
    </main>
  );
}
EOF
```

- [ ] **Step 8: Ejecutar los tests**

Run: `npx vitest run tests/lib/session.test.ts tests/api/auth.test.ts`
Expected: PASS, siete tests.

- [ ] **Step 9: Comprobar la redirección a mano**

```bash
npm run dev
```

```bash
curl -si http://localhost:3000/ | head -5
```

Expected: `HTTP/1.1 307` con `location: /login?volver=%2F`.

- [ ] **Step 10: Commit**

```bash
git add src/lib/session.ts src/lib/auth.ts src/app/api/auth src/app/login src/middleware.ts tests/lib/session.test.ts tests/api/auth.test.ts
git commit -m "$(printf 'Añadir sesión con contraseña, límite de intentos y protección de rutas\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 8: Rutas de lectura y modificación de artículos

**Files:**
- Modify: `src/app/api/items/route.ts` (añadir `GET`)
- Create: `src/app/api/items/[id]/route.ts`, `tests/api/items-crud.test.ts`

**Interfaces:**
- Consumes: `listItems`, `getItem`, `updateItem`, `deleteItem` de `@/services/items`.
- Produces: `GET` en `/api/items`; `GET`, `PATCH`, `DELETE` en `/api/items/[id]`.
  En App Router los `params` son una promesa, así que las tres funciones reciben
  `{ params }: { params: Promise<{ id: string }> }` y hacen `await params`.

- [ ] **Step 1: Escribir el test que falla**

```bash
cat > tests/api/items-crud.test.ts <<'EOF'
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listar } from '@/app/api/items/route';
import { DELETE, GET as detalle, PATCH } from '@/app/api/items/[id]/route';
import { createItem } from '@/services/items';
import { resetDb } from '../setup/reset';

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

async function crear(url: string) {
  const { id } = await createItem({
    url,
    title: `Artículo ${url}`,
    html: '<p>Un cuerpo con unas cuantas palabras dentro.</p>',
  });
  return id;
}

beforeEach(resetDb);

describe('GET /api/items', () => {
  it('lista los pendientes', async () => {
    await crear('https://ejemplo.com/1');
    const respuesta = await listar(new Request('http://localhost/api/items?state=pendientes'));

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).items.length).toBe(1);
  });

  it('lista el archivo', async () => {
    const id = await crear('https://ejemplo.com/2');
    await PATCH(
      new Request('http://localhost/api/items/x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      }),
      contexto(id),
    );

    const respuesta = await listar(new Request('http://localhost/api/items?state=archivo'));
    expect((await respuesta.json()).items.length).toBe(1);
  });

  it('rechaza un state desconocido', async () => {
    expect((await listar(new Request('http://localhost/api/items?state=raro'))).status).toBe(400);
  });
});

describe('GET /api/items/:id', () => {
  it('devuelve el artículo con su HTML', async () => {
    const id = await crear('https://ejemplo.com/3');
    const cuerpo = await (await detalle(new Request('http://localhost/x'), contexto(id))).json();

    expect(cuerpo.item.contentHtml).toContain('<p>');
  });

  it('responde 404 si no existe', async () => {
    const respuesta = await detalle(
      new Request('http://localhost/x'),
      contexto('00000000-0000-0000-0000-000000000000'),
    );
    expect(respuesta.status).toBe(404);
  });
});

describe('PATCH /api/items/:id', () => {
  function patch(id: string, cambios: unknown) {
    return PATCH(
      new Request('http://localhost/x', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cambios),
      }),
      contexto(id),
    );
  }

  it('archiva y responde con el artículo actualizado', async () => {
    const id = await crear('https://ejemplo.com/4');
    const cuerpo = await (await patch(id, { archived: true })).json();

    expect(cuerpo.item.archivedAt).not.toBeNull();
  });

  it('es idempotente al repetir el mismo cambio', async () => {
    const id = await crear('https://ejemplo.com/5');
    const primera = await (await patch(id, { archived: true })).json();
    const segunda = await (await patch(id, { archived: true })).json();

    expect(segunda.item.archivedAt).toBe(primera.item.archivedAt);
  });

  it('guarda la posición de lectura', async () => {
    const id = await crear('https://ejemplo.com/6');
    const cuerpo = await (await patch(id, { scrollPct: 0.5 })).json();

    expect(cuerpo.item.scrollPct).toBeCloseTo(0.5, 5);
  });

  it('rechaza campos no reconocidos', async () => {
    const id = await crear('https://ejemplo.com/7');
    expect((await patch(id, { title: 'otro' })).status).toBe(400);
  });
});

describe('DELETE /api/items/:id', () => {
  it('borra y luego responde 404', async () => {
    const id = await crear('https://ejemplo.com/8');

    expect((await DELETE(new Request('http://localhost/x'), contexto(id))).status).toBe(200);
    expect((await DELETE(new Request('http://localhost/x'), contexto(id))).status).toBe(404);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/api/items-crud.test.ts`
Expected: FAIL, `listar` no es una función y no se resuelve `[id]/route`.

- [ ] **Step 3: Añadir `GET` a `/api/items`**

```bash
cat >> src/app/api/items/route.ts <<'EOF'

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state') ?? 'pendientes';

  if (state !== 'pendientes' && state !== 'archivo') {
    return Response.json({ error: 'state debe ser pendientes o archivo' }, { status: 400 });
  }

  const limite = Number(searchParams.get('limit') ?? '50');
  const antesDe = searchParams.get('before');
  const before = antesDe ? new Date(antesDe) : undefined;

  const lista = await listItems({
    state,
    limit: Number.isFinite(limite) && limite > 0 ? limite : 50,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
  });

  return Response.json({ items: lista });
}
EOF
```

Y añadir `listItems` a la importación existente al principio del fichero:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/app/api/items/route.ts')
s = p.read_text()
s = s.replace(
    "import { createItem } from '@/services/items';",
    "import { createItem, listItems } from '@/services/items';",
)
p.write_text(s)
PY
```

- [ ] **Step 4: Implementar `/api/items/[id]`**

```bash
mkdir -p 'src/app/api/items/[id]'
cat > 'src/app/api/items/[id]/route.ts' <<'EOF'
import { deleteItem, getItem, updateItem, type ItemPatch } from '@/services/items';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return Response.json({ error: 'No encontrado' }, { status: 404 });
  return Response.json({ item });
}

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'JSON no válido' }, { status: 400 });
  }

  const permitidos = new Set(['archived', 'scrollPct']);
  const desconocidos = Object.keys(cuerpo).filter((clave) => !permitidos.has(clave));
  if (desconocidos.length > 0) {
    return Response.json({ error: `Campos no admitidos: ${desconocidos.join(', ')}` }, { status: 400 });
  }

  const patch: ItemPatch = {};
  if ('archived' in cuerpo) {
    if (typeof cuerpo.archived !== 'boolean') {
      return Response.json({ error: 'archived debe ser booleano' }, { status: 400 });
    }
    patch.archived = cuerpo.archived;
  }
  if ('scrollPct' in cuerpo) {
    if (typeof cuerpo.scrollPct !== 'number' || !Number.isFinite(cuerpo.scrollPct)) {
      return Response.json({ error: 'scrollPct debe ser un número' }, { status: 400 });
    }
    patch.scrollPct = cuerpo.scrollPct;
  }

  const item = await updateItem(id, patch);
  if (!item) return Response.json({ error: 'No encontrado' }, { status: 404 });
  return Response.json({ item });
}

export async function DELETE(_request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  const borrado = await deleteItem(id);
  if (!borrado) return Response.json({ error: 'No encontrado' }, { status: 404 });
  return Response.json({ ok: true });
}
EOF
```

- [ ] **Step 5: Ejecutar el test**

Run: `npx vitest run tests/api/items-crud.test.ts`
Expected: PASS, once tests.

- [ ] **Step 6: Ejecutar toda la suite**

Run: `npm test`
Expected: PASS, todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/items tests/api/items-crud.test.ts
git commit -m "$(printf 'Añadir rutas de lectura, modificación y borrado de artículos\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 9: Proxy de imágenes con guardas contra SSRF

**Files:**
- Create: `src/lib/net-guard.ts`, `src/app/api/img/route.ts`,
  `tests/lib/net-guard.test.ts`, `tests/api/img.test.ts`

**Interfaces:**
- Consumes: `verifyImageSig` de `@/lib/img-sign`.
- Produces:
  - `isPrivateAddress(ip: string): boolean` en `@/lib/net-guard`
  - `assertPublicHost(hostname: string): Promise<void>` en `@/lib/net-guard`,
    lanza `Error` si el nombre resuelve a una dirección no pública
  - `GET` en `src/app/api/img/route.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```bash
cat > tests/lib/net-guard.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from '@/lib/net-guard';

describe('isPrivateAddress', () => {
  it('detecta las redes privadas y especiales de IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '0.0.0.0',
      '100.64.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('acepta direcciones públicas de IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('detecta loopback, enlace-local y únicas locales de IPv6', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('acepta una IPv6 pública', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });
});
EOF
cat > tests/api/img.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/img/route';
import { signImage } from '@/lib/img-sign';

function peticion(url: string, sig?: string): Request {
  const firma = sig ?? signImage(url);
  return new Request(`http://localhost/api/img?url=${encodeURIComponent(url)}&sig=${firma}`);
}

describe('GET /api/img', () => {
  it('rechaza una petición sin firma', async () => {
    const respuesta = await GET(
      new Request(`http://localhost/api/img?url=${encodeURIComponent('https://cdn.ejemplo.com/a.jpg')}`),
    );
    expect(respuesta.status).toBe(403);
  });

  it('rechaza una firma que no corresponde', async () => {
    expect((await GET(peticion('https://cdn.ejemplo.com/a.jpg', 'firma-falsa'))).status).toBe(403);
  });

  it('rechaza esquemas que no son http o https aunque estén firmados', async () => {
    expect((await GET(peticion('file:///etc/passwd'))).status).toBe(400);
  });

  it('rechaza un host que resuelve a una dirección privada', async () => {
    expect((await GET(peticion('http://localhost:9/a.jpg'))).status).toBe(400);
    expect((await GET(peticion('http://127.0.0.1/a.jpg'))).status).toBe(400);
    expect((await GET(peticion('http://169.254.169.254/latest/meta-data'))).status).toBe(400);
  });
});
EOF
```

Los tests no salen a internet: comprueban las tres puertas que se cierran antes
de cualquier `fetch`. Que una imagen real se descargue se verifica a mano en el
paso 6.

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run tests/lib/net-guard.test.ts tests/api/img.test.ts`
Expected: FAIL, no se resuelven los módulos.

- [ ] **Step 3: Implementar las guardas de red**

```bash
cat > src/lib/net-guard.ts <<'EOF'
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4EsPrivada(ip: string): boolean {
  const partes = ip.split('.').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // lo que no se entiende, no se visita
  }
  const [a, b] = partes;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true; // multicast y reservado
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4EsPrivada(ip);
  if (version !== 6) return true;

  const normalizada = ip.toLowerCase();
  const mapeada = normalizada.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeada) return ipv4EsPrivada(mapeada[1]);

  if (normalizada === '::' || normalizada === '::1') return true;
  if (/^fe[89ab]/.test(normalizada)) return true; // enlace-local
  if (/^f[cd]/.test(normalizada)) return true; // únicas locales
  return false;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Dirección no pública');
    }
    return;
  }

  const direcciones = await lookup(hostname, { all: true });
  if (direcciones.length === 0 || direcciones.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Dirección no pública');
  }
}
EOF
```

- [ ] **Step 4: Implementar el proxy**

```bash
mkdir -p src/app/api/img
cat > src/app/api/img/route.ts <<'EOF'
import { verifyImageSig } from '@/lib/img-sign';
import { assertPublicHost } from '@/lib/net-guard';

const MAXIMO_BYTES = 10 * 1024 * 1024;
const TIEMPO_MAXIMO_MS = 8000;
const SALTOS_MAXIMOS = 2;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const sig = searchParams.get('sig');

  if (!url || !verifyImageSig(url, sig)) {
    return new Response('Firma no válida', { status: 403 });
  }

  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return new Response('URL no válida', { status: 400 });
  }

  try {
    for (let salto = 0; salto <= SALTOS_MAXIMOS; salto += 1) {
      if (destino.protocol !== 'http:' && destino.protocol !== 'https:') {
        return new Response('Esquema no admitido', { status: 400 });
      }
      await assertPublicHost(destino.hostname);

      const respuesta = await fetch(destino, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        headers: { accept: 'image/*' },
      });

      if (respuesta.status >= 300 && respuesta.status < 400) {
        const siguiente = respuesta.headers.get('location');
        if (!siguiente) return new Response('Redirección sin destino', { status: 502 });
        destino = new URL(siguiente, destino);
        continue;
      }

      if (!respuesta.ok || !respuesta.body) {
        return new Response('El origen no devolvió la imagen', { status: 502 });
      }

      const tipo = respuesta.headers.get('content-type') ?? '';
      if (!tipo.startsWith('image/')) {
        return new Response('El recurso no es una imagen', { status: 415 });
      }

      const declarado = Number(respuesta.headers.get('content-length') ?? '0');
      if (declarado > MAXIMO_BYTES) {
        return new Response('Imagen demasiado grande', { status: 413 });
      }

      const datos = new Uint8Array(await respuesta.arrayBuffer());
      if (datos.byteLength > MAXIMO_BYTES) {
        return new Response('Imagen demasiado grande', { status: 413 });
      }

      return new Response(datos, {
        headers: {
          'content-type': tipo,
          'content-length': String(datos.byteLength),
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return new Response('Demasiadas redirecciones', { status: 502 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al obtener la imagen';
    const estado = mensaje === 'Dirección no pública' ? 400 : 502;
    return new Response(mensaje, { status: estado });
  }
}
EOF
```

Las redirecciones se siguen a mano (`redirect: 'manual'`) porque con
`follow` el navegador del servidor iría al destino final sin volver a pasar por
`assertPublicHost`, y un redirector público a `169.254.169.254` bastaría para
saltarse la guarda.

Queda una ventana teórica entre resolver el nombre y conectar (el DNS podría
cambiar en medio). Se acepta a conciencia: cerrarla exige un socket propio, y el
atacante tendría que controlar además la firma HMAC.

- [ ] **Step 5: Ejecutar los tests**

Run: `npx vitest run tests/lib/net-guard.test.ts tests/api/img.test.ts`
Expected: PASS, ocho tests.

- [ ] **Step 6: Comprobar a mano que sirve una imagen real**

```bash
npm run dev
```

```bash
node --env-file=.env.local -e '
const { imageProxyPath } = await import("./src/lib/img-sign.ts");
console.log("http://localhost:3000" + imageProxyPath("https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"));
' 2>/dev/null || echo 'Si Node no importa TypeScript directamente, generar la ruta desde la app en el navegador abriendo un artículo con imagen.'
```

Expected: `curl -sI` de esa ruta devuelve `200` y `content-type: image/png`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/net-guard.ts src/app/api/img tests/lib/net-guard.test.ts tests/api/img.test.ts
git commit -m "$(printf 'Añadir proxy de imágenes con firma y guardas contra SSRF\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 10: Listas de pendientes y archivo

**Files:**
- Create: `src/components/item-card.tsx`, `src/components/item-actions.tsx`,
  `src/components/nav.tsx`, `src/app/archivo/page.tsx`, `src/lib/formato.ts`,
  `tests/lib/formato.test.ts`
- Modify: `src/app/page.tsx`, `src/app/globals.css`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: `listItems`, `ItemSummary` de `@/services/items`.
- Produces:
  - `tiempoDeLectura(wordCount: number): string` en `@/lib/formato`
  - `fechaCorta(fecha: Date): string` en `@/lib/formato`
  - `<ItemCard item={ItemSummary} />`, `<ItemActions item={ItemSummary} />`

- [ ] **Step 1: Escribir el test que falla**

```bash
cat > tests/lib/formato.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { fechaCorta, tiempoDeLectura } from '@/lib/formato';

describe('tiempoDeLectura', () => {
  it('calcula a 220 palabras por minuto y redondea hacia arriba', () => {
    expect(tiempoDeLectura(220)).toBe('1 min');
    expect(tiempoDeLectura(221)).toBe('2 min');
    expect(tiempoDeLectura(2200)).toBe('10 min');
  });

  it('avisa cuando no hay texto suficiente para leer', () => {
    expect(tiempoDeLectura(0)).toBe('sin texto');
    expect(tiempoDeLectura(40)).toBe('sin texto');
  });
});

describe('fechaCorta', () => {
  it('da día y mes abreviado en español', () => {
    expect(fechaCorta(new Date('2026-03-09T10:00:00Z'))).toMatch(/9 mar/);
  });
});
EOF
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run tests/lib/formato.test.ts`
Expected: FAIL, no se resuelve `@/lib/formato`.

- [ ] **Step 3: Implementar los formatos**

El umbral de 50 palabras es el mismo que decide si un artículo se considera mal
extraído; vive aquí en una constante exportada para que el lector lo reutilice.

```bash
cat > src/lib/formato.ts <<'EOF'
export const MINIMO_PALABRAS_LEGIBLE = 50;

const PALABRAS_POR_MINUTO = 220;

export function tiempoDeLectura(wordCount: number): string {
  if (wordCount < MINIMO_PALABRAS_LEGIBLE) return 'sin texto';
  return `${Math.ceil(wordCount / PALABRAS_POR_MINUTO)} min`;
}

export function fechaCorta(fecha: Date): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(fecha);
}
EOF
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run tests/lib/formato.test.ts`
Expected: PASS, tres tests.

- [ ] **Step 5: Escribir los componentes de interfaz**

```bash
mkdir -p src/components src/app/archivo
cat > src/components/item-actions.tsx <<'EOF'
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = { id: string; archivado: boolean };

export function ItemActions({ id, archivado }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function llamar(metodo: 'PATCH' | 'DELETE', cuerpo?: unknown) {
    setError(null);
    const respuesta = await fetch(`/api/items/${id}`, {
      method: metodo,
      ...(cuerpo ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) } : {}),
    });
    if (!respuesta.ok) {
      setError('No se pudo guardar el cambio');
      return;
    }
    iniciar(() => router.refresh());
  }

  return (
    <div className="acciones">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => llamar('PATCH', { archived: !archivado })}
      >
        {archivado ? 'Devolver a pendientes' : 'Archivar'}
      </button>
      <button
        type="button"
        disabled={pendiente}
        className="borrar"
        onClick={() => {
          if (confirm('¿Borrar este artículo definitivamente?')) llamar('DELETE');
        }}
      >
        Borrar
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
EOF
cat > src/components/item-card.tsx <<'EOF'
import Link from 'next/link';
import { fechaCorta, tiempoDeLectura } from '@/lib/formato';
import type { ItemSummary } from '@/services/items';
import { ItemActions } from './item-actions';

export function ItemCard({ item }: { item: ItemSummary }) {
  return (
    <article className="tarjeta">
      <h2>
        <Link href={`/a/${item.id}`}>{item.title}</Link>
      </h2>
      <p className="meta">
        {[item.siteName, tiempoDeLectura(item.wordCount), fechaCorta(item.savedAt)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {item.excerpt && <p className="extracto">{item.excerpt}</p>}
      <ItemActions id={item.id} archivado={item.archivedAt !== null} />
    </article>
  );
}
EOF
cat > src/components/nav.tsx <<'EOF'
import Link from 'next/link';

export function Nav() {
  return (
    <nav className="nav">
      <Link href="/">Pendientes</Link>
      <Link href="/archivo">Archivo</Link>
    </nav>
  );
}
EOF
```

- [ ] **Step 6: Escribir las páginas de lista**

```bash
cat > src/app/page.tsx <<'EOF'
import { ItemCard } from '@/components/item-card';
import { Nav } from '@/components/nav';
import { listItems } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Pendientes() {
  const items = await listItems({ state: 'pendientes' });

  return (
    <main className="columna">
      <Nav />
      <h1>Pendientes</h1>
      {items.length === 0 && <p className="vacio">No hay nada pendiente. Guarda algo desde Chrome.</p>}
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </main>
  );
}
EOF
cat > src/app/archivo/page.tsx <<'EOF'
import { ItemCard } from '@/components/item-card';
import { Nav } from '@/components/nav';
import { listItems } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Archivo() {
  const items = await listItems({ state: 'archivo' });

  return (
    <main className="columna">
      <Nav />
      <h1>Archivo</h1>
      {items.length === 0 && <p className="vacio">El archivo está vacío.</p>}
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </main>
  );
}
EOF
```

- [ ] **Step 7: Añadir los estilos**

```bash
cat >> src/app/globals.css <<'EOF'

.columna {
  max-width: var(--medida);
  margin: 0 auto;
  padding: 1.5rem 1.25rem 5rem;
}

.nav {
  display: flex;
  gap: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--borde);
  font: 0.85rem/1 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

h1 {
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.tarjeta {
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--borde);
}

.tarjeta h2 {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  line-height: 1.3;
  font-weight: 600;
}

.tarjeta h2 a {
  color: inherit;
  text-decoration: none;
}

.tarjeta h2 a:hover {
  color: var(--acento);
}

.meta,
.vacio,
.error {
  color: var(--tenue);
  font: 0.8rem/1.4 ui-sans-serif, system-ui, sans-serif;
}

.extracto {
  margin: 0.4rem 0 0;
  color: var(--tenue);
  font-size: 0.95rem;
}

.acciones {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.75rem;
}

.acciones button {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--borde);
  border-radius: 0.3rem;
  background: transparent;
  color: var(--tenue);
  font: 0.75rem/1 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
}

.acciones button:hover:not(:disabled) {
  color: var(--texto);
  border-color: var(--tenue);
}

.acciones button.borrar:hover:not(:disabled) {
  color: #c0392b;
  border-color: #c0392b;
}
EOF
```

- [ ] **Step 8: Verificarlo en el navegador**

```bash
npm run dev
```

Entrar en `http://localhost:3000`, poner la contraseña de `.env.local`, y
comprobar: aparece el artículo creado con `curl` en la Task 6; «Archivar» lo
mueve al archivo; «Devolver a pendientes» lo trae de vuelta; «Borrar» pide
confirmación y lo elimina.

- [ ] **Step 9: Commit**

```bash
git add src/components src/app/page.tsx src/app/archivo src/app/globals.css src/lib/formato.ts tests/lib/formato.test.ts
git commit -m "$(printf 'Añadir listas de pendientes y archivo con acciones\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 11: Lector con posición de lectura

**Files:**
- Create: `src/app/a/[id]/page.tsx`, `src/components/scroll-tracker.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `getItem` de `@/services/items`, `MINIMO_PALABRAS_LEGIBLE` de
  `@/lib/formato`.
- Produces: `<ScrollTracker id={string} inicial={number} />`

El HTML se inyecta con `dangerouslySetInnerHTML` y eso es correcto aquí: se
saneó en la Task 4 antes de guardarse. Si alguna vez se guardara HTML sin pasar
por `sanitizeArticle`, este es el punto donde dolería.

- [ ] **Step 1: Escribir el rastreador de posición**

```bash
cat > src/components/scroll-tracker.tsx <<'EOF'
'use client';

import { useEffect, useRef } from 'react';

type Props = { id: string; inicial: number };

export function ScrollTracker({ id, inicial }: Props) {
  const ultimoEnviado = useRef(inicial);

  useEffect(() => {
    if (inicial > 0.02 && inicial < 0.98) {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: alto * inicial });
    }
  }, [inicial]);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    function posicion(): number {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      if (alto <= 0) return 0;
      return Math.min(1, Math.max(0, window.scrollY / alto));
    }

    function enviar() {
      const actual = posicion();
      if (Math.abs(actual - ultimoEnviado.current) < 0.02) return;
      ultimoEnviado.current = actual;
      void fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scrollPct: actual }),
        keepalive: true,
      });
    }

    function alDesplazar() {
      clearTimeout(temporizador);
      temporizador = setTimeout(enviar, 700);
    }

    window.addEventListener('scroll', alDesplazar, { passive: true });
    window.addEventListener('pagehide', enviar);

    return () => {
      clearTimeout(temporizador);
      window.removeEventListener('scroll', alDesplazar);
      window.removeEventListener('pagehide', enviar);
      enviar();
    };
  }, [id]);

  return null;
}
EOF
```

`keepalive: true` es lo que permite que la petición del último desplazamiento
llegue aunque la pestaña se esté cerrando.

- [ ] **Step 2: Escribir la página del lector**

```bash
mkdir -p 'src/app/a/[id]'
cat > 'src/app/a/[id]/page.tsx' <<'EOF'
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemActions } from '@/components/item-actions';
import { ScrollTracker } from '@/components/scroll-tracker';
import { MINIMO_PALABRAS_LEGIBLE, fechaCorta, tiempoDeLectura } from '@/lib/formato';
import { getItem } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Lector({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const extraccionFallida = item.wordCount < MINIMO_PALABRAS_LEGIBLE;

  return (
    <main className="columna lector">
      <ScrollTracker id={item.id} inicial={item.scrollPct} />

      <p className="nav">
        <Link href="/">← Pendientes</Link>
      </p>

      <h1>{item.title}</h1>
      <p className="meta">
        {[item.byline, item.siteName, item.publishedAt ? fechaCorta(item.publishedAt) : null,
          extraccionFallida ? null : tiempoDeLectura(item.wordCount)]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {extraccionFallida ? (
        <p className="aviso">
          No se pudo extraer el texto de esta página.{' '}
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            Abrir el original
          </a>
          .
        </p>
      ) : (
        <div className="cuerpo" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
      )}

      <footer>
        <ItemActions id={item.id} archivado={item.archivedAt !== null} />
        <p className="meta">
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            Ver el original
          </a>
        </p>
      </footer>
    </main>
  );
}
EOF
```

- [ ] **Step 3: Añadir los estilos del lector**

```bash
cat >> src/app/globals.css <<'EOF'

.lector h1 {
  margin: 0.5rem 0 0.25rem;
  font-size: 1.75rem;
  line-height: 1.2;
  letter-spacing: -0.015em;
}

.cuerpo {
  margin-top: 2rem;
  font-size: 1.125rem;
  line-height: 1.75;
}

.cuerpo p,
.cuerpo ul,
.cuerpo ol,
.cuerpo blockquote,
.cuerpo pre,
.cuerpo figure {
  margin: 0 0 1.4em;
}

.cuerpo h2,
.cuerpo h3 {
  margin: 2em 0 0.6em;
  line-height: 1.25;
}

.cuerpo img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 0.25rem;
}

.cuerpo figcaption {
  margin-top: 0.5rem;
  color: var(--tenue);
  font: 0.8rem/1.4 ui-sans-serif, system-ui, sans-serif;
  text-align: center;
}

.cuerpo blockquote {
  padding-left: 1rem;
  border-left: 2px solid var(--borde);
  color: var(--tenue);
  font-style: italic;
}

.cuerpo pre {
  overflow-x: auto;
  padding: 0.9rem 1rem;
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--texto) 6%, transparent);
  font-size: 0.85rem;
  line-height: 1.5;
}

.cuerpo table {
  display: block;
  overflow-x: auto;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.cuerpo th,
.cuerpo td {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--borde);
  text-align: left;
}

.aviso {
  margin-top: 2rem;
  padding: 1rem;
  border: 1px solid var(--borde);
  border-radius: 0.35rem;
  color: var(--tenue);
}

.lector footer {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--borde);
}
EOF
```

`.cuerpo table` y `.cuerpo pre` se desplazan horizontalmente dentro de su caja
para que una tabla ancha de un artículo no rompa la anchura de la página en el
móvil.

- [ ] **Step 4: Verificarlo en el navegador**

```bash
npm run dev
```

Guardar con `curl` un artículo con imágenes y comprobar:

1. El texto se lee cómodamente y las imágenes cargan (vienen por `/api/img`).
2. Bajar a media altura, recargar: vuelve a la misma posición.
3. Guardar una página sin texto extraíble y comprobar que sale el aviso con el
   enlace al original.

```bash
curl -s -X POST http://localhost:3000/api/items \
  -H "authorization: Bearer $(grep '^INGEST_TOKEN=' .env.local | cut -d= -f2-)" \
  -H 'content-type: application/json' \
  -d '{"url":"https://ejemplo.com/vacio","title":"Página sin texto","html":"<div></div>"}'
```

- [ ] **Step 5: Ejecutar toda la suite y compilar**

Run: `npm test && npm run build`
Expected: PASS y compilación sin errores.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/a' src/components/scroll-tracker.tsx src/app/globals.css
git commit -m "$(printf 'Añadir lector con tipografía cuidada y posición de lectura\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 12: Prueba de navegador del flujo completo

**Files:**
- Create: `playwright.config.ts`, `e2e/flujo.spec.ts`
- Modify: `package.json` (script `test:e2e`), `.gitignore`

**Interfaces:**
- Consumes: la aplicación completa por HTTP, y el token de `.env.test` para
  sembrar artículos.

- [ ] **Step 1: Instalar Playwright**

```bash
npm i -D @playwright/test
npx playwright install chromium
printf 'test-results/\nplaywright-report/\n' >> .gitignore
```

- [ ] **Step 2: Configurar Playwright**

Se usa la base de datos de pruebas y `next dev`, no una compilación de
producción: arranca en segundos y es lo que hace útil esta prueba.

```bash
cat > playwright.config.ts <<'EOF'
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npx next dev --port 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    env: {
      DOTENV_CONFIG_PATH: '.env.test',
      NODE_ENV: 'development',
    },
  },
});
EOF
```

Next carga `.env.test` solo si se le indica, así que hay que pasarle las
variables de forma explícita:

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('playwright.config.ts')
s = p.read_text()
s = s.replace(
    "import { defineConfig } from '@playwright/test';",
    "import { config } from 'dotenv';\nimport { defineConfig } from '@playwright/test';\n\nconfig({ path: '.env.test' });",
)
s = s.replace(
    "    env: {\n      DOTENV_CONFIG_PATH: '.env.test',\n      NODE_ENV: 'development',\n    },",
    "    env: {\n      DATABASE_URL: process.env.DATABASE_URL!,\n      APP_PASSWORD: process.env.APP_PASSWORD!,\n      AUTH_SECRET: process.env.AUTH_SECRET!,\n      INGEST_TOKEN: process.env.INGEST_TOKEN!,\n    },",
)
p.write_text(s)
PY
npm pkg set scripts.test:e2e="playwright test"
```

- [ ] **Step 3: Escribir la prueba que falla**

```bash
mkdir -p e2e
cat > e2e/flujo.spec.ts <<'EOF'
import { expect, test } from '@playwright/test';

const TITULO = 'Artículo de prueba de extremo a extremo';

test.beforeEach(async ({ request }) => {
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/e2e-${Date.now()}`,
      title: TITULO,
      siteName: 'Ejemplo',
      html: `<p>${'palabra '.repeat(300)}</p>`,
    },
  });
  expect(respuesta.status()).toBe(201);
});

test('entrar, leer, archivar y encontrarlo en el archivo', async ({ page }) => {
  await page.goto('/');

  // Sin sesión, la app manda al login.
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Pendientes muestra el artículo sembrado.
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
  await page.getByRole('link', { name: TITULO }).click();

  // El lector muestra el cuerpo.
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
  await expect(page.locator('.cuerpo')).toContainText('palabra');

  // Archivar desde el lector.
  await page.getByRole('button', { name: 'Archivar' }).click();

  // Ya no está en pendientes, sí en el archivo.
  await page.goto('/');
  await expect(page.getByRole('link', { name: TITULO })).toHaveCount(0);
  await page.goto('/archivo');
  await expect(page.getByRole('link', { name: TITULO })).toBeVisible();
});

test('una contraseña incorrecta no deja entrar', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill('esto-no-es');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Contraseña incorrecta')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
EOF
```

- [ ] **Step 4: Ejecutar la prueba**

Run: `npm run test:e2e`
Expected: PASS, dos pruebas. Si el login falla por bloqueo de intentos de una
ejecución anterior, vaciar la tabla:

```bash
docker compose exec -T db psql -U postgres -d readlater_test -c 'truncate table login_attempts'
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e package.json .gitignore
git commit -m "$(printf 'Añadir prueba de navegador del flujo leer y archivar\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 13: Despliegue en Vercel con Neon Postgres

Al terminar esta tarea la fase 2 del spec está completa: se lee en el móvil.

**Files:**
- Create: `README.md`
- Modify: `package.json` (script `db:deploy`)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: una URL de producción funcionando y las cuatro variables de entorno
  configuradas en Vercel.

- [ ] **Step 1: Comprobar los requisitos previos**

```bash
vercel --version || npm i -g vercel
```

Si el CLI no estaba instalado, instalarlo antes de seguir. La sesión también
necesita estar autenticada:

```bash
vercel whoami || vercel login
```

- [ ] **Step 2: Vincular el proyecto**

```bash
vercel link --yes
```

- [ ] **Step 3: Provisionar Postgres desde el Marketplace**

**Antes de ejecutar nada en este paso, cargar la skill `vercel:marketplace`** y
seguirla: es la que sabe qué proveedores hay disponibles en esta cuenta y cuáles
son los comandos vigentes. El objetivo es una base de datos Postgres real
provisionada y con su `DATABASE_URL` inyectada en el proyecto —
no un marcador de posición.

Punto de partida esperado:

```bash
vercel integration add neon
```

Terminado esto, comprobar que la variable existe en el entorno de producción:

```bash
vercel env ls production
```

Expected: aparece una variable con la cadena de conexión de Postgres. Si el
nombre que inyecta el proveedor no es `DATABASE_URL`, añadir un alias:

```bash
vercel env add DATABASE_URL production
```

- [ ] **Step 4: Configurar los tres secretos restantes**

Generar valores nuevos, distintos de los de desarrollo. La contraseña la elige
la persona; el resto se generan.

```bash
openssl rand -base64 32   # para AUTH_SECRET
openssl rand -base64 32   # para INGEST_TOKEN
```

```bash
vercel env add APP_PASSWORD production
vercel env add AUTH_SECRET production
vercel env add INGEST_TOKEN production
```

Guardar el valor de `INGEST_TOKEN`: es el que se pondrá en la extensión en el
plan siguiente.

- [ ] **Step 5: Aplicar las migraciones en producción**

```bash
npm pkg set scripts.db:deploy="drizzle-kit migrate"
vercel env pull .env.production.local --environment production
printf '\n.env.production.local\n' >> .gitignore
```

`drizzle.config.ts` lee `.env.local`, así que para esta ejecución hay que
apuntarlo al fichero de producción:

```bash
DOTENV_CONFIG_PATH=.env.production.local \
  node --env-file=.env.production.local ./node_modules/.bin/drizzle-kit migrate
```

Expected: las migraciones se aplican sin error.

- [ ] **Step 6: Desplegar**

```bash
vercel deploy --prod
```

- [ ] **Step 7: Verificar en producción**

Con `<url>` la URL de producción y `<token>` el `INGEST_TOKEN` de producción:

```bash
curl -si -X POST https://<url>/api/items \
  -H 'authorization: Bearer <token>' \
  -H 'content-type: application/json' \
  -d '{"url":"https://es.wikipedia.org/wiki/Tinta","title":"Tinta","siteName":"Wikipedia","html":"<p>La tinta es un fluido que contiene pigmentos o colorantes y se usa para escribir o imprimir. Se conoce desde la antigüedad y su composición ha cambiado mucho a lo largo del tiempo.</p>"}'
```

Expected: `201`.

Después, comprobaciones que solo puede hacer una persona:

1. Abrir la URL en el **móvil**: debe pedir la contraseña.
2. Entrar y ver el artículo en pendientes.
3. Abrirlo y leerlo: tipografía cómoda, sin desplazamiento horizontal.
4. Archivarlo y confirmar que desaparece de pendientes.
5. Sin la cookie (ventana privada), confirmar que `/` redirige a `/login`.

- [ ] **Step 8: Escribir el README**

```bash
cat > README.md <<'EOF'
# Read Later

Sustituto personal de Pocket. Guarda artículos desde Chrome y léelos limpios en
el móvil o el escritorio.

- Diseño: `docs/superpowers/specs/2026-08-26-read-later-design.md`
- Planes: `docs/superpowers/plans/`

## Desarrollo

```bash
npm install
npm run db:up          # Postgres en Docker, puerto 5433
npm run db:migrate
npm run dev
```

Copia `.env.example` a `.env.local` y rellena los valores. `AUTH_SECRET` e
`INGEST_TOKEN` se generan con `openssl rand -base64 32`.

## Pruebas

```bash
npm test               # unitarias y de API, contra Postgres real
npm run test:e2e       # navegador, con Playwright
```

## Guardar un artículo sin la extensión

```bash
curl -X POST http://localhost:3000/api/items \
  -H "authorization: Bearer $INGEST_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"url":"https://ejemplo.com/a","title":"Título","html":"<p>Cuerpo</p>"}'
```

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres |
| `APP_PASSWORD` | Contraseña de acceso a la web app |
| `AUTH_SECRET` | Firma de la cookie de sesión y de las URLs de imagen |
| `INGEST_TOKEN` | Token que usa la extensión para guardar artículos |
EOF
```

- [ ] **Step 9: Commit**

```bash
git add README.md package.json .gitignore
git commit -m "$(printf 'Documentar el desarrollo y añadir el script de migración en producción\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

## Cobertura del spec en este plan

| Requisito del spec | Dónde |
|---|---|
| Tabla `items` con todas sus columnas e índices | Task 1 |
| Columna `tsvector` con configuración `simple` e índice GIN | Task 1 |
| Tabla `login_attempts` | Task 1 |
| Deduplicación por URL canónica | Tasks 2, 5 |
| Desarchivar al volver a guardar | Task 5 |
| Saneado con lista blanca, antes de guardar | Task 4 |
| Reescritura de imágenes al proxy, sin `srcset` | Task 4 |
| Texto y palabras derivados en el servidor | Tasks 4, 5 |
| `POST /api/items` con token Bearer y límite de 5 MB | Task 6 |
| Cookie de sesión firmada, `httpOnly`, `SameSite=Lax`, 180 días | Task 7 |
| Contraseña comparada en tiempo constante | Task 7 |
| Límite de intentos por IP en base de datos | Task 7 |
| Protección de rutas, con excepción para el POST de la extensión | Task 7 |
| `GET`/`PATCH`/`DELETE` de artículos, `PATCH` idempotente | Task 8 |
| Proxy de imágenes firmado, con guardas SSRF y límites | Task 9 |
| Archivar es fecha, borrar es acción aparte y explícita | Tasks 5, 8, 10 |
| Listas de pendientes y archivo con tiempo de lectura | Task 10 |
| Lector con tipografía cuidada y posición de lectura | Task 11 |
| Aviso y enlace al original cuando la extracción falla | Task 11 |
| Pruebas con fixtures, contra Postgres real, y de navegador | Tasks 1–12 |
| Despliegue en Vercel con Neon y verificación en el móvil | Task 13 |

Requisitos del spec que **no** cubre este plan, por diseño:

| Requisito | Plan que lo cubrirá |
|---|---|
| Extensión de Chrome (Manifest V3, Readability, metadatos, badge) | Extensión |
| Parámetro `q` de búsqueda y pantalla de búsqueda | Búsqueda y ajustes |
| Ajustes de lectura (tamaño, ancho, tema) | Búsqueda y ajustes |
| PWA instalable, service worker, sincronizador, cola offline | PWA y offline |
| Verificación manual del botón de la extensión en Chrome | Extensión |
