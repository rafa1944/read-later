import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanitizeArticle } from '@/lib/sanitize';

const leer = (nombre: string) =>
  readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url), 'utf8');

describe('sanitizeArticle', () => {
  const blog = sanitizeArticle(leer('blog-sencillo.html'), 'https://blog.ejemplo.com/pan');
  const periodico = sanitizeArticle(leer('periodico.html'), 'https://diario.com/noticia');

  it('conserva el texto y la estructura del artículo', () => {
    expect(blog.html).toContain('<h1>Cómo hacer pan</h1>');
    expect(blog.html).toContain('<strong>harina</strong>');
    expect(blog.html).toContain('<figcaption>');
    expect(periodico.html).toContain('<blockquote>');
  });

  it('elimina scripts, iframes, formularios y estilos', () => {
    expect(blog.html).not.toContain('<script');
    expect(blog.html).not.toContain('rastreame');
    expect(periodico.html).not.toContain('<iframe');
    expect(periodico.html).not.toContain('<form');
    expect(periodico.html).not.toContain('<input');
    expect(periodico.html).not.toContain('style=');
  });

  it('elimina los atributos de evento', () => {
    expect(periodico.html).not.toContain('onclick');
  });

  it('elimina los enlaces con esquema javascript', () => {
    expect(periodico.html).not.toContain('javascript:');
  });

  it('reescribe las imágenes al proxy y resuelve las rutas relativas', () => {
    expect(blog.html).toContain(
      '/api/img?url=https%3A%2F%2Fblog.ejemplo.com%2Fimagenes%2Fmasa.jpg&amp;sig=',
    );
    expect(blog.html).toContain('alt="Masa reposando"');
    expect(blog.html).not.toContain('src="/imagenes/masa.jpg"');
  });

  it('descarta srcset para que no se salte el proxy', () => {
    expect(periodico.html).not.toContain('srcset');
  });

  it('convierte los enlaces relativos en absolutos y los abre con seguridad', () => {
    expect(blog.html).toContain('href="https://blog.ejemplo.com/receta-completa"');
    expect(blog.html).toContain('rel="noopener noreferrer"');
    expect(blog.html).toContain('target="_blank"');
  });

  it('extrae texto plano con las entidades resueltas y cuenta palabras', () => {
    expect(periodico.text).toContain('Texto del reportaje con & entidades.');
    expect(periodico.text).not.toContain('&amp;');
    expect(periodico.text).not.toContain('<');
    expect(blog.wordCount).toBeGreaterThan(10);
  });

  it('separa los bloques con espacio en el texto plano', () => {
    expect(blog.text).toContain('Cómo hacer pan');
    expect(blog.text).not.toContain('panPrimero');
  });
});
