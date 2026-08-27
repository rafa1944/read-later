import { expect, test } from '@playwright/test';

/**
 * Las pestañas se guardan en la caché de cliente para que el cambio sea
 * instantáneo. El riesgo es enseñar una lista vieja después de actuar, así que
 * se comprueba navegando como lo hace una persona: pulsando los enlaces, no
 * recargando la página.
 */
test('archivar y cambiar de pestaña muestra el estado nuevo, no el cacheado', async ({
  page,
  request,
}, info) => {
  const titulo = `Archivar y navegar ${info.testId}`;
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/nav-cache-${info.testId}`,
      title: titulo,
      html: `<p>${'contenido '.repeat(200)}</p>`,
    },
  });
  expect(respuesta.status()).toBe(201);

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();

  // Se visita el archivo primero, para que quede una copia en caché sin el
  // artículo. Es la trampa que este test tiende.
  await page.getByRole('link', { name: 'Archivo' }).click();
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);
  await page.getByRole('link', { name: 'Pendientes' }).click();

  const fila = page.locator('.fila', { hasText: titulo });
  await fila.getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  // Y ahora el archivo tiene que estar al día pese a la copia guardada.
  await page.getByRole('link', { name: 'Archivo' }).click();
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();

  // Y pendientes tampoco puede resucitarlo.
  await page.getByRole('link', { name: 'Pendientes' }).click();
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);
});
