import { expect, test } from '@playwright/test';

test('el listado alterna entre solo títulos y títulos con resumen', async ({
  page,
  request,
}, info) => {
  const titulo = `Con resumen ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/densidad-${info.testId}`,
      title: titulo,
      siteName: 'Notas',
      excerpt: 'Este extracto solo debe verse en el modo completo.',
      html: `<p>${'palabra '.repeat(250)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();

  const extracto = page.getByText('Este extracto solo debe verse en el modo completo.');
  await expect(extracto).toBeVisible();

  await page.getByRole('button', { name: 'Mostrar solo los títulos' }).click();
  await expect(extracto).toBeHidden();
  // El título tiene que seguir ahí: compacto no es esconder la lista.
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
  await expect(extracto).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-densidad', 'compacta');

  await page.getByRole('button', { name: 'Mostrar también el resumen' }).click();
  await expect(extracto).toBeVisible();
});

test('la búsqueda conserva su fragmento aunque el listado esté compacto', async ({
  page,
  request,
}, info) => {
  const palabra = `sonambulo${info.testId.replace(/[^a-z0-9]/gi, '')}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/densidad-busqueda-${info.testId}`,
      title: `Buscable ${info.testId}`,
      excerpt: 'Extracto que el modo compacto oculta.',
      html: `<p>Una palabra rara: ${palabra}. ${'relleno '.repeat(200)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Mostrar solo los títulos' }).click();

  await page.getByRole('link', { name: 'Buscar' }).click();
  await page.getByLabel('Buscar en todo lo guardado').fill(palabra);
  await page.keyboard.press('Enter');

  // El fragmento es el motivo de buscar: compacto no debe tocarlo.
  await expect(page.locator('mark').first()).toContainText(palabra);
});

test('cambiar la tipografía afecta al cuerpo del artículo y persiste', async ({
  page,
  request,
}, info) => {
  const titulo = `Tipografía ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/tipo-${info.testId}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(400)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: titulo }).click();

  const cuerpo = page.locator('.cuerpo');
  const inicial = await cuerpo.evaluate((el) => getComputedStyle(el).fontFamily);

  await page.getByRole('button', { name: 'Ajustes de lectura' }).click();
  await page.getByRole('button', { name: 'Palo seco' }).click();

  const conPalo = await cuerpo.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(conPalo).not.toBe(inicial);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-letra', 'palo');
  expect(await cuerpo.evaluate((el) => getComputedStyle(el).fontFamily)).toBe(conPalo);

  await page.getByRole('button', { name: 'Ajustes de lectura' }).click();
  await page.getByRole('button', { name: 'Georgia' }).click();
  expect(await cuerpo.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Georgia');
});

test('la franja de la barra de estado sigue al tema elegido', async ({ page, request }, info) => {
  const titulo = `Barra ${info.testId}`;
  const alta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/barra-${info.testId}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(300)}</p>`,
    },
  });
  expect(alta.status()).toBe(201);

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();
  await page.getByRole('link', { name: titulo }).first().click();

  /** Todas las metas deben decir lo mismo: no se sabe cuál usará el sistema. */
  const colores = () =>
    page
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) => [...new Set(metas.map((m) => m.getAttribute('content')))].sort());

  await page.getByRole('button', { name: 'Ajustes de lectura' }).click();
  await page.getByRole('button', { name: 'Sepia' }).click();

  /*
   * iOS pinta con esto la franja del reloj. Si no siguiera al tema, en sepia se
   * vería un recuadro color papel encima de la app.
   */
  expect(await colores()).toEqual(['#efe6d5']);

  // Y sobrevive a la recarga, porque lo aplica también el guión del <head>.
  await page.reload();
  expect(await colores()).toEqual(['#efe6d5']);

  // Y a navegar, que es cuando Next reinserta las suyas.
  await page.getByRole('link', { name: '← Pendientes' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();
  expect(await colores()).toEqual(['#efe6d5']);

  // Volver en automático devuelve un color por esquema. Los ajustes viven en el
  // lector, así que hay que entrar otra vez en el artículo.
  await page.getByRole('link', { name: titulo }).first().click();
  await page.getByRole('button', { name: 'Ajustes de lectura' }).click();
  await page.getByRole('button', { name: 'Auto' }).click();
  expect(await colores()).toEqual(['#14171a', '#e9eae5']);
});
