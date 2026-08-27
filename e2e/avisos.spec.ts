import { expect, test, type Page } from '@playwright/test';

async function entrarConArticulo(page: Page, request: Page['request'], titulo: string, id: string) {
  const respuesta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: { url: `https://ejemplo.com/aviso-${id}`, title: titulo, html: `<p>${'palabra '.repeat(250)}</p>` },
  });
  expect(respuesta.status()).toBe(201);

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
}

test('archivar avisa de lo ocurrido y el aviso se va solo', async ({ page, request }, info) => {
  const titulo = `Con aviso ${info.testId}`;
  await entrarConArticulo(page, request, titulo, info.testId);

  await page.locator('.fila', { hasText: titulo }).getByRole('button', { name: 'Archivar' }).click();

  await expect(page.getByText('Artículo archivado')).toBeVisible();
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  // Se retira solo: un aviso que se queda es ruido.
  await expect(page.getByText('Artículo archivado')).toBeHidden({ timeout: 6000 });
});

test('devolver desde el archivo avisa con su propio texto', async ({ page, request }, info) => {
  const titulo = `Devuelto ${info.testId}`;
  await entrarConArticulo(page, request, titulo, info.testId);

  await page.locator('.fila', { hasText: titulo }).getByRole('button', { name: 'Archivar' }).click();
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  await page.getByRole('link', { name: 'Archivo' }).click();
  await page.locator('.fila', { hasText: titulo }).getByRole('button', { name: 'Devolver' }).click();

  await expect(page.getByText('Artículo devuelto a pendientes')).toBeVisible();
});

test('la fila encoge de verdad antes de desaparecer', async ({ page, request }, info) => {
  const titulo = `Animada ${info.testId}`;
  await entrarConArticulo(page, request, titulo, info.testId);

  const envoltura = page.locator('.fila-salida', { hasText: titulo });
  await expect(envoltura).not.toHaveClass(/saliendo/);

  // Se muestrea la altura desde dentro de la página: comprobar solo que se
  // aplica una clase no demuestra que la animación llegue a ejecutarse.
  const alturas = await envoltura.evaluate(async (el) => {
    const boton = [...el.querySelectorAll('button')].find((b) =>
      /archivar/i.test(b.textContent ?? ''),
    ) as HTMLButtonElement;

    const inicial = el.getBoundingClientRect().height;
    const medidas: number[] = [inicial];
    boton.click();
    // El encogimiento no arranca hasta que responde el servidor, así que se
    // muestrea hasta verlo, no un número fijo de fotogramas: con la máquina
    // cargada diez no bastaban y la prueba fallaba sin haber nada roto.
    for (let i = 0; i < 120; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 25)));
      if (!document.body.contains(el)) break;
      const alto = el.getBoundingClientRect().height;
      medidas.push(alto);
      if (alto < inicial * 0.6) break;
    }
    return medidas;
  });

  const inicial = alturas[0];
  const minima = Math.min(...alturas);
  expect(inicial).toBeGreaterThan(40);
  // Si la lista se rehiciera de golpe, la altura saltaría de su valor a nada
  // sin pasos intermedios y esto fallaría.
  expect(minima).toBeLessThan(inicial * 0.6);

  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);
});

test('en reposo la fila no recorta, para no tragarse el scroll en iOS', async ({
  page,
  request,
}, info) => {
  const titulo = `Sin recorte ${info.testId}`;
  await entrarConArticulo(page, request, titulo, info.testId);

  const desbordes = await page
    .locator('.fila-salida', { hasText: titulo })
    .evaluate((el) => [...el.children].map((h) => getComputedStyle(h).overflowY));

  expect(desbordes.every((o) => o === 'visible')).toBe(true);
});
