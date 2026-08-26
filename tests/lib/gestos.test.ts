import { describe, expect, it } from 'vitest';
import {
  EJE_MINIMO,
  UMBRAL_DESLIZAR,
  UMBRAL_TIRON,
  amortiguar,
  decidirEje,
} from '@/lib/gestos';

describe('decidirEje', () => {
  it('no decide hasta que el dedo se ha movido lo suficiente', () => {
    expect(decidirEje(2, 3)).toBe('indeciso');
    expect(decidirEje(EJE_MINIMO - 1, 0)).toBe('indeciso');
  });

  it('un arrastre claramente lateral es horizontal', () => {
    expect(decidirEje(-60, 4)).toBe('horizontal');
    expect(decidirEje(60, -4)).toBe('horizontal');
  });

  it('un arrastre claramente vertical es vertical', () => {
    expect(decidirEje(3, 60)).toBe('vertical');
    expect(decidirEje(-3, -60)).toBe('vertical');
  });

  it('ante la duda gana el vertical, que es desplazarse', () => {
    // Mismo recorrido en los dos ejes: secuestrar el scroll molesta mucho más
    // que no archivar a la primera.
    expect(decidirEje(40, 40)).toBe('vertical');
    expect(decidirEje(-40, 38)).toBe('vertical');
  });
});

describe('amortiguar', () => {
  it('no se mueve cuando el dedo no se mueve', () => {
    expect(amortiguar(0, 96)).toBe(0);
  });

  it('siempre recorre menos que el dedo', () => {
    for (const d of [10, 50, 120, 400]) {
      expect(amortiguar(d, 96)).toBeLessThan(d);
    }
  });

  it('crece con el dedo pero nunca pasa del máximo', () => {
    expect(amortiguar(50, 96)).toBeLessThan(amortiguar(120, 96));
    expect(amortiguar(10_000, 96)).toBeLessThanOrEqual(96);
  });

  it('al principio responde casi uno a uno, para que se sienta enganchado', () => {
    expect(amortiguar(10, 96)).toBeGreaterThan(8);
  });
});

describe('umbrales', () => {
  it('archivar exige más recorrido que recargar', () => {
    // Archivar cambia datos; recargar no. El accidental debe costar más.
    expect(UMBRAL_DESLIZAR).toBeGreaterThan(UMBRAL_TIRON);
  });
});
