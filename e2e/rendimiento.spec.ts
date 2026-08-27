import { expect, test } from '@playwright/test';

/**
 * El service worker pinta la copia guardada al instante. El riesgo de eso es
 * enseñar una lista vieja como si fuera buena, así que se comprueba que los
 * datos frescos llegan solos, sin que nadie recargue a mano.
 */
test('lo servido desde caché se corrige solo con los datos frescos', async ({
  page,
  request,
}, info) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();

  // Primera visita: deja la página en la caché del service worker.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();

  // Aparece algo nuevo mientras la copia guardada ya está obsoleta.
  const titulo = `Aparecido después de cachear ${info.testId}`;
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/swr-${info.testId}`,
      title: titulo,
      html: `<p>${'contenido '.repeat(200)}</p>`,
    },
  });
  expect(respuesta.status()).toBe(201);

  // Se abre de nuevo: puede pintarse de la caché, pero tiene que corregirse.
  await page.goto('/');
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
});

/**
 * El aviso de 'servido de caché' se emite mientras el navegador atiende la
 * navegación, cuando la página nueva todavía no es cliente del service worker:
 * lo recibe la que se abandona. Sin pedir los datos frescos al montar, una
 * recarga después de cambiar algo se queda con la copia vieja para siempre.
 */
test('una recarga tras un cambio no se queda con la copia guardada', async ({
  page,
  request,
}, info) => {
  const titulo = `Recargado ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/recarga-${info.testId}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(200)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Se deja la lista en la caché del service worker antes de tocar nada.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.goto('/');

  const fila = page.locator('.fila', { hasText: titulo });
  const guardado = page.waitForResponse(
    (r) => r.url().includes('/api/items/') && r.request().method() === 'PATCH',
  );
  await fila.getByRole('button', { name: 'Marcar como favorito' }).click();
  expect((await guardado).ok()).toBe(true);

  await page.reload();
  await expect(fila.locator('.estrella')).toHaveAttribute('aria-pressed', 'true');
});

test('el aviso de sin conexión no salta por servir desde caché estando en línea', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.goto('/');
  await page.goto('/');
  await page.waitForTimeout(1200);

  await expect(page.getByText('Sin conexión')).toHaveCount(0);
});
