import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

test('el diagnóstico informa del estado real del dispositivo', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();

  /*
   * Se llega pulsando, no escribiendo la dirección: en una app instalada no hay
   * barra donde escribirla, y su almacenamiento en iOS está separado del de
   * Safari, así que mirarlo desde el navegador no dice nada de la app.
   */
  await page.getByRole('link', { name: 'Diagnóstico' }).click();
  await expect(page.getByRole('heading', { name: 'Diagnóstico' })).toBeVisible();

  for (const fila of ['Área segura superior', 'Alto del velo', 'Cachés', 'Modo de pantalla']) {
    await expect(page.getByRole('rowheader', { name: fila })).toBeVisible();
  }

  await expect(page.getByRole('button', { name: 'Borrar caché y recargar' })).toBeVisible();
});
