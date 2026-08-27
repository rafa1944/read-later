// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { urlsDeImagen } from '@/lib/imagenes';

const O = 'https://leer.ejemplo.com';

describe('urlsDeImagen', () => {
  it('saca las imágenes del proxy de un artículo', () => {
    const html = '<img src="/api/img?url=https%3A%2F%2Fcdn.com%2Fa.jpg&amp;sig=abc" loading="lazy">';
    expect(urlsDeImagen(html, O)).toEqual([
      `${O}/api/img?url=https%3A%2F%2Fcdn.com%2Fa.jpg&sig=abc`,
    ]);
  });

  it('no repite la misma imagen', () => {
    const html = '<img src="/api/img?url=a&amp;sig=1"><img src="/api/img?url=a&amp;sig=1">';
    expect(urlsDeImagen(html, O).length).toBe(1);
  });

  it('devuelve vacío si el artículo no lleva imágenes', () => {
    expect(urlsDeImagen('<p>Solo texto</p>', O)).toEqual([]);
  });

  it('ignora las copias escapadas que van dentro de los scripts de React', () => {
    // Esto es lo que rompía: la página trae la carga interna del enrutador con
    // las mismas URLs escapadas, y una expresión regular las tomaba por buenas.
    const html = `
      <img src="/api/img?url=https%3A%2F%2Fcdn.com%2Fa.jpg&amp;sig=abc">
      <script>self.__flight.push("<img src=\\"/api/img?url=https%3A%2F%2Fcdn.com%2Fa.jpg\\u0026amp;sig=abc\\">")</script>
    `;

    const encontradas = urlsDeImagen(html, O);
    expect(encontradas).toEqual([`${O}/api/img?url=https%3A%2F%2Fcdn.com%2Fa.jpg&sig=abc`]);
    expect(encontradas.some((u) => u.includes('u0026') || u.endsWith('\\'))).toBe(false);
  });

  it('descarta imágenes que no son del proxy', () => {
    expect(urlsDeImagen('<img src="https://otro.example/a.png">', O)).toEqual([]);
  });
});
