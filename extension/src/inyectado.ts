import { extraerArticulo } from './extraer';

/**
 * Este fichero se inyecta entero en la pestaña. El empaquetado le añade al
 * final la llamada `__rlCapturar()`, de modo que el valor de terminación del
 * script es el artículo, y eso es lo que devuelve chrome.scripting.
 * No se usa `func:` porque Chrome serializa la función sin sus dependencias, y
 * Readability se quedaría fuera.
 */
(globalThis as unknown as Record<string, unknown>).__rlCapturar = () =>
  extraerArticulo(document, location.href);
