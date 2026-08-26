import sanitizeHtml from 'sanitize-html';
import { imageProxyPath } from './img-sign';

export type SanitizedArticle = {
  html: string;
  text: string;
  wordCount: number;
};

const ETIQUETAS_PERMITIDAS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'q', 'cite', 'pre', 'code',
  'em', 'strong', 'i', 'b', 'u', 's', 'sup', 'sub', 'abbr', 'time', 'small',
  'br', 'hr', 'span', 'div', 'section',
  'a', 'img', 'figure', 'figcaption', 'picture',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
];

const BLOQUES = new Set([
  'p', 'div', 'section', 'figure', 'figcaption', 'li', 'tr', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'td', 'th', 'caption',
]);

type Etiqueta = { tagName: string; attribs: Record<string, string> };

function absolutizar(href: string, baseUrl: string): string | null {
  try {
    const resuelta = new URL(href, baseUrl);
    if (resuelta.protocol !== 'http:' && resuelta.protocol !== 'https:') return null;
    return resuelta.toString();
  } catch {
    return null;
  }
}

export function sanitizeArticle(dirtyHtml: string, baseUrl: string): SanitizedArticle {
  const html = sanitizeHtml(dirtyHtml, {
    allowedTags: ETIQUETAS_PERMITIDAS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      time: ['datetime'],
      abbr: ['title'],
      '*': ['lang', 'dir'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_etiqueta, atributos): Etiqueta => {
        const href = atributos.href ? absolutizar(atributos.href, baseUrl) : null;
        if (!href) return { tagName: 'span', attribs: {} };
        return {
          tagName: 'a',
          attribs: { href, target: '_blank', rel: 'noopener noreferrer' },
        };
      },
      img: (_etiqueta, atributos): Etiqueta => {
        const origen = atributos.src ? absolutizar(atributos.src, baseUrl) : null;
        if (!origen) return { tagName: 'span', attribs: {} };
        return {
          tagName: 'img',
          attribs: {
            src: imageProxyPath(origen),
            alt: atributos.alt ?? '',
            loading: 'lazy',
          },
        };
      },
    },
  });

  const text = aTextoPlano(html);
  return { html, text, wordCount: contarPalabras(text) };
}

function aTextoPlano(html: string): string {
  const conSeparadores = html.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (_etiqueta, nombre: string) =>
    BLOQUES.has(nombre.toLowerCase()) ? '\n' : ' ',
  );
  return decodificarEntidades(conSeparadores)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (completa, cuerpo: string) => {
    if (cuerpo.startsWith('#x') || cuerpo.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(cuerpo.slice(2), 16));
    }
    if (cuerpo.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(cuerpo.slice(1), 10));
    }
    return ENTIDADES[cuerpo.toLowerCase()] ?? completa;
  });
}

function contarPalabras(texto: string): number {
  const palabras = texto.match(/\p{L}[\p{L}\p{M}'’-]*/gu);
  return palabras ? palabras.length : 0;
}
