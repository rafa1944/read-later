import { describe, expect, it } from 'vitest';
import { imageProxyPath, signImage, verifyImageSig } from '@/lib/img-sign';

describe('firma de imágenes', () => {
  it('acepta su propia firma', () => {
    const url = 'https://cdn.ejemplo.com/foto.jpg';
    expect(verifyImageSig(url, signImage(url))).toBe(true);
  });

  it('rechaza una firma de otra URL', () => {
    expect(
      verifyImageSig('https://cdn.ejemplo.com/a.jpg', signImage('https://cdn.ejemplo.com/b.jpg')),
    ).toBe(false);
  });

  it('rechaza una firma ausente o vacía', () => {
    expect(verifyImageSig('https://cdn.ejemplo.com/a.jpg', null)).toBe(false);
    expect(verifyImageSig('https://cdn.ejemplo.com/a.jpg', '')).toBe(false);
  });

  it('construye una ruta de proxy con la URL codificada', () => {
    const ruta = imageProxyPath('https://cdn.ejemplo.com/f.jpg?w=2');
    expect(
      ruta.startsWith('/api/img?url=https%3A%2F%2Fcdn.ejemplo.com%2Ff.jpg%3Fw%3D2&sig='),
    ).toBe(true);
  });
});
