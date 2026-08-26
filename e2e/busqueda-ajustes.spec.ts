import { expect, test } from '@playwright/test';

const PALABRA = 'higrometro';
let TITULO = '';

test.beforeEach(async ({ request, page }, info) => {
  TITULO = `Medir la humedad del horno ${info.testId}`;
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/busqueda-${info.testId}`,
      title: TITULO,
      siteName: 'Cocina Lenta',
      html: `<p>Para controlar la fermentacion conviene un ${PALABRA} barato. ${'texto de relleno '.repeat(60)}</p>`,
    },
  });
  expect(respuesta.status()).toBe(201);

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('por leer')).toBeVisible();
});

test('buscar por una palabra del cuerpo y abrir el resultado', async ({ page }) => {
  await page.getByRole('link', { name: 'Buscar' }).click();
  await page.getByLabel('Buscar en todo lo guardado').fill(PALABRA);
  await page.keyboard.press('Enter');

  await expect(page.locator('mark').first()).toContainText(PALABRA);
  await page.getByRole('link', { name: TITULO }).first().click();
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
});

test('los ajustes de lectura se aplican y sobreviven a una recarga', async ({ page }) => {
  await page.getByRole('link', { name: TITULO }).first().click();

  await page.getByRole('button', { name: 'Ajustes de lectura' }).click();
  await page.getByRole('button', { name: 'Sepia' }).click();
  await page.getByRole('button', { name: 'Ancho', exact: true }).click();

  await expect(page.locator('html')).toHaveAttribute('data-tema', 'sepia');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'sepia');
  await expect(page.locator('html')).toHaveAttribute('data-ancho', 'ancho');
});
