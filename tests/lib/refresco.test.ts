import { describe, expect, it } from 'vitest';
import { ESPERA_REFRESCO_MS, debeRefrescar } from '@/lib/refresco';

describe('debeRefrescar', () => {
  it('refresca la primera vez', () => {
    expect(debeRefrescar(0, 1_000_000)).toBe(true);
  });

  it('no refresca dos veces seguidas: visibilitychange y focus llegan juntos', () => {
    const ahora = 1_000_000;
    expect(debeRefrescar(ahora, ahora + 50)).toBe(false);
  });

  it('vuelve a refrescar pasada la espera', () => {
    const ahora = 1_000_000;
    expect(debeRefrescar(ahora, ahora + ESPERA_REFRESCO_MS)).toBe(true);
    expect(debeRefrescar(ahora, ahora + ESPERA_REFRESCO_MS - 1)).toBe(false);
  });
});
