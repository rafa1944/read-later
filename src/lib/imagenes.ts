/**
 * Saca del HTML de un artículo las imágenes que sirve el proxy.
 *
 * Se parsea el documento en lugar de buscar con una expresión regular: la
 * página trae también la carga interna del enrutador, con las mismas URLs
 * escapadas, y una expresión regular las tomaba por buenas y pedía basura.
 */
export function urlsDeImagen(html: string, origen: string): string[] {
  const documento = new DOMParser().parseFromString(html, 'text/html');

  const absolutas = [...documento.querySelectorAll('img')]
    .map((img) => img.getAttribute('src'))
    .filter((src): src is string => Boolean(src))
    .map((src) => {
      try {
        return new URL(src, origen);
      } catch {
        return null;
      }
    })
    .filter((url): url is URL => url !== null && url.pathname === '/api/img')
    .map((url) => url.toString());

  return [...new Set(absolutas)];
}
