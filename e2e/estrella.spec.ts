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
