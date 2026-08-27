import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

test('el velo superior cubre el contenido pero no captura los toques', async ({
  page,
  request,
}, info) => {
  const titulo = `Velo ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/velo-${info.testId}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(600)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: titulo }).click();
  await expect(page.locator('.cuerpo')).toBeVisible();

  const velo = await page.evaluate(() => {
    const e = getComputedStyle(document.body, '::before');
    return {
      existe: e.content !== 'none',
      posicion: e.position,
      toques: e.pointerEvents,
      capa: Number(e.zIndex),
      fondo: e.backgroundImage,
      alto: Number.parseFloat(e.height),
    };
  });

  /*
   * En Safari como navegador env(safe-area-inset-top) vale 0, y el contenido
   * pasa igualmente bajo el reloj al desplazarse. Atado solo al área segura, el
   * velo se quedaba en 44 px con 8 opacos y el texto se leía detrás de la hora.
   * La barra de estado de un iPhone ronda los 44-54 px: el velo tiene que
   * cubrirla con holgura por sí mismo.
   */
  expect(velo.alto, 'alto del velo sin área segura').toBeGreaterThanOrEqual(76);

  expect(velo.existe).toBe(true);
  expect(velo.posicion).toBe('fixed');
  // Si capturara toques se comería el enlace de volver, que está justo debajo.
  expect(velo.toques).toBe('none');
  expect(velo.fondo).toContain('gradient');

  /*
   * El velo tiene que ser SÓLIDO durante toda el área segura y desvanecerse
   * solo por debajo. Repartir el degradado por toda la banda lo dejaba casi
   * transparente justo a la altura del reloj, que fue el primer intento.
   *
   * Se comprueba que el color de fondo aparece dos veces —inicio y final del
   * tramo opaco— antes de la parada transparente.
   */
  const fondoSolido = velo.fondo.match(/rgb\((?!0, 0, 0\))[^)]+\)/g) ?? [];
  expect(fondoSolido.length, `paradas del degradado: ${velo.fondo}`).toBeGreaterThanOrEqual(2);
  expect(velo.fondo.indexOf('rgba(0, 0, 0, 0)')).toBeGreaterThan(
    velo.fondo.indexOf(fondoSolido[fondoSolido.length - 1]),
  );

  // La comprobación que de verdad importa: el enlace sigue siendo pulsable.
  await page.getByRole('link', { name: '← Pendientes' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('el velo queda por debajo de los controles flotantes', async ({ page, request }, info) => {
  const titulo = `Capas ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/capas-${info.testId}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(600)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: titulo }).click();
  await expect(page.locator('.cuerpo')).toBeVisible();
  await expect(page.locator('.rail')).toBeAttached();
  await expect(page.locator('.tiron')).toBeAttached();

  const capas = await page.evaluate(() => ({
    velo: Number(getComputedStyle(document.body, '::before').zIndex),
    espina: Number(getComputedStyle(document.querySelector('.rail')!).zIndex),
    tiron: Number(getComputedStyle(document.querySelector('.tiron')!).zIndex),
    ajustes: Number(getComputedStyle(document.querySelector('.ajustes')!).zIndex),
  }));

  // La espina de progreso llega hasta arriba: si el velo la tapara, se perdería
  // justo el principio de la barra.
  expect(capas.espina).toBeGreaterThan(capas.velo);
  expect(capas.tiron).toBeGreaterThan(capas.velo);
  expect(capas.ajustes).toBeGreaterThan(capas.velo);
});

test('la franja opaca cubre una barra de estado real', async ({ page, request }, info) => {
  const titulo = `Franja ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/franja-${info.testId}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(300)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();

  const solido = await page.evaluate(() => {
    const sonda = document.createElement('div');
    sonda.style.cssText = 'position:fixed;top:0;height:var(--velo-solido)';
    document.body.appendChild(sonda);
    const alto = sonda.getBoundingClientRect().height;
    sonda.remove();
    return alto;
  });

  /*
   * La barra de estado de un iPhone con isla dinámica ronda los 60 px, y el
   * contenido pasa por debajo tanto en Safari como en la app instalada. En
   * ambos casos env(safe-area-inset-top) devuelve 0, así que la franja no puede
   * depender de él: tiene que taparla por sí sola.
   */
  expect(solido, 'franja opaca sin área segura declarada').toBeGreaterThanOrEqual(56);
});
