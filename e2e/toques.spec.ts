import { expect, test, type Page } from '@playwright/test';

/**
 * Referencia de iOS: 44×44 puntos. Mínimo de accesibilidad de la WCAG: 24×24.
 * Se exige el de iOS, que es el que hace que la app se use cómodamente con el
 * pulgar en el metro.
 */
const MINIMO = 44;

async function entrarConArticulo(page: Page, request: Page['request'], id: string) {
  await request.post('/api/items', {
    headers: { authorization: `Bearer ${process.env.INGEST_TOKEN}` },
    data: {
      url: `https://ejemplo.com/toques-${id}`,
      title: `Medir toques ${id}`,
      excerpt: 'Un extracto cualquiera para que la fila esté completa.',
      html: `<p>${'palabra '.repeat(250)}</p>`,
    },
  });

  await page.goto('/login');
  await page.getByLabel('Contraseña').fill(process.env.APP_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Archivo' })).toBeVisible();
}

test.describe('con el dedo', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

  test('todos los controles llegan al tamaño mínimo', async ({ page, request }, info) => {
    await entrarConArticulo(page, request, info.testId);

    const pequeños = await page.evaluate((minimo) => {
      const seleccion = [
        '.cabecera a',
        '.salir',
        '.filtro-favoritos',
        '.densidad button',
        '.fila .estrella',
        '.fila .acciones button',
      ];
      return seleccion
        .flatMap((sel) => [...document.querySelectorAll(sel)])
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            texto: (el.textContent || el.getAttribute('aria-label') || el.className).slice(0, 28),
            ancho: Math.round(r.width),
            alto: Math.round(r.height),
          };
        })
        .filter((m) => m.ancho < minimo || m.alto < minimo);
    }, MINIMO);

    expect(pequeños, `controles por debajo de ${MINIMO}px`).toEqual([]);
  });

  test('los controles de una fila no se solapan entre sí', async ({ page, request }, info) => {
    await entrarConArticulo(page, request, info.testId);

    const solapes = await page.evaluate(() => {
      const cajas = [...document.querySelectorAll('.fila .acciones button')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x1: r.left, x2: r.right, y1: r.top, y2: r.bottom, t: el.textContent?.slice(0, 12) };
      });

      const chocan = [];
      for (let i = 0; i < cajas.length; i += 1) {
        for (let j = i + 1; j < cajas.length; j += 1) {
          const a = cajas[i];
          const b = cajas[j];
          if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) chocan.push([a.t, b.t]);
        }
      }
      return chocan;
    });

    expect(solapes, 'zonas táctiles superpuestas').toEqual([]);
  });
});

test.describe('con ratón', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('el diseño compacto se mantiene en escritorio', async ({ page, request }, info) => {
    await entrarConArticulo(page, request, info.testId);

    const alto = await page
      .locator('.fila .acciones button')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().height));

    // Si esto crece, es que la regla táctil se ha colado en escritorio.
    expect(alto).toBeLessThan(30);
  });
});
