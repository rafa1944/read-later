import { encolar } from './cola';

export type Resultado = 'ok' | 'encolada' | 'error';

/**
 * Un fallo de red se encola para más tarde; un error del servidor no, porque
 * reintentar lo mismo daría el mismo error. Lo usan tanto los botones como los
 * gestos, para que ambos se comporten igual sin conexión.
 */
async function enviar(id: string, metodo: 'PATCH' | 'DELETE', cuerpo?: unknown): Promise<Resultado> {
  try {
    const respuesta = await fetch(`/api/items/${id}`, {
      method: metodo,
      ...(cuerpo
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }
        : {}),
    });
    return respuesta.ok ? 'ok' : 'error';
  } catch {
    await encolar({ itemId: id, metodo, cuerpo });
    return 'encolada';
  }
}

export function cambiarArchivado(id: string, archivar: boolean): Promise<Resultado> {
  return enviar(id, 'PATCH', { archived: archivar });
}

export function borrarItem(id: string): Promise<Resultado> {
  return enviar(id, 'DELETE');
}
