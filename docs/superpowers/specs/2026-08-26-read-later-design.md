# Read Later — diseño

Fecha: 2026-08-26
Estado: aprobado, pendiente de plan de implementación

## Propósito

Sustituto personal de Pocket, para un solo usuario. Guardar un artículo desde
Chrome en el escritorio con un clic y leerlo después, limpio y cómodo, en el
móvil o en el escritorio, con o sin conexión.

No es un producto multiusuario ni un servicio para terceros. Toda decisión de
diseño se resuelve a favor de la simplicidad de mantenimiento para una persona.

## Alcance

Dentro de la v1:

- Guardar la página activa desde una extensión de Chrome.
- Leer los artículos guardados en una web app instalable (PWA).
- Archivar y desarchivar (el flujo de bandeja de entrada de Pocket).
- Búsqueda de texto sobre título y contenido.
- Ajustes de lectura: tamaño de letra, ancho de columna, tema.
- Lectura sin conexión de los artículos pendientes recientes.
- Acceso protegido con una contraseña única.

Fuera de la v1, decidido explícitamente:

- Etiquetas.
- Importar el export de Pocket.
- Guardar desde el móvil (compartir) o pegando una URL.
- Resaltados, notas, lectura en voz alta.
- Más de un usuario.

## Arquitectura

Tres piezas con fronteras claras:

| Pieza | Responsabilidad | No sabe |
|---|---|---|
| `extension/` | Extraer el artículo de la pestaña activa y enviarlo | Nada de lectura ni de base de datos |
| `app/` | API, web app de lectura, PWA. Fuente de verdad | Nada de cómo se capturó la página |
| Neon Postgres | Persistencia | — |

El único contrato entre extensión y servidor es `POST /api/items` con un JSON de
artículo. Esa frontera permite probar el extractor sin servidor y el servidor
sin extensión.

### Stack

- Next.js (App Router) con TypeScript, desplegado en Vercel.
- Neon Postgres, provisionado desde el Marketplace de Vercel.
- Drizzle para esquema y migraciones.
- `@mozilla/readability` para la extracción, en la extensión.
- `isomorphic-dompurify` para el saneado, en el servidor.
- Vitest para pruebas unitarias y de API, Playwright para las de navegador.

### Por qué la extracción va en la extensión

La extensión ve el DOM ya renderizado y con tu sesión: funciona con sitios que
cargan por JavaScript, con contenido tras login y con muros de pago a los que
estás suscrito. Un extractor en el servidor, que solo puede volver a descargar
la URL, falla en todos esos casos. Como guardar desde la extensión es el único
camino de entrada de la v1, no hay motivo para aceptar esa pérdida.

Se descartó también un diseño local-first (IndexedDB como fuente de verdad y
sincronización bidireccional): da un offline mejor, pero la resolución de
conflictos sería la parte más difícil del proyecto para un usuario con dos
dispositivos y un modelo de datos que casi no se edita.

## Modelo de datos

Una sola tabla de contenido. No hay tabla de usuarios: el usuario es uno y se
autentica contra un secreto de configuración. La única tabla auxiliar es
`login_attempts` (`ip`, `attempted_at`), que sostiene el límite de intentos de
login descrito más abajo.

`items`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `url` | text, único | URL canónica; base de la detección de duplicados |
| `title` | text | |
| `byline` | text, nulo | Autor |
| `site_name` | text, nulo | |
| `lang` | text, nulo | |
| `excerpt` | text, nulo | |
| `content_html` | text | Ya saneado, con imágenes reescritas al proxy |
| `content_text` | text | Texto plano, para búsqueda |
| `word_count` | integer | Para el tiempo estimado de lectura |
| `published_at` | timestamptz, nulo | |
| `saved_at` | timestamptz | |
| `archived_at` | timestamptz, nulo | Nulo = pendiente |
| `scroll_pct` | real | Posición de lectura, 0–1 |
| `updated_at` | timestamptz | Base del último-escribe-gana |

Índices: único en `url`; `archived_at, saved_at desc` para las listas; GIN sobre
una columna `tsvector` generada de `title || ' ' || content_text`.

La búsqueda usa la configuración `simple` de Postgres, no `spanish` ni
`english`. Se guardarán artículos en ambos idiomas y elegir uno degrada el otro.
Coste asumido: no reduce plurales ni conjugaciones; busca las palabras tal cual.

