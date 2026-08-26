import { expect, test } from '@playwright/test';

test('un artículo guardado desde otro dispositivo aparece al volver a la app', async ({
  page,
  request,
}, info) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();

  const titulo = `Guardado desde fuera ${info.testId}`;
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  // Simula el guardado desde la extensión en otro dispositivo: la pestaña
  // abierta no se entera de nada.
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/fuera-${info.testId}`,
      title: titulo,
      html: `<p>${'contenido '.repeat(200)}</p>`,
    },
  });
  expect(respuesta.status()).toBe(201);

  // Sigue sin verse: nadie le ha dicho a la lista que hay algo nuevo.
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  // Volver a traer la app al primer plano.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  // Y ahora aparece, sin recargar a mano.
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
});

test('no refresca cuando no hay conexión', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();

  await context.setOffline(true);

  // Se deja que las precargas de enlaces de Next terminen antes de empezar a
  // contar; si no, se confundirían con el refresco que estamos midiendo.
  await page.waitForTimeout(1500);

  const peticiones: string[] = [];
  page.on('request', (peticion) => peticiones.push(peticion.url()));

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1500);

  // Sin red no se intenta siquiera: ni una petición al servidor.
  expect(peticiones).toEqual([]);
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();
  await context.setOffline(false);
});
