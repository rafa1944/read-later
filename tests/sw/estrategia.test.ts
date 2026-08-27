import { describe, expect, it } from 'vitest';
import {
  cachesObsoletas,
  destinoDe as decidir,
  esCacheFirst,
  esSWR,
  sobrantes,
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

describe('esSWR', () => {
  it('las páginas se pintan de la caché y se revalidan por detrás', () => {
    expect(esSWR('paginas')).toBe(true);
  });

  it('los datos no: una lista vieja servida como buena confunde', () => {
    expect(esSWR('datos')).toBe(false);
  });

  it('lo inmutable no lo necesita, ya va primero por caché', () => {
    expect(esSWR('estaticos')).toBe(false);
    expect(esSWR('imagenes')).toBe(false);
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

describe('cachesObsoletas', () => {
  it('tira las cachés propias de versiones anteriores', () => {
    expect(
      cachesObsoletas(['rl-paginas-vA', 'rl-paginas-vB', 'rl-imagenes-vA'], ['rl-paginas-vB']),
    ).toEqual(['rl-paginas-vA', 'rl-imagenes-vA']);
  });

  it('no toca cachés de otros: la app no es la única que usa el navegador', () => {
    expect(cachesObsoletas(['otra-cosa', 'workbox-precache'], ['rl-paginas-vB'])).toEqual([]);
  });

  it('conserva las de la versión vigente', () => {
    expect(cachesObsoletas(['rl-paginas-vB'], ['rl-paginas-vB'])).toEqual([]);
  });
});
