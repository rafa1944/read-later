import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

test('el diagnóstico informa del estado real del dispositivo', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();

  await page.goto('/diagnostico');
  await expect(page.getByRole('heading', { name: 'Diagnóstico' })).toBeVisible();

  for (const fila of ['Área segura superior', 'Alto del velo', 'Cachés', 'Modo de pantalla']) {
    await expect(page.getByRole('rowheader', { name: fila })).toBeVisible();
  }

  await expect(page.getByRole('button', { name: 'Borrar caché y recargar' })).toBeVisible();
});
