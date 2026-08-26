'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { cambiarArchivado } from '@/lib/acciones';
import { UMBRAL_DESLIZAR, amortiguar, decidirEje, type Eje } from '@/lib/gestos';

const MAXIMO = 120;

type Props = { id: string; archivado: boolean; children: React.ReactNode };

/**
 * Deslizar una fila hacia la izquierda la archiva (o la devuelve a pendientes).
 * Comparte con el tirón la decisión de eje, así que los dos gestos conviven sin
 * pisarse: lo lateral archiva, lo vertical se desplaza.
 */
export function FilaDeslizable({ id, archivado, children }: Props) {
  const router = useRouter();
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [encolada, setEncolada] = useState(false);
  const [, iniciar] = useTransition();

  const inicio = useRef<{ x: number; y: number } | null>(null);
  const eje = useRef<Eje>('indeciso');

  function alEmpezar(evento: React.TouchEvent) {
    if (evento.touches.length !== 1) return;
    const dedo = evento.touches[0];
    inicio.current = { x: dedo.clientX, y: dedo.clientY };
    eje.current = 'indeciso';
  }

  function alMover(evento: React.TouchEvent) {
    if (!inicio.current) return;

    const dedo = evento.touches[0];
    const dx = dedo.clientX - inicio.current.x;
    const dy = dedo.clientY - inicio.current.y;

    if (eje.current === 'indeciso') eje.current = decidirEje(dx, dy);
    if (eje.current !== 'horizontal' || dx >= 0) return;

    setDesplazamiento(amortiguar(-dx, MAXIMO));
  }

  async function alSoltar() {
    const recorrido = desplazamiento;
    inicio.current = null;
    setDesplazamiento(0);

    if (recorrido < UMBRAL_DESLIZAR) return;

    const resultado = await cambiarArchivado(id, !archivado);
    if (resultado === 'encolada') {
      setEncolada(true);
      return;
    }
    if (resultado === 'ok') iniciar(() => router.refresh());
  }

  const activo = desplazamiento >= UMBRAL_DESLIZAR;
  const progreso = Math.min(1, desplazamiento / UMBRAL_DESLIZAR);

  return (
    <div
      className="deslizable"
      style={{
        ['--desplazamiento' as string]: `${desplazamiento}px`,
        ['--progreso-gesto' as string]: progreso,
      }}
    >
      <span className={activo ? 'accion-gesto lista' : 'accion-gesto'} aria-hidden="true">
        <span className="rotulo">{archivado ? 'Devolver' : 'Archivar'}</span>
      </span>

      <div
        className="deslizante"
        onTouchStart={alEmpezar}
        onTouchMove={alMover}
        onTouchEnd={() => void alSoltar()}
        onTouchCancel={() => void alSoltar()}
      >
        {children}
        {encolada && (
          <p className="pendiente rotulo">Se enviará al recuperar la conexión</p>
        )}
      </div>
    </div>
  );
}
