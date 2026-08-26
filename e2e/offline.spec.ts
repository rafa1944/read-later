import { expect, test, type Page } from '@playwright/test';

let TITULO = '';

/** El sincronizador avisa al terminar; sin esperarlo, no hay nada en caché. */
async function esperarSincronizacion(page: Page) {
  const resumen = await page.evaluate(
    () =>
      new Promise<{ paginas: string[] }>((resolver, rechazar) => {
        window.addEventListener(
          'read-later:sincronizado',
          (evento) => resolver((evento as CustomEvent).detail),
          { once: true },
        );
        setTimeout(() => rechazar(new Error('la sincronización no terminó a tiempo')), 20000);
      }),
  );
  return resumen;
}

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

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
});

test('los artículos sincronizados se leen sin conexión, con su texto', async ({
  page,
  context,
}) => {
  // Su propio artículo, no «el primero»: los ficheros comparten base de datos.
  const enlace = page.getByRole('link', { name: TITULO }).first();
  const ruta = await enlace.getAttribute('href');
  expect(ruta).toBeTruthy();

  const { paginas } = await esperarSincronizacion(page);
  expect(paginas, 'el sincronizador debería haber guardado este artículo').toContain(ruta);

  await context.setOffline(true);
  await page.goto(ruta!);

  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
  await expect(page.locator('.cuerpo')).toContainText('contenido legible');
  await context.setOffline(false);
});

test('la lista se abre sin conexión y avisa de que no hay red', async ({ page, context }) => {
  await esperarSincronizacion(page);

  await context.setOffline(true);
  await page.goto('/');

  await expect(page.getByRole('link', { name: TITULO }).first()).toBeVisible();
  await expect(page.getByText('Sin conexión')).toBeVisible();
  await context.setOffline(false);
});

test('archivar sin conexión se anuncia y se envía al volver la red', async ({ page, context }) => {
  await esperarSincronizacion(page);

  await context.setOffline(true);
  await page.goto('/');

  const fila = page.locator('.fila', { hasText: TITULO });
  await fila.getByRole('button', { name: 'Archivar' }).click();
  await expect(fila.getByText('Se enviará al recuperar la conexión')).toBeVisible();

  await context.setOffline(false);
  await page.goto('/archivo');
  await expect(page.getByRole('link', { name: TITULO }).first()).toBeVisible();
});
