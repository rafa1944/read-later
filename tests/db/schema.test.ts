import { beforeEach, expect, it } from 'vitest';
import { db } from '@/db/client';
import { items } from '@/db/schema';
import { resetDb } from '../setup/reset';

beforeEach(resetDb);

it('guarda un artículo y lo recupera con valores por defecto', async () => {
  const [row] = await db
    .insert(items)
    .values({
      url: 'https://ejemplo.com/a',
      title: 'Un título',
      contentHtml: '<p>Hola</p>',
      contentText: 'Hola',
    })
    .returning();

  expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(row.archivedAt).toBeNull();
  expect(row.scrollPct).toBe(0);
  expect(row.wordCount).toBe(0);
});

it('rechaza dos artículos con la misma URL', async () => {
  const values = {
    url: 'https://ejemplo.com/dup',
    title: 'T',
    contentHtml: '<p>x</p>',
    contentText: 'x',
  };
  await db.insert(items).values(values);
  await expect(db.insert(items).values(values)).rejects.toThrow();
});
