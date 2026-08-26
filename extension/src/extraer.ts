import { Readability } from '@mozilla/readability';

export type ArticuloExtraido = {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  lang: string | null;
  excerpt: string | null;
  html: string;
  publishedTime: string | null;
};

function meta(documento: Document, ...nombres: string[]): string | null {
  for (const nombre of nombres) {
    const etiqueta =
      documento.querySelector(`meta[property="${nombre}"]`) ??
      documento.querySelector(`meta[name="${nombre}"]`);
    const valor = etiqueta?.getAttribute('content')?.trim();
    if (valor) return valor;
  }
  return null;
}

function urlCanonica(documento: Document, urlPagina: string): string {
  const enlace = documento.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const candidata = enlace ?? meta(documento, 'og:url');
  if (!candidata) return urlPagina;
  try {
    return new URL(candidata, urlPagina).toString();
  } catch {
    return urlPagina;
  }
}

const SEPARADORES = ['—', '–', '|', '»', '·', ' - ', ':'];

/**
 * Quita el sufijo del sitio del <title> cuando el <h1> de la página dice lo
 * mismo sin él: «El pan — Cocina Lenta» se guarda como «El pan».
 */
function limpiarTitulo(documento: Document, titulo: string): string {
  const encabezados = documento.querySelectorAll('h1');
  if (encabezados.length !== 1) return titulo;

  const h1 = encabezados[0].textContent?.trim();
  if (!h1 || h1.length < 5 || h1.length >= titulo.length) return titulo;

  const resto = titulo.slice(h1.length).trimStart();
  return titulo.startsWith(h1) && SEPARADORES.some((s) => resto.startsWith(s.trim()))
    ? h1
    : titulo;
}

export function extraerArticulo(documento: Document, urlPagina: string): ArticuloExtraido {
  // Readability muta el documento que recibe, así que se le pasa un clon.
  const clon = documento.cloneNode(true) as Document;
  let articulo: ReturnType<Readability['parse']> = null;
  try {
    articulo = new Readability(clon).parse();
  } catch {
    articulo = null;
  }

  return {
    url: urlCanonica(documento, urlPagina),
    title: limpiarTitulo(
      documento,
      articulo?.title?.trim() || documento.title.trim() || urlPagina,
    ),
    byline: articulo?.byline?.trim() || meta(documento, 'author', 'article:author'),
    siteName: articulo?.siteName?.trim() || meta(documento, 'og:site_name'),
    lang: documento.documentElement.getAttribute('lang') || meta(documento, 'og:locale'),
    excerpt: articulo?.excerpt?.trim() || meta(documento, 'description', 'og:description'),
    html: articulo?.content ?? '',
    publishedTime: meta(documento, 'article:published_time', 'og:article:published_time'),
  };
}
