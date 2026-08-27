export const UMBRAL_TIRON = 64;
export const UMBRAL_DESLIZAR = 88;
export const EJE_MINIMO = 12;

export type Eje = 'indeciso' | 'vertical' | 'horizontal';

/**
 * Se exige que lo lateral gane con holgura: confundir un desplazamiento con un
 * archivado molesta mucho más que tener que repetir el gesto.
 */
export function decidirEje(dx: number, dy: number): Eje {
  if (Math.hypot(dx, dy) < EJE_MINIMO) return 'indeciso';
  return Math.abs(dx) > Math.abs(dy) * 1.4 ? 'horizontal' : 'vertical';
}

/**
 * Rendimiento decreciente: al principio el elemento sigue al dedo casi uno a
 * uno y luego se va frenando hacia el máximo, como en las apps nativas.
 */
export function amortiguar(distancia: number, maximo: number): number {
  if (distancia <= 0) return 0;
  return maximo * (1 - Math.exp(-distancia / maximo));
}

/**
 * En iOS, tirar hacia abajo estando arriba del todo deja `scrollY` en negativo
 * mientras dura el rebote elástico. Leerlo es más fiable que intentar ganarle
 * el gesto a Safari con preventDefault, que depende de qué haya bajo el dedo.
 */
export function distanciaDeSobrescroll(scrollY: number): number {
  return Math.max(0, -scrollY);
}
