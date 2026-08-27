'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ControlDensidad } from './densidad';

type Props = { recuento: string };

/**
 * Recuento a la izquierda, controles a la derecha. Viven aquí y no en la
 * cabecera porque allí no caben en el móvil junto a las pestañas.
 *
 * El filtro va en la dirección y no en un ajuste guardado: es estado de vista,
 * así que se puede recargar, volver atrás y compartir el enlace, y filtra el
 * servidor en lugar del navegador.
 */
export function BarraLista({ recuento }: Props) {
  const ruta = usePathname();
  const params = useSearchParams();
  const soloFavoritos = params.get('favoritos') === '1';

  return (
    <div className="barra-lista">
      <p className="titular">{recuento}</p>

      <div className="controles">
        <Link
          href={soloFavoritos ? ruta : `${ruta}?favoritos=1`}
          className={soloFavoritos ? 'filtro-favoritos activo' : 'filtro-favoritos'}
          aria-label={soloFavoritos ? 'Mostrar todos' : 'Mostrar solo favoritos'}
          title={soloFavoritos ? 'Mostrar todos' : 'Mostrar solo favoritos'}
        >
          <svg viewBox="0 0 16 16" width="23" height="23" aria-hidden="true">
            <path
              d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4l-3.8 2 .7-4.3-3.1-3 4.3-.6z"
              fill={soloFavoritos ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.15"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

        <ControlDensidad />
      </div>
    </div>
  );
}
