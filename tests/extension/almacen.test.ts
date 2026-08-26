import { describe, expect, it } from 'vitest';
import { normalizarServidor } from '../../extension/src/almacen';

describe('normalizarServidor', () => {
  it('quita la barra final', () => {
    expect(normalizarServidor('https://leer.ejemplo.com/')).toBe('https://leer.ejemplo.com');
  });

  it('añade https cuando no hay esquema', () => {
    expect(normalizarServidor('leer.ejemplo.com')).toBe('https://leer.ejemplo.com');
  });

  it('respeta http en localhost, que es donde se desarrolla', () => {
    expect(normalizarServidor('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('rechaza lo que no es una dirección', () => {
    expect(() => normalizarServidor('')).toThrow();
    expect(() => normalizarServidor('javascript:alert(1)')).toThrow();
  });
});
