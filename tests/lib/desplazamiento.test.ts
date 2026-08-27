// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { posicionDeLectura } from '@/lib/desplazamiento';

function marcoFalso(scrollTop: number, scrollHeight: number, clientHeight: number) {
  return { scrollTop, scrollHeight, clientHeight } as HTMLElement;
}

describe('posicionDeLectura', () => {
  it('vale 0 al principio y 1 al final', () => {
    expect(posicionDeLectura(marcoFalso(0, 2000, 800))).toBe(0);
    expect(posicionDeLectura(marcoFalso(1200, 2000, 800))).toBe(1);
  });

  it('es proporcional por el medio', () => {
    expect(posicionDeLectura(marcoFalso(600, 2000, 800))).toBeCloseTo(0.5, 5);
  });

  it('un artículo que cabe entero cuenta como leído', () => {
    // Sin recorrido no hay nada que seguir: dejarlo en 0 marcaría como sin
    // empezar algo que ya se ve completo.
    expect(posicionDeLectura(marcoFalso(0, 500, 800))).toBe(1);
  });

  it('acota el rebote elástico, que da valores fuera de rango', () => {
    expect(posicionDeLectura(marcoFalso(-40, 2000, 800))).toBe(0);
    expect(posicionDeLectura(marcoFalso(1400, 2000, 800))).toBe(1);
  });
});
