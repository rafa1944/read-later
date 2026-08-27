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
