/** Tope razonable: ninguna barra de estado de iPhone pasa de aquí. */
export const DESFASE_MAXIMO = 80;

/**
 * Cuánto más abajo empieza un elemento fijo que el contenido que se desplaza.
 *
 * En la app instalada de iOS los dos usan orígenes distintos: el contenido se
 * pinta desde el borde de la pantalla y lo fijo desde debajo de la barra de
 * estado. Sin compensarlo, la banda opaca se dibuja por debajo del reloj y el
 * texto se ve pasar por detrás de la hora.
 *
 * En el navegador no se aplica: allí la diferencia entre pantalla y ventana son
 * las barras de Safari, que es otra cosa.
 */
export function desfaseDeMarcoFijo(
  altoPantalla: number,
  altoVentana: number,
  esAppInstalada: boolean,
): number {
  if (!esAppInstalada) return 0;
  const diferencia = altoPantalla - altoVentana;
  if (!Number.isFinite(diferencia) || diferencia <= 0) return 0;
  return Math.min(DESFASE_MAXIMO, Math.round(diferencia));
}