"Archivar" es escribir una fecha en `archived_at`, nunca borrar. `DELETE` borra
de verdad y es una acción distinta, explícita en la interfaz.

## API

| Ruta | Método | Auth | Descripción |
|---|---|---|---|
| `/api/items` | POST | Token | Crear artículo (extensión) |
| `/api/items` | GET | Cookie | Lista paginada. `state=pendientes\|archivo`, `q=` |
| `/api/items/:id` | GET | Cookie | Artículo completo |
| `/api/items/:id` | PATCH | Cookie | `archived`, `scrollPct` |
| `/api/items/:id` | DELETE | Cookie | Borrado real |
| `/api/auth/login` | POST | — | Contraseña a cambio de cookie |
| `/api/auth/logout` | POST | Cookie | |
| `/api/img` | GET | Firma | Proxy de imágenes: `url`, `sig` |

`POST /api/items` acepta `{url, title, byline, siteName, lang, excerpt, html,
text, publishedTime}`. Limita el cuerpo a 5 MB. Responde `201` con el `id`, o
`200` con el `id` existente si la URL ya estaba guardada.

`PATCH` es la vía de las acciones offline y debe ser idempotente: reenviar el
mismo cambio no produce un resultado distinto.

### Autenticación: dos caminos a propósito

La web app usa una cookie de sesión firmada con HMAC (`httpOnly`, `Secure`,
`SameSite=Lax`, 180 días), obtenida enviando la contraseña. La extensión usa un
token propio de larga duración en la cabecera `Authorization: Bearer`, guardado
en `chrome.storage.local`.

Son caminos separados porque una petición desde `chrome-extension://` es
cross-site y `SameSite=Lax` no enviaría la cookie en un POST; y porque revocar
el token de la extensión no debe echarte de la app en el móvil. El token se
guarda en el almacén local de la extensión y no en el sincronizado, para no
pasear un secreto por la cuenta de Google.

Ambos secretos (contraseña y token) viven en variables de entorno de Vercel y se
comparan en tiempo constante. El login limita intentos por IP con un contador en
la base de datos; un límite en memoria sería decorativo en un entorno donde no
hay proceso persistente.

### Proxy de imágenes

Las imágenes de los artículos viven en servidores ajenos y un navegador no las
puede cachear de forma fiable para leer sin red. Servirlas por el propio dominio
las convierte en recursos cacheables como cualquier otro.

Reglas: solo URLs firmadas con HMAC por el servidor al construir el HTML del
artículo (si no, sería un proxy abierto); solo `http` y `https`; se rechazan
direcciones de red privada, loopback y enlace-local (SSRF); la respuesta debe
tener un `Content-Type` de imagen; hay límite de tamaño y de tiempo. Se responde
con cabeceras de caché inmutable.

Si el servidor de origen desaparece, la imagen se pierde. Se acepta: copiar cada
imagen a un almacén propio costaría dinero y mantenimiento.

## Extensión de Chrome

Manifest V3. Permisos: `activeTab`, `scripting`, `storage`, y permiso de host
solo para el dominio de la app.

Flujo al pulsar el botón (o el atajo de teclado):

1. El service worker de la extensión inyecta el script de extracción en la
   pestaña activa.
2. El script clona el documento (Readability muta el DOM, así que nunca se le
   pasa el original), lo pasa por Readability y lee las etiquetas `<meta>`
   (`og:`, `article:`) para autor, fecha y nombre del sitio, y
   `<link rel="canonical">` para la URL de deduplicación.
3. El service worker envía el resultado a `POST /api/items` con el token.
4. El badge del botón responde: check verde dos segundos, o aviso rojo con el
   motivo si falló.

Una página de opciones guarda la dirección del servidor y el token.

Cuando Readability no extrae nada coherente — portadas, aplicaciones web, PDFs —
el artículo **se guarda igual** con título y URL, y la app lo muestra como "no
se pudo extraer el texto" con enlace al original. Esa condición se deriva de
`word_count` por debajo de un umbral; no hace falta una columna para ello.
Perder un guardado en silencio es la forma más rápida de dejar de confiar en la
herramienta.

## App de lectura

Pantallas: pendientes (`/`), archivo (`/archivo`), búsqueda (`/buscar`), lector
(`/a/:id`), ajustes (`/ajustes`), login (`/login`).

