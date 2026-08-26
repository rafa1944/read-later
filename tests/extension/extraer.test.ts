// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extraerArticulo } from '../../extension/src/extraer';

function documento(nombre: string): Document {
  // En entorno DOM, import.meta.url no resuelve a una ruta de fichero.
  const html = readFileSync(resolve(process.cwd(), 'tests/fixtures', nombre), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('extraerArticulo', () => {
  it('saca título, autor, sitio y fecha de un artículo normal', () => {
    const a = extraerArticulo(
      documento('articulo-completo.html'),
      'https://cocinalenta.example/pan?utm_source=x',
    );

    expect(a.title).toBe('El pan de masa madre');
    expect(a.byline).toContain('Marta Ruiz');
    expect(a.siteName).toBe('Cocina Lenta');
    expect(a.lang).toBe('es');
    expect(a.publishedTime).toBe('2026-02-14T09:30:00Z');
  });

  it('prefiere la URL canónica a la de la barra de direcciones', () => {
    const a = extraerArticulo(
      documento('articulo-completo.html'),
      'https://cocinalenta.example/pan?utm_source=x',
    );
    expect(a.url).toBe('https://cocinalenta.example/pan-masa-madre');
  });

  it('conserva el cuerpo y descarta navegación, anuncios y pie', () => {
    const a = extraerArticulo(documento('articulo-completo.html'), 'https://cocinalenta.example/pan');

    expect(a.html).toContain('levaduras');
    expect(a.html).not.toContain('Publicidad');
    expect(a.html).not.toContain('Inicio');
  });

  it('no muta el documento original', () => {
    const doc = documento('articulo-completo.html');
    const antes = doc.body.innerHTML;
    extraerArticulo(doc, 'https://cocinalenta.example/pan');
    expect(doc.body.innerHTML).toBe(antes);
  });

  it('devuelve título y URL aunque no haya artículo que extraer', () => {
    const a = extraerArticulo(documento('portada.html'), 'https://cocinalenta.example/');

    expect(a.title).toBe('Cocina Lenta');
    expect(a.url).toBe('https://cocinalenta.example/');
    expect(typeof a.html).toBe('string');
  });
});

describe('limpieza del título', () => {
  it('deja el título tal cual si no hay un h1 que lo respalde', () => {
    const doc = documento('portada.html');
    // El h1 de la portada coincide con el title completo, así que no hay nada
    // que recortar.
    expect(extraerArticulo(doc, 'https://cocinalenta.example/').title).toBe('Cocina Lenta');
  });
});
