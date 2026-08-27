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

  // Solo suaviza el corte del texto: de la barra de estado se encarga iOS.
  expect(velo.alto, 'alto del velo').toBeGreaterThan(16);

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

test('se pide la pantalla completa y la barra translúcida', async ({ page }) => {
  await page.goto('/login');

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  const barra = await page
    .locator('meta[name="apple-mobile-web-app-status-bar-style"]')
    .getAttribute('content');

  /*
   * Las dos van juntas y son la única combinación que entrega la pantalla
   * completa a la web en una app instalada. Con 'default', iOS coloca los
   * elementos fijos tomando como origen el borde inferior de la barra de
   * estado, y la banda opaca no llega nunca hasta el reloj.
   */
  expect(viewport, 'viewport declarado').toContain('viewport-fit=cover');
  expect(barra, 'estilo de la barra de estado').toBe('black-translucent');
});

test('la banda opaca cubre la barra de estado', async ({ page }) => {
  await page.goto('/login');

  const solido = await page.evaluate(() => {
    const sonda = document.createElement('div');
    sonda.style.cssText = 'position:fixed;top:0;height:var(--velo-solido)';
    document.body.appendChild(sonda);
    const alto = sonda.getBoundingClientRect().height;
    sonda.remove();
    return alto;
  });

  // La barra de estado de un iPhone con isla dinámica ronda los 60 px, y donde
  // no hay área segura declarada la banda tiene que taparla por sí sola.
  expect(solido, 'banda opaca').toBeGreaterThanOrEqual(56);
});

test('la banda se sube el desfase medido del marco fijo', async ({ page }) => {
  await page.goto('/login');

  const posiciones = await page.evaluate(() => {
    const medir = () => {
      const e = getComputedStyle(document.body, '::before');
      return { arriba: e.top, alto: e.height };
    };

    const sinDesfase = medir();
    document.documentElement.style.setProperty('--desfase-fijo', '62px');
    const conDesfase = medir();
    document.documentElement.style.removeProperty('--desfase-fijo');
    return { sinDesfase, conDesfase };
  });

  expect(posiciones.sinDesfase.arriba).toBe('0px');

  /*
   * En la app instalada de iOS el contenido se pinta desde el borde de la
   * pantalla pero lo fijo empieza bajo la barra de estado. La banda sube ese
   * desfase para aterrizar en el borde; si no, se dibuja por debajo del reloj
   * y el texto se ve pasar por detrás de la hora.
   */
  expect(posiciones.conDesfase.arriba).toBe('-62px');

  // Y no crece con el desfase: si creciera, taparía la primera línea del texto.
  expect(posiciones.conDesfase.alto).toBe(posiciones.sinDesfase.alto);
});