La lista muestra una tarjeta por artículo con título, sitio y tiempo estimado de
lectura; se archiva con un botón, y con gesto lateral en el móvil.

El lector es una columna estrecha con tipografía cuidada. Controles de tamaño de
letra, ancho de columna y tema (claro, oscuro, sepia), guardados por dispositivo
en `localStorage`. La posición de lectura se guarda en el servidor con
antirrebote y al salir, para poder dejar un artículo a medias en el móvil y
seguir en el escritorio.

### Offline

Tres mecanismos distintos, con propósitos distintos:

1. **Armazón de la app** (código, estilos, tipografías): precache al instalar,
   estrategia cache-first. Abrir la app sin red funciona siempre.
2. **Artículos**: mientras hay red, un sincronizador descarga en segundo plano
   el contenido de los pendientes más recientes — 30 por defecto — y sus
   imágenes a través del proxy, a una caché con nombre propio. Presupuesto de
   unos 150 MB, expulsando primero lo ya archivado. Esto es lo que convierte el
   offline en una cola de lectura real y no en una lista de títulos inútil.
3. **Acciones sin red**: cola en IndexedDB. Archivar offline actualiza el estado
   local al instante y envía el `PATCH` al recuperar conexión. Ante conflicto
   gana la modificación más reciente comparando `updated_at`.

Estando sin red, la app lo indica de forma discreta, para que no desconcierte no
encontrar algo guardado hace un minuto desde el escritorio.

## Seguridad

El HTML que llega de la extensión lo escribió un tercero, así que no se confía
en él por venir de la propia extensión. El servidor lo sanea con lista blanca
estricta antes de guardarlo:

- Fuera: `script`, `iframe`, `object`, `embed`, `form`, `style`, atributos de
  evento, `javascript:`.
- Dentro: párrafos, encabezados, listas, citas, `pre`/`code`, tablas, figuras,
  énfasis, enlaces (con `rel="noopener noreferrer"`) e imágenes.
- Las `src` de imagen se reescriben al proxy firmado en ese mismo paso.

Se guarda ya saneado, no se sanea al servir: así el contenido almacenado es
seguro por construcción y no depende de que ninguna ruta de lectura recuerde
hacerlo.

## Fallos previstos

| Situación | Comportamiento |
|---|---|
| URL ya guardada | No se duplica. Si estaba archivada, vuelve a pendientes |
| Extracción vacía | Se guarda con enlace al original y aviso en el lector |
| Sin red al guardar | Badge rojo; se vuelve a pulsar. No hay cola en la extensión |
| Base de datos caída | Error explícito en el badge, nunca un check verde falso |
| Imagen que no carga | Hueco discreto; el texto del artículo no se ve afectado |

No se monta cola de reintentos en la extensión: es infraestructura para un caso
raro cuyo reintento cuesta un clic.

## Pruebas

- **Extracción y saneado**: páginas HTML reales guardadas en el repo como
  fixtures (un blog sencillo, un periódico con publicidad, un sitio que carga
  por JavaScript). Se comprueba que salen título y autor, que no sobrevive
  ningún `<script>`, y que las imágenes apuntan al proxy.
- **API**: contra un Postgres real, no simulado. Crear, duplicar, archivar,
  buscar, y que `PATCH` sea idempotente.
- **Proxy de imágenes**: firma inválida rechazada; direcciones privadas
  rechazadas; contenido que no es imagen rechazado.
- **Navegador (Playwright)**: flujo completo guardar → leer → archivar → buscar,
  más un tramo con la red cortada que verifica que un artículo sincronizado se
  abre y que archivar offline se sincroniza al volver.

Excepción declarada: **que el botón de la extensión funcione en Chrome de verdad
se verifica a mano**, cargándola sin empaquetar. Automatizarlo es un montaje
frágil que no se paga en un proyecto personal. El módulo de extracción, que es
donde está la lógica, sí queda cubierto por pruebas unitarias.

## Orden de construcción

Cada fase deja algo utilizable, en vez de todo a medias:

1. Esquema, API y app de lectura en local. Se guarda con `curl`.
2. Contraseña y despliegue en Vercel. Ya se lee en el móvil.
3. Extensión de Chrome. Ya se guarda como en Pocket.
4. Búsqueda y ajustes de lectura.
5. PWA y offline.
