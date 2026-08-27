import { expect, test, type Page } from '@playwright/test';

async function guardar(request: Page['request'], titulo: string, url: string) {
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: { url, title: titulo, html: `<p>${'palabra '.repeat(250)}</p>` },
  });
  expect(respuesta.status()).toBe(201);
}

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();
}

test('marcar un favorito y filtrar por él', async ({ page, request }, info) => {
  const favorito = `Favorito ${info.testId}`;
  const otro = `Corriente ${info.testId}`;
  await guardar(request, favorito, `https://ejemplo.com/fav-${info.testId}`);
  await guardar(request, otro, `https://ejemplo.com/otro-${info.testId}`);

  await entrar(page);

  const fila = page.locator('.fila', { hasText: favorito });
  await fila.getByRole('button', { name: 'Marcar como favorito' }).click();
  await expect(fila.getByRole('button', { name: 'Quitar de favoritos' })).toBeVisible();

  await page.getByRole('link', { name: 'Mostrar solo favoritos' }).click();
  await expect(page.getByRole('link', { name: favorito })).toBeVisible();
  await expect(page.getByRole('link', { name: otro })).toHaveCount(0);

  // El filtro va en la dirección, así que sobrevive a una recarga.
  await page.reload();
  await expect(page.getByRole('link', { name: favorito })).toBeVisible();
  await expect(page.getByRole('link', { name: otro })).toHaveCount(0);

  await page.getByRole('link', { name: 'Mostrar todos' }).click();
  await expect(page.getByRole('link', { name: otro })).toBeVisible();
});

test('un favorito archivado se encuentra en el archivo', async ({ page, request }, info) => {
  const titulo = `Favorito leído ${info.testId}`;
  await guardar(request, titulo, `https://ejemplo.com/favarch-${info.testId}`);

  await entrar(page);

  const fila = page.locator('.fila', { hasText: titulo });

  /*
   * La estrella se pinta al instante, antes de que responda el servidor, así
   * que verla encendida no demuestra que el favorito esté guardado. Se espera
   * a la respuesta o el archivado siguiente puede adelantarla.
   */
  const guardado = page.waitForResponse(
    (r) => r.url().includes('/api/items/') && r.request().method() === 'PATCH',
  );
  await fila.getByRole('button', { name: 'Marcar como favorito' }).click();
  expect((await guardado).ok()).toBe(true);

  await fila.getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  await page.getByRole('link', { name: 'Archivo' }).click();
  await page.getByRole('link', { name: 'Mostrar solo favoritos' }).click();
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
});

test('quitar la estrella lo saca del filtro', async ({ page, request }, info) => {
  const titulo = `Deja de gustarme ${info.testId}`;
  await guardar(request, titulo, `https://ejemplo.com/desfav-${info.testId}`);

  await entrar(page);

  const fila = page.locator('.fila', { hasText: titulo });
  await fila.getByRole('button', { name: 'Marcar como favorito' }).click();
  await expect(fila.getByRole('button', { name: 'Quitar de favoritos' })).toBeVisible();

  await page.getByRole('link', { name: 'Mostrar solo favoritos' }).click();
  const enFiltro = page.locator('.fila', { hasText: titulo });
  await enFiltro.getByRole('button', { name: 'Quitar de favoritos' }).click();

  // Al dejar de ser favorito desaparece de la lista filtrada, y esa es la
  // señal de que el servidor lo registró: recargar antes sería una carrera.
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);
  // Seguimos en la vista filtrada; no se comprueba que esté vacía porque los
  // ficheros de prueba comparten base de datos y dejan sus propios favoritos.
  await expect(page.getByText('· favoritos')).toBeVisible();
});
