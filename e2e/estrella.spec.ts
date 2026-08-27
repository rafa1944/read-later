import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

test('la estrella no parpadea ni se atenúa al pulsarla', async ({ page, request }, info) => {
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/estrella-${info.testId}`,
      title: `Estrella ${info.testId}`,
      html: `<p>${'palabra '.repeat(250)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Su propia fila, no «la primera»: los ficheros comparten base de datos.
  const estrella = page
    .locator('.fila', { hasText: `Estrella ${info.testId}` })
    .locator('.estrella');
  await expect(estrella).toBeVisible();

  // El velo oscuro que pinta el navegador al tocar no debe estar.
  const velo = await estrella.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('-webkit-tap-highlight-color'),
  );
  expect(velo.replace(/\s/g, '')).toMatch(/rgba\(0,0,0,0\)|transparent/);

  // Con latencia de producción, muestreando durante medio segundo tras pulsar.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 250,
    downloadThroughput: 5_000_000,
    uploadThroughput: 1_000_000,
  });

  const muestras = await estrella.evaluate(async (el) => {
    const registro: { opacidad: string; desactivada: boolean }[] = [];
    (el as HTMLButtonElement).click();
    for (let i = 0; i < 10; i += 1) {
      await new Promise((r) => setTimeout(r, 60));
      registro.push({
        opacidad: getComputedStyle(el).opacity,
        desactivada: (el as HTMLButtonElement).disabled,
      });
    }
    return registro;
  });

  // Atenuarla medio segundo después de encenderla es justo lo que parecía roto.
  expect(muestras.filter((m) => m.desactivada)).toEqual([]);
  expect(muestras.filter((m) => Number(m.opacidad) < 1)).toEqual([]);

  await expect(estrella).toHaveAttribute('aria-pressed', 'true');
  await cdp.detach();
});

const AMBAR_CLARO = 'rgb(180, 118, 26)';

test('una estrella marcada se ve ámbar, no negra', async ({ page, request }, info) => {
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/ambar-${info.testId}`,
      title: `Ámbar ${info.testId}`,
      html: `<p>${'palabra '.repeat(250)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();

  const estrella = page
    .locator('.fila', { hasText: `Ámbar ${info.testId}` })
    .locator('.estrella');
  // Sin esperar al PATCH, la recarga de más abajo puede adelantar al servidor
  // y encontrarse la estrella todavía sin marcar.
  const guardado = page.waitForResponse(
    (r) => r.url().includes('/api/items/') && r.request().method() === 'PATCH',
  );
  // Con la máquina cargada la hidratación puede tardar y el primer clic caer
  // en un botón todavía inerte. Se reintenta, pero solo mientras siga apagada:
  // volver a pulsar una estrella ya marcada la quitaría.
  await expect(async () => {
    if ((await estrella.getAttribute('aria-pressed')) === 'false') await estrella.click();
    await expect(estrella).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  expect((await guardado).ok()).toBe(true);

  // Se espera a que termine la transición de color antes de mirar.
  await page.waitForTimeout(400);
  const color = await estrella.evaluate((el) => getComputedStyle(el).color);

  // En táctil el :hover se queda pegado tras el toque: si una regla de hover
  // se cuela, esto sale casi negro en vez de ámbar.
  expect(color).toBe(AMBAR_CLARO);

  await page.reload();
  await expect(estrella).toHaveAttribute('aria-pressed', 'true');
  expect(await estrella.evaluate((el) => getComputedStyle(el).color)).toBe(AMBAR_CLARO);
});
