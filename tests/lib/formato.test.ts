import { describe, expect, it } from 'vitest';
import { fechaCorta, minutosDeLectura, tiempoDeLectura } from '@/lib/formato';

describe('minutosDeLectura', () => {
  it('calcula a 220 palabras por minuto y redondea hacia arriba', () => {
    expect(minutosDeLectura(220)).toBe(1);
    expect(minutosDeLectura(221)).toBe(2);
    expect(minutosDeLectura(2200)).toBe(10);
  });

  it('devuelve null cuando no hay texto suficiente para leer', () => {
    expect(minutosDeLectura(0)).toBeNull();
    expect(minutosDeLectura(40)).toBeNull();
  });
});

describe('tiempoDeLectura', () => {
  it('da la forma legible', () => {
    expect(tiempoDeLectura(220)).toBe('1 min');
    expect(tiempoDeLectura(0)).toBe('sin texto');
  });
});

describe('fechaCorta', () => {
  it('da día y mes abreviado en español', () => {
    expect(fechaCorta(new Date('2026-03-09T10:00:00Z'))).toMatch(/9 mar/);
  });
});
