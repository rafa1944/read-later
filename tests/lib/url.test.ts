import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from '@/lib/url';

describe('canonicalizeUrl', () => {
  it('quita los parámetros de seguimiento', () => {
    expect(
      canonicalizeUrl('https://ejemplo.com/a?utm_source=x&utm_medium=y&id=7'),
    ).toBe('https://ejemplo.com/a?id=7');
  });

  it('quita el fragmento', () => {
    expect(canonicalizeUrl('https://ejemplo.com/a#seccion')).toBe('https://ejemplo.com/a');
  });

  it('quita la barra final salvo en la raíz', () => {
    expect(canonicalizeUrl('https://ejemplo.com/a/')).toBe('https://ejemplo.com/a');
    expect(canonicalizeUrl('https://ejemplo.com/')).toBe('https://ejemplo.com/');
  });

  it('pasa el host a minúsculas y quita el puerto por defecto', () => {
    expect(canonicalizeUrl('https://EJEMPLO.com:443/a')).toBe('https://ejemplo.com/a');
  });

  it('ordena los parámetros que conserva', () => {
    expect(canonicalizeUrl('https://ejemplo.com/a?b=2&a=1')).toBe('https://ejemplo.com/a?a=1&b=2');
  });

  it('rechaza esquemas que no son http o https', () => {
    expect(() => canonicalizeUrl('javascript:alert(1)')).toThrow();
    expect(() => canonicalizeUrl('no es una url')).toThrow();
  });
});
