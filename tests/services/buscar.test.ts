import { beforeEach, describe, expect, it } from 'vitest';
import { createItem, searchItems, updateItem } from '@/services/items';
import { resetDb } from '../setup/reset';

async function sembrar() {
  const pan = await createItem({
    url: 'https://ejemplo.com/pan',
    title: 'El pan de masa madre',
    html: '<p>La masa madre es un cultivo de harina y agua con levaduras salvajes.</p>',
  });
  const sopa = await createItem({
    url: 'https://ejemplo.com/sopa',
    title: 'Sopa de cebolla',
    html: '<p>Una receta clásica que empieza por pochar mucha cebolla muy despacio.</p>',
  });
  return { pan, sopa };
}

beforeEach(resetDb);

describe('searchItems', () => {
  it('encuentra por una palabra del cuerpo', async () => {
    const { pan } = await sembrar();
    const resultados = await searchItems('levaduras');

    expect(resultados.map((r) => r.id)).toEqual([pan.id]);
  });

  it('encuentra por una palabra del título', async () => {
    const { sopa } = await sembrar();
    expect((await searchItems('cebolla')).map((r) => r.id)).toContain(sopa.id);
  });

  it('exige todas las palabras de la consulta', async () => {
    await sembrar();
    expect(await searchItems('masa cebolla')).toEqual([]);
  });

  it('admite frases entre comillas', async () => {
    const { pan } = await sembrar();

    expect((await searchItems('"masa madre"')).map((r) => r.id)).toEqual([pan.id]);
    expect(await searchItems('"madre masa"')).toEqual([]);
  });

  it('devuelve un fragmento con la palabra encontrada marcada', async () => {
    await sembrar();
    const [resultado] = await searchItems('levaduras');

    expect(resultado.snippet).toContain('<mark>levaduras</mark>');
  });

  it('busca también en el archivo', async () => {
    const { pan } = await sembrar();
    await updateItem(pan.id, { archived: true });

    expect((await searchItems('levaduras')).map((r) => r.id)).toEqual([pan.id]);
  });

  it('devuelve vacío ante una consulta vacía o de solo signos', async () => {
    await sembrar();

    expect(await searchItems('')).toEqual([]);
    expect(await searchItems('   ')).toEqual([]);
    expect(await searchItems('&&&')).toEqual([]);
  });
});
