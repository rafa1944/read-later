# Read Later

Sustituto personal de Pocket: guarda artículos desde Chrome y léelos limpios en
el móvil o en el escritorio, con o sin conexión.

- Diseño: [`docs/superpowers/specs/2026-08-26-read-later-design.md`](docs/superpowers/specs/2026-08-26-read-later-design.md)
- Planes de implementación: [`docs/superpowers/plans/`](docs/superpowers/plans/)

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
npm test               # unitarias y de API, contra un Postgres real
npm run test:e2e       # navegador, con Playwright, sobre una compilación de producción
```

Las pruebas usan la base `readlater_test`, que crea el contenedor al arrancar
por primera vez. La suite de Vitest aplica las migraciones sola.

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
| `INGEST_TOKEN` | Token con el que la extensión guarda artículos |

## Despliegue

Requiere una sesión iniciada del CLI de Vercel (`vercel login`).

```bash
vercel link --yes
vercel integration add neon          # Postgres desde el Marketplace
vercel env add APP_PASSWORD production
vercel env add AUTH_SECRET production
vercel env add INGEST_TOKEN production
vercel env pull .env.production.local --environment production
npm run db:deploy                    # aplica las migraciones en producción
vercel deploy --prod
```

## Arquitectura en una pantalla

| Pieza | Qué hace |
|---|---|
| `src/lib/sanitize.ts` | Convierte HTML ajeno en HTML seguro y reescribe las imágenes al proxy. Se ejecuta **al guardar**, nunca al leer |
| `src/lib/img-sign.ts`, `src/app/api/img` | Proxy de imágenes firmado, con guardas contra SSRF |
| `src/lib/session.ts`, `src/lib/auth.ts` | Cookie de sesión para la web app, token Bearer para la extensión |
| `src/services/items.ts` | Toda la lógica de negocio; no sabe nada de HTTP |
| `src/proxy.ts` | Protege las rutas; deja pasar el POST de la extensión y el proxy de imágenes |
