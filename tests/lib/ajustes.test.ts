// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { AJUSTES_POR_DEFECTO, aplicarAjustes, normalizarAjustes } from '@/lib/ajustes';

describe('normalizarAjustes', () => {
  it('acepta unos ajustes válidos', () => {
    const ajustes = { escala: 1.2, ancho: 'ancho' as const, tema: 'sepia' as const };
    expect(normalizarAjustes(ajustes)).toEqual(ajustes);
  });

  it('cae en los valores por defecto ante basura', () => {
    expect(normalizarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO);
    expect(normalizarAjustes('{}')).toEqual(AJUSTES_POR_DEFECTO);
    expect(normalizarAjustes({ tema: 'fucsia' })).toEqual(AJUSTES_POR_DEFECTO);
  });

  it('acota la escala a un rango legible', () => {
    expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, escala: 9 }).escala).toBe(1.6);
    expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, escala: 0.1 }).escala).toBe(0.85);
  });
});

describe('aplicarAjustes', () => {
  it('escribe los atributos y la variable de escala en la raíz', () => {
    const raiz = document.documentElement;
    aplicarAjustes({ escala: 1.15, ancho: 'ancho', tema: 'oscuro' }, raiz);

    expect(raiz.dataset.tema).toBe('oscuro');
    expect(raiz.dataset.ancho).toBe('ancho');
    expect(raiz.style.getPropertyValue('--escala')).toBe('1.15');
  });

  it('con tema automático no fija ningún tema, para dejar mandar al sistema', () => {
    const raiz = document.documentElement;
    aplicarAjustes({ escala: 1, ancho: 'medio', tema: 'auto' }, raiz);

    expect(raiz.dataset.tema).toBeUndefined();
  });
});
