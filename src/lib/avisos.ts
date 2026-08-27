export const EVENTO_AVISO = 'read-later:aviso';

export type Aviso = { id: number; texto: string };

let siguienteId = 0;

/**
 * Se anuncia por un evento de ventana en lugar de por contexto de React: así
 * puede avisar cualquier parte —un botón, un gesto, el lector— sin que todas
 * cuelguen del mismo árbol de componentes.
 */
export function anunciar(texto: string): void {
  siguienteId += 1;
  window.dispatchEvent(
    new CustomEvent<Aviso>(EVENTO_AVISO, { detail: { id: siguienteId, texto } }),
  );
}
