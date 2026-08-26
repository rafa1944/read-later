import { describe, expect, it } from 'vitest';
import {
  destinoDe as decidir,
  esCacheFirst,
  sobrantes,
  urlsDeImagen,
} from '@/sw/estrategia';

const O = 'https://leer.ejemplo.com';

const destinoDe = (url: string, metodo: string, esNavegacion: boolean) =>
  decidir(url, metodo, esNavegacion, O);

describe('destinoDe', () => {
  it('manda los recursos compilados de Next a los estáticos', () => {
    expect(destinoDe(`${O}/_next/static/chunks/main.js`, 'GET', false)).toBe('estaticos');
    expect(destinoDe(`${O}/iconos/192.png`, 'GET', false)).toBe('estaticos');
  });

  it('manda las navegaciones a las páginas', () => {
    expect(destinoDe(`${O}/`, 'GET', true)).toBe('paginas');
    expect(destinoDe(`${O}/a/123`, 'GET', true)).toBe('paginas');
  });

  it('manda a páginas también lo que no es navegación', () => {
    // El sincronizador pide los artículos con fetch, no navegando: si esto no
    // se cachea, no hay nada que leer sin conexión.
    expect(destinoDe(`${O}/a/123`, 'GET', false)).toBe('paginas');
    expect(destinoDe(`${O}/archivo`, 'GET', false)).toBe('paginas');
  });

  it('manda las imágenes de artículo a su propia caché', () => {
    expect(destinoDe(`${O}/api/img?url=x&sig=y`, 'GET', false)).toBe('imagenes');
  });

  it('manda las listas y los artículos en JSON a los datos', () => {
    expect(destinoDe(`${O}/api/items?state=pendientes`, 'GET', false)).toBe('datos');
    expect(destinoDe(`${O}/api/items/abc`, 'GET', false)).toBe('datos');
  });

  it('no cachea nada que no sea GET', () => {
    expect(destinoDe(`${O}/api/items/abc`, 'PATCH', false)).toBeNull();
    expect(destinoDe(`${O}/api/items`, 'POST', false)).toBeNull();
  });

  it('no cachea el login ni la salida', () => {
    expect(destinoDe(`${O}/api/auth/login`, 'POST', false)).toBeNull();
    expect(destinoDe(`${O}/login`, 'GET', true)).toBeNull();
  });

  it('no cachea nada que no sean rutas propias conocidas', () => {
    expect(destinoDe('https://otro.example/a.png', 'GET', false)).toBeNull();
  });
});

describe('esCacheFirst', () => {
  it('solo lo inmutable se sirve primero desde la caché', () => {
    expect(esCacheFirst('estaticos')).toBe(true);
    expect(esCacheFirst('imagenes')).toBe(true);
    // Páginas y datos van primero a la red: con conexión, lo que se ve tiene
    // que estar al día.
    expect(esCacheFirst('paginas')).toBe(false);
    expect(esCacheFirst('datos')).toBe(false);
  });
});

describe('sobrantes', () => {
  it('devuelve lo que está en la caché y ya no hace falta', () => {
    expect(sobrantes(['/a/1', '/a/2', '/a/3'], ['/a/2'])).toEqual(['/a/1', '/a/3']);
  });

  it('no devuelve nada si todo sigue haciendo falta', () => {
    expect(sobrantes(['/a/1'], ['/a/1', '/a/2'])).toEqual([]);
  });
});

describe('urlsDeImagen', () => {
  it('saca las imágenes del proxy de un artículo, con las entidades resueltas', () => {
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
});
