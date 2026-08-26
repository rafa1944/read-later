/**
 * `visibilitychange` y `focus` suelen dispararse casi a la vez al volver a la
 * app, así que se ignora el segundo para no pedir la lista dos veces.
 */
export const ESPERA_REFRESCO_MS = 4000;

export function debeRefrescar(ultimoRefresco: number, ahora: number): boolean {
  return ahora - ultimoRefresco >= ESPERA_REFRESCO_MS;
}
