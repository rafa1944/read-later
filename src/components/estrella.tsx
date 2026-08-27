'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cambiarFavorito } from '@/lib/acciones';

type Props = { id: string; favorito: boolean };

export function Estrella({ id, favorito }: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  // Se pinta el estado deseado al instante: esperar a la red para ver la
  // estrella encenderse hace que el toque parezca que no ha funcionado.
  const [marcado, setMarcado] = useState(favorito);

  async function alternar() {
    const deseado = !marcado;
    setMarcado(deseado);

    const resultado = await cambiarFavorito(id, deseado);
    if (resultado === 'error') {
      setMarcado(!deseado);
      return;
    }
    if (resultado === 'ok') iniciar(() => router.refresh());
  }

  return (
    <button
      type="button"
      className={marcado ? 'estrella marcada' : 'estrella'}
      disabled={pendiente}
      onClick={() => void alternar()}
      aria-pressed={marcado}
      aria-label={marcado ? 'Quitar de favoritos' : 'Marcar como favorito'}
      title={marcado ? 'Quitar de favoritos' : 'Marcar como favorito'}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4l-3.8 2 .7-4.3-3.1-3 4.3-.6z"
          fill={marcado ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
