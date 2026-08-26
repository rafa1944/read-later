import { expect, test } from '@playwright/test';

// Título único por test: los ficheros comparten base de datos y dos artículos
// con el mismo título harían ambiguas las aserciones.
let TITULO = '';

test.beforeEach(async ({ request }, info) => {
  TITULO = `Artículo de prueba ${info.testId}`;
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/e2e-${info.testId}`,
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
  await expect(page.getByText('por leer')).toBeVisible();
  await page.getByRole('link', { name: TITULO }).first().click();

  // El lector muestra el cuerpo.
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
  await expect(page.locator('.cuerpo')).toContainText('palabra');

  // Archivar desde el lector.
  await page.locator('.pie').getByRole('button', { name: 'Archivar' }).click();

  // Ya no está en pendientes, sí en el archivo.
  await page.goto('/');
  await expect(page.getByRole('link', { name: TITULO })).toHaveCount(0);
  await page.goto('/archivo');
  await expect(page.getByRole('link', { name: TITULO }).first()).toBeVisible();
});

test('una contraseña incorrecta no deja entrar', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill('esto-no-es');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Contraseña incorrecta')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
