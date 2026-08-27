import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

/** Simula un dedo real: apoyar, arrastrar en varios pasos y soltar. */
async function arrastrar(
  objetivo: Locator,
  desde: { x: number; y: number },
  hasta: { x: number; y: number },
) {
  await objetivo.evaluate(
    async (destino, { desde, hasta }) => {
      const toque = (x: number, y: number) =>
        new Touch({ identifier: 1, target: destino, clientX: x, clientY: y });

      const lanzar = (tipo: string, x: number, y: number) => {
        const t = toque(x, y);
        destino.dispatchEvent(
          new TouchEvent(tipo, {
            touches: tipo === 'touchend' ? [] : [t],
            changedTouches: [t],
            bubbles: true,
            cancelable: true,
          }),
        );
      };

      lanzar('touchstart', desde.x, desde.y);
      for (let paso = 1; paso <= 8; paso += 1) {
        const x = desde.x + ((hasta.x - desde.x) * paso) / 8;
        const y = desde.y + ((hasta.y - desde.y) * paso) / 8;
        lanzar('touchmove', x, y);
        await new Promise((r) => setTimeout(r, 16));
      }
      lanzar('touchend', hasta.x, hasta.y);
    },
    { desde, hasta },
  );
}

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();
}

test('tirar hacia abajo recarga y trae lo guardado desde fuera', async ({ page, request }, info) => {
  await entrar(page);

  const titulo = `Tirón ${info.testId}`;
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/tiron-${info.testId}`,
      title: titulo,
      html: `<p>${'contenido '.repeat(200)}</p>`,
    },
  });
  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

  await arrastrar(page.locator('body'), { x: 195, y: 120 }, { x: 195, y: 420 });

  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
});

test('un arrastre corto no recarga', async ({ page, request }, info) => {
  await entrar(page);

  const titulo = `Corto ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/corto-${info.testId}`,
      title: titulo,
      html: `<p>${'contenido '.repeat(200)}</p>`,
    },
  });

  // Por debajo del umbral: el gesto se cancela y no pasa nada.
  await arrastrar(page.locator('body'), { x: 195, y: 120 }, { x: 195, y: 155 });
  await page.waitForTimeout(600);

  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);
});

test('deslizar una fila a la izquierda la archiva', async ({ page, request }, info) => {
  const titulo = `Deslizar ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/deslizar-${info.testId}`,
      title: titulo,
      html: `<p>${'contenido '.repeat(200)}</p>`,
    },
  });

  await entrar(page);
  const fila = page.locator('.deslizable', { hasText: titulo });
  await expect(fila).toBeVisible();

  const caja = (await fila.boundingBox())!;
  const y = caja.y + caja.height / 2;
  await arrastrar(
    fila.locator('.deslizante'),
    { x: caja.x + caja.width - 20, y },
    { x: caja.x + 20, y },
  );

  await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);
  await page.goto('/archivo');
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
});

test('un desplazamiento vertical sobre una fila no la archiva', async ({ page, request }, info) => {
  const titulo = `Vertical ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/vertical-${info.testId}`,
      title: titulo,
      html: `<p>${'contenido '.repeat(200)}</p>`,
    },
  });

  await entrar(page);
  const fila = page.locator('.deslizable', { hasText: titulo });
  const caja = (await fila.boundingBox())!;

  // Un dedo que baja, aunque se desvíe algo de lado, es desplazarse.
  await arrastrar(
    fila.locator('.deslizante'),
    { x: caja.x + caja.width / 2, y: caja.y + 10 },
    { x: caja.x + caja.width / 2 - 45, y: caja.y + 130 },
  );

  await page.waitForTimeout(600);
  await expect(page.getByRole('link', { name: titulo })).toBeVisible();
});

/** Extrae el desplazamiento horizontal de la matriz de transformación. */
const DESPLAZAMIENTO_EN_PAGINA = `(el) => {
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return m.m41;
}`;

test('al soltar, la fila vuelve con animación y no de golpe', async ({ page, request }, info) => {
  const titulo = `Vuelta ${info.testId}`;
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/vuelta-${info.testId}`,
      title: titulo,
      html: `<p>${'palabra '.repeat(250)}</p>`,
    },
  });

  await entrar(page);
  const deslizante = page.locator('.fila', { hasText: titulo }).locator('..');
  await expect(deslizante).toBeVisible();

  /*
   * El arrastre y el muestreo van dentro de la página: medir desde fuera
   * introduce latencia de protocolo y se perdería justo la parte interesante,
   * que son los primeros fotogramas tras soltar.
   */
  const traza = await deslizante.evaluate(async (el) => {
    const tx = () => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;

    const toque = (x: number, y: number) =>
      new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const lanzar = (tipo: string, x: number, y: number) => {
      const t = toque(x, y);
      el.dispatchEvent(
        new TouchEvent(tipo, {
          touches: tipo === 'touchend' ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        }),
      );
    };

    const caja = el.getBoundingClientRect();
    const y = caja.y + caja.height / 2;
    const desde = caja.x + caja.width - 20;

    lanzar('touchstart', desde, y);
    for (let paso = 1; paso <= 8; paso += 1) {
      lanzar('touchmove', desde - (110 * paso) / 8, y);
      await new Promise((r) => setTimeout(r, 16));
    }

    const arrastrado = tx();
    lanzar('touchend', desde - 110, y);

    const vuelta: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
      if (!document.body.contains(el)) break;
      vuelta.push(tx());
    }
    return { arrastrado, vuelta };
  });

  // El dedo lo movió de verdad hacia la izquierda.
  expect(traza.arrastrado).toBeLessThan(-40);

  // Y al soltar pasa por posiciones intermedias en lugar de saltar a su sitio.
  const intermedias = traza.vuelta.filter((x) => x < -1 && x > traza.arrastrado + 1);
  expect(
    intermedias.length,
    `desplazamientos observados tras soltar: ${traza.vuelta.map((x) => Math.round(x)).join(', ')}`,
  ).toBeGreaterThan(0);
});
