import { describe, expect, it } from 'vitest';
import { DESFASE_MAXIMO, desfaseDeMarcoFijo } from '@/lib/marco';

describe('desfaseDeMarcoFijo', () => {
  it('mide la barra de estado en la app instalada', () => {
    // Medido en un iPhone 16 Pro Max: 956 de pantalla, 894 de ventana.
    expect(desfaseDeMarcoFijo(956, 894, true)).toBe(62);
  });

  it('es cero cuando la app ya ocupa toda la pantalla', () => {
    expect(desfaseDeMarcoFijo(956, 956, true)).toBe(0);
  });

  it('no compensa nada en el navegador', () => {
    // Ahí la diferencia son las barras de Safari, no la barra de estado.
    expect(desfaseDeMarcoFijo(956, 780, false)).toBe(0);
  });

  it('acota valores absurdos', () => {
    expect(desfaseDeMarcoFijo(956, 300, true)).toBe(DESFASE_MAXIMO);
    expect(desfaseDeMarcoFijo(956, 1000, true)).toBe(0);
    expect(desfaseDeMarcoFijo(Number.NaN, 894, true)).toBe(0);
  });
});
