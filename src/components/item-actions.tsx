'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { encolar, enviarPendientes } from '@/lib/cola';

type Props = { id: string; archivado: boolean; alBorrar?: 'refrescar' | 'volver' };

export function ItemActions({ id, archivado, alBorrar = 'refrescar' }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [encolada, setEncolada] = useState<string | null>(null);

  const vaciar = useCallback(async () => {
    if ((await enviarPendientes()) > 0) {
      setEncolada(null);
      iniciar(() => router.refresh());
    }
  }, [router]);

  useEffect(() => {
    void vaciar();
    const alVolver = () => void vaciar();
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [vaciar]);

  async function llamar(metodo: 'PATCH' | 'DELETE', cuerpo?: unknown) {
    setError(null);

    try {
      const respuesta = await fetch(`/api/items/${id}`, {
        method: metodo,
        ...(cuerpo
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }
          : {}),
      });
      if (!respuesta.ok) throw new Error(String(respuesta.status));

      if (metodo === 'DELETE' && alBorrar === 'volver') {
        iniciar(() => router.push('/'));
        return;
      }
      iniciar(() => router.refresh());
    } catch {
      // Sin red: se guarda para enviarlo luego, y se dice claramente en vez de
      // fingir que ya está hecho.
      await encolar({ itemId: id, metodo, cuerpo });
      setEncolada(
        metodo === 'DELETE'
          ? 'Se borrará al recuperar la conexión'
          : 'Se enviará al recuperar la conexión',
      );
    }
  }

  return (
    <div className="acciones">
      <button
        type="button"
        disabled={pendiente || encolada !== null}
        onClick={() => llamar('PATCH', { archived: !archivado })}
      >
        {archivado ? 'Devolver' : 'Archivar'}
      </button>
      <button
        type="button"
        className="destructiva"
        disabled={pendiente || encolada !== null}
        onClick={() => {
          if (confirm('¿Borrar este artículo? No se puede deshacer.')) llamar('DELETE');
        }}
      >
        Borrar
      </button>
      {encolada && <span className="pendiente rotulo">{encolada}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
