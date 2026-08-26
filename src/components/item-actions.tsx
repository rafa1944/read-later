'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = { id: string; archivado: boolean; alBorrar?: 'refrescar' | 'volver' };

export function ItemActions({ id, archivado, alBorrar = 'refrescar' }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function llamar(metodo: 'PATCH' | 'DELETE', cuerpo?: unknown) {
    setError(null);
    const respuesta = await fetch(`/api/items/${id}`, {
      method: metodo,
      ...(cuerpo
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }
        : {}),
    });

    if (!respuesta.ok) {
      setError('No se pudo guardar el cambio. Vuelve a intentarlo.');
      return;
    }

    if (metodo === 'DELETE' && alBorrar === 'volver') {
      iniciar(() => router.push('/'));
      return;
    }
    iniciar(() => router.refresh());
  }

  return (
    <div className="acciones">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => llamar('PATCH', { archived: !archivado })}
      >
        {archivado ? 'Devolver' : 'Archivar'}
      </button>
      <button
        type="button"
        className="destructiva"
        disabled={pendiente}
        onClick={() => {
          if (confirm('¿Borrar este artículo? No se puede deshacer.')) llamar('DELETE');
        }}
      >
        Borrar
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
