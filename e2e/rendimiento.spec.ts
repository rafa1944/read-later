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
