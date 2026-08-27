/** Identificador del contenedor que desplaza el contenido. */
export const ID_MARCO = 'marco';

/**
 * El contenido ya no lo desplaza el documento sino este contenedor, que empieza
 * justo debajo de la barra de estado. Así el texto no se tapa al subir: queda
 * recortado, porque fuera del contenedor no puede pintarse nada.
 *
 * Devuelve el documento como respaldo por si algo se ejecuta antes de montarlo.
 */
export function marcoDesplazable(): HTMLElement {
  return document.getElementById(ID_MARCO) ?? document.documentElement;
}

export function posicionDeLectura(marco: HTMLElement): number {
  const recorrido = marco.scrollHeight - marco.clientHeight;
  if (recorrido <= 0) return 1;
  return Math.min(1, Math.max(0, marco.scrollTop / recorrido));
}
