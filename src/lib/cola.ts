export type Accion = {
  clave: string;
  itemId: string;
  metodo: 'PATCH' | 'DELETE';
  cuerpo?: unknown;
};

const BASE = 'read-later';
const ALMACEN = 'acciones';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore(ALMACEN, { keyPath: 'clave' });
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

async function transaccion<T>(
  modo: IDBTransactionMode,
  operacion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await abrir();
  return new Promise<T>((resolver, rechazar) => {
    const tx = base.transaction(ALMACEN, modo);
    const peticion = operacion(tx.objectStore(ALMACEN));
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
    tx.oncomplete = () => base.close();
  });
}

/**
 * La clave es artículo + método, así que repetir una acción sobre el mismo
 * artículo sustituye a la anterior: gana la última, que es lo que quiere quien
 * la hizo.
 */
export async function encolar(accion: Omit<Accion, 'clave'>): Promise<void> {
  const completa: Accion = { ...accion, clave: `${accion.itemId}:${accion.metodo}` };
  await transaccion('readwrite', (almacen) => almacen.put(completa));
}

export async function pendientes(): Promise<Accion[]> {
  return transaccion<Accion[]>('readonly', (almacen) => almacen.getAll());
}

export async function vaciarCola(): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.clear());
}

async function descartar(clave: string): Promise<void> {
  await transaccion('readwrite', (almacen) => almacen.delete(clave));
}

export async function enviarPendientes(fetchImpl: typeof fetch = fetch): Promise<number> {
  let enviadas = 0;

  for (const accion of await pendientes()) {
    try {
      const respuesta = await fetchImpl(`/api/items/${accion.itemId}`, {
        method: accion.metodo,
        ...(accion.cuerpo
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(accion.cuerpo),
            }
          : {}),
      });

      // 404: el artículo ya no está. Reintentarlo eternamente no arregla nada.
      if (respuesta.ok || respuesta.status === 404) {
        await descartar(accion.clave);
        if (respuesta.ok) enviadas += 1;
      }
    } catch {
      // Sigue sin red: se queda en la cola.
    }
  }

  return enviadas;
}
