'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { borrarItem, cambiarArchivado } from '@/lib/acciones';
import { anunciar } from '@/lib/avisos';
import { useFila } from './contexto-fila';
import { Estrella } from './estrella';

type Props = {
  id: string;
  archivado: boolean;
  favorito: boolean;
  alBorrar?: 'refrescar' | 'volver';
};

export function ItemActions({ id, archivado, favorito, alBorrar = 'refrescar' }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [encolada, setEncolada] = useState<string | null>(null);
  // En el lector no hay fila que sacar, así que esto es null y se refresca sin más.
  const fila = useFila();

  async function ejecutar(accion: 'archivar' | 'borrar') {
    setError(null);

    const resultado =
      accion === 'archivar' ? await cambiarArchivado(id, !archivado) : await borrarItem(id);

    if (resultado === 'encolada') {
      setEncolada(
        accion === 'borrar'
          ? 'Se borrará al recuperar la conexión'
          : 'Se enviará al recuperar la conexión',
      );
      return;
    }

    if (resultado === 'error') {
      setError('No se pudo guardar el cambio. Vuelve a intentarlo.');
      return;
    }

    anunciar(
      accion === 'borrar'
        ? 'Artículo borrado'
        : archivado
          ? 'Artículo devuelto a pendientes'
          : 'Artículo archivado',
    );

    if (accion === 'borrar' && alBorrar === 'volver') {
      iniciar(() => router.push('/'));
      return;
    }

    // Se saca la fila con su animación antes de rehacer la lista: si no, todo
    // lo de abajo pega un salto en cuanto responde el servidor.
    await fila?.salir();
    iniciar(() => router.refresh());
  }

  return (
    <div className="acciones">
      <Estrella id={id} favorito={favorito} />
      <button
        type="button"
        disabled={pendiente || encolada !== null}
        onClick={() => void ejecutar('archivar')}
      >
        {archivado ? 'Devolver' : 'Archivar'}
      </button>
      <button
        type="button"
        className="destructiva"
        disabled={pendiente || encolada !== null}
        onClick={() => {
          if (confirm('¿Borrar este artículo? No se puede deshacer.')) void ejecutar('borrar');
        }}
      >
        Borrar
      </button>
      {encolada && <span className="pendiente rotulo">{encolada}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
