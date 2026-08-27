import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

async function abrirArticulo(page: Page, request: Page['request'], id: string) {
  const titulo = `Recorte ${id}`;
  const alta = await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/recorte-${id}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(600)}</p>`,
    },
  });
  expect(alta.status()).toBe(201);

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: titulo }).first().click();
  await expect(page.locator('.cuerpo')).toBeVisible();
  return titulo;
}

/*
 * El texto no se tapa con una banda: se recorta. Taparlo no funcionaba porque
 * en iOS el contenido que se desplaza y los elementos fijos no comparten
 * origen, así que la banda caía siempre por debajo del reloj.
 */
test('el contenido vive dentro de un contenedor que lo recorta', async ({
  page,
  request,
}, info) => {
  await abrirArticulo(page, request, info.testId);

  const marco = await page.evaluate(() => {
    const el = document.getElementById('marco');
    if (!el) return null;
    const e = getComputedStyle(el);
    return { posicion: e.position, desborde: e.overflowY, arriba: el.getBoundingClientRect().top };
  });

  expect(marco, 'debe existir el contenedor').not.toBeNull();
  expect(marco!.posicion).toBe('fixed');
  expect(marco!.desborde).toBe('auto');
});

test('nada del contenido se pinta por encima del borde del contenedor', async ({
  page,
  request,
}, info) => {
  await abrirArticulo(page, request, info.testId);

  const fuera = await page.evaluate(() => {
    const marco = document.getElementById('marco')!;

    /*
     * Se separa el contenedor del borde para poder mirar por encima de él. En
     * el navegador el área segura vale 0 y no habría hueco que comprobar; en el
     * iPhone ese hueco es justo donde está el reloj.
     */
    marco.style.top = '60px';
    marco.scrollTop = 400;

    const centro = window.innerWidth / 2;
    const arriba = document.elementFromPoint(centro, 30);
    const dentro = document.elementFromPoint(centro, 90);
    const resultado = {
      encima: arriba ? marco.contains(arriba) : false,
      debajo: dentro ? marco.contains(dentro) : false,
      desplazado: marco.scrollTop,
    };

    marco.style.removeProperty('top');
    return resultado;
  });

  expect(fuera.desplazado, 'el contenedor se desplaza').toBeGreaterThan(0);
  expect(fuera.debajo, 'dentro del contenedor sí hay contenido').toBe(true);
  expect(fuera.encima, 'por encima del borde no se pinta nada del contenido').toBe(false);
});

test('el documento ya no se desplaza: lo hace el contenedor', async ({ page, request }, info) => {
  await abrirArticulo(page, request, info.testId);

  const desbordes = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).overflowY,
    body: getComputedStyle(document.body).overflowY,
  }));

  // Si el documento pudiera desplazarse, el texto volvería a salirse por arriba.
  expect(desbordes.html).toBe('hidden');
  expect(desbordes.body).toBe('hidden');
});

test('se pide la pantalla completa y la barra translúcida', async ({ page }) => {
  await page.goto('/login');

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  const barra = await page
    .locator('meta[name="apple-mobile-web-app-status-bar-style"]')
    .getAttribute('content');

  expect(viewport, 'viewport declarado').toContain('viewport-fit=cover');
  expect(barra, 'estilo de la barra de estado').toBe('black-translucent');
});

test('los controles flotantes siguen por encima del contenido', async ({ page, request }, info) => {
  await abrirArticulo(page, request, info.testId);

  const capas = await page.evaluate(() => ({
    marco: Number(getComputedStyle(document.getElementById('marco')!).zIndex) || 0,
    espina: Number(getComputedStyle(document.querySelector('.rail')!).zIndex),
    ajustes: Number(getComputedStyle(document.querySelector('.ajustes')!).zIndex),
  }));

  expect(capas.espina).toBeGreaterThan(capas.marco);
  expect(capas.ajustes).toBeGreaterThan(capas.marco);
});
