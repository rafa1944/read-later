// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { EVENTO_AVISO, anunciar, type Aviso } from '@/lib/avisos';

describe('anunciar', () => {
  it('emite el texto del aviso', async () => {
    const recibidos: Aviso[] = [];
    window.addEventListener(EVENTO_AVISO, (e) => recibidos.push((e as CustomEvent<Aviso>).detail));

    anunciar('Artículo archivado');

    expect(recibidos.map((a) => a.texto)).toEqual(['Artículo archivado']);
  });

  it('da un identificador distinto a cada aviso', () => {
    const ids: number[] = [];
    window.addEventListener(EVENTO_AVISO, (e) => ids.push((e as CustomEvent<Aviso>).detail.id));

    anunciar('uno');
    anunciar('dos');

    // Sin identificadores distintos, dos avisos seguidos con el mismo texto no
    // reinician el temporizador y el segundo se vería a medias.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
