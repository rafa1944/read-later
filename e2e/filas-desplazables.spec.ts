import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

/**
 * En iOS, una caja con overflow:hidden actúa como contenedor de desplazamiento
 * y se traga el gesto en vez de encadenarlo a la página: el dedo sobre una fila
 * no desplaza la lista. Este test fija que las filas nunca recorten así.
 */
test('las filas no crean un contenedor de desplazamiento', async ({ page, request }, info) => {
  for (let i = 0; i < 4; i += 1) {
    await request.post('/api/items', {
      headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
      data: {
        url: `https://ejemplo.com/contenedor-${info.testId}-${i}`,
        title: `Relleno ${info.testId} ${i}`,
        html: `<p>${'palabra '.repeat(250)}</p>`,
      },
    });
  }

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('por leer')).toBeVisible();

  const desbordes = await page.evaluate(() =>
    [...document.querySelectorAll('.deslizable, .deslizante')].map((el) => {
      const estilo = getComputedStyle(el);
      return { clase: el.className, x: estilo.overflowX, y: estilo.overflowY };
    }),
  );

  expect(desbordes.length).toBeGreaterThan(0);
  for (const caja of desbordes) {
    expect(caja.y, `overflow-y de ${caja.clase}`).toBe('visible');
    expect(caja.x, `overflow-x de ${caja.clase}`).toBe('visible');
  }
});

test('la acción del gesto no asoma cuando la fila está en reposo', async ({ page, request }, info) => {
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/reposo-${info.testId}`,
      title: `Reposo ${info.testId}`,
      html: `<p>${'palabra '.repeat(250)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('por leer')).toBeVisible();

  // Sin recortar hay que ocultarla de otro modo, o se ve «Archivar» siempre.
  const opacidad = await page
    .locator('.accion-gesto')
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacidad)).toBe(0);
});
