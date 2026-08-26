// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

/**
 * chrome.scripting.executeScript({files}) devuelve el valor de terminación del
 * script. Aquí se evalúa el bundle real igual que lo haría el navegador para
 * comprobar que ese valor es el artículo, no undefined.
 */
describe('bundle inyectado', () => {
  let codigo: string;

  beforeAll(() => {
    execFileSync('node', ['extension/build.mjs'], { stdio: 'ignore' });
    codigo = readFileSync(resolve(process.cwd(), 'extension/dist/inyectado.js'), 'utf8');
  });

  it('deja el artículo como valor de terminación del script', () => {
    const html = readFileSync(resolve(process.cwd(), 'tests/fixtures/articulo-completo.html'), 'utf8');
    const documento = new DOMParser().parseFromString(html, 'text/html');

    const contexto = {
      document: documento,
      location: { href: 'https://cocinalenta.example/pan' },
      DOMParser,
      Node,
      NodeFilter,
      URL,
      console,
    };
    (contexto as Record<string, unknown>).globalThis = contexto;

    const resultado = runInNewContext(codigo, contexto) as {
      title: string;
      url: string;
      html: string;
    };

    expect(resultado.title).toBe('El pan de masa madre');
    expect(resultado.url).toBe('https://cocinalenta.example/pan-masa-madre');
    expect(resultado.html).toContain('levaduras');
  });
});
