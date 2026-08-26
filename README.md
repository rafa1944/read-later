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

## La extensión de Chrome

```bash
npm run ext:build
```

Después, en `chrome://extensions`: activar el modo de desarrollador, «Cargar
descomprimida» y elegir `extension/dist`. En los ajustes de la extensión hay que
poner la dirección del servidor y el `INGEST_TOKEN`, y conceder el permiso de
dominio que pide Chrome.

El botón de la barra guarda la pestaña actual; el atajo por defecto es `Alt+S`.
El resultado se ve en el propio botón:

| Badge | Significa |
|---|---|
| `✓` | Guardado |
| `=` | Ya lo tenías; vuelve a pendientes si estaba archivado |
| `!` | Error. El detalle sale en la consola del service worker |
| `⚙` | Falta configurar la extensión |

## Lectura sin conexión

La app es una PWA instalable. Estando abierta con red, un sincronizador guarda
en la caché del navegador las listas, los 30 artículos pendientes más recientes
y sus imágenes; a partir de ahí se leen sin cobertura. Lo que ya no está en
pendientes se descarta en la siguiente sincronización, así que la caché no crece
sin límite.

Lo que se archiva o se borra sin red va a una cola en IndexedDB y se envía solo
al volver la conexión. Mientras tanto la fila lo dice, en vez de fingir que ya
está hecho.

El aviso de «sin conexión» no se fía de `navigator.onLine`, que solo indica si
hay una red conectada: lo levanta el service worker cuando ha tenido que servir
algo desde la caché.

El service worker se compila desde `src/sw/` a `public/sw.js`; `npm run dev` y
`npm run build` lo hacen solos.

## Gestos en el móvil

- **Tirar hacia abajo** con la lista arriba del todo recarga y sincroniza.
- **Deslizar una fila hacia la izquierda** la archiva, o la devuelve a pendientes
  desde el archivo.

Los dos comparten la decisión de eje (`src/lib/gestos.ts`): lo lateral archiva,
lo vertical se desplaza, y ante la duda gana el vertical. Archivar exige más
recorrido que recargar, porque cambia datos.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres |
| `APP_PASSWORD` | Contraseña de acceso a la web app |
| `AUTH_SECRET` | Firma de la cookie de sesión y de las URLs de imagen |
| `INGEST_TOKEN` | Token con el que la extensión guarda artículos |

**Cuidado al rotar `AUTH_SECRET`.** Las URLs de las imágenes se firman cuando se
guarda el artículo y esa firma queda escrita en su HTML, así que cambiar el
secreto deja sin imágenes todo lo guardado hasta entonces (el texto no se toca) y
cierra las sesiones abiertas. Si hace falta rotarlo, hay que volver a generar el
HTML de los artículos existentes.

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

## Licencia

MIT. Ver [LICENSE](LICENSE).
