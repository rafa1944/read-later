'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, useTransition } from 'react';
import { FilaContexto } from './contexto-fila';
import { cambiarArchivado } from '@/lib/acciones';
import { anunciar } from '@/lib/avisos';
import { UMBRAL_DESLIZAR, amortiguar, decidirEje, type Eje } from '@/lib/gestos';

const MAXIMO = 120;
export const DURACION_SALIDA_MS = 240;
export const DURACION_RETORNO_MS = 220;

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
  const [saliendo, setSaliendo] = useState(false);
  const [volviendo, setVolviendo] = useState(false);
  const [, iniciar] = useTransition();

  /*
   * Sacar la fila con una animación antes de refrescar. Si no, la lista se
   * rehace de golpe cuando responde el servidor y lo de abajo pega un salto.
   */
  const salir = useCallback(
    () =>
      new Promise<void>((resolver) => {
        setSaliendo(true);
        const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setTimeout(resolver, sinMovimiento ? 0 : DURACION_SALIDA_MS);
      }),
    [],
  );

  const inicio = useRef<{ x: number; y: number } | null>(null);
  const eje = useRef<Eje>('indeciso');

  function alEmpezar(evento: React.TouchEvent) {
    if (evento.touches.length !== 1) return;
    // Si venía volviendo, se corta: durante el arrastre la fila tiene que
    // seguir al dedo uno a uno, sin transición de por medio.
    setVolviendo(false);
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
    if (recorrido === 0) return;

    /*
     * La transición se enciende justo para el regreso y se apaga después. Con
     * ella puesta siempre, la fila iría por detrás del dedo al arrastrar.
     */
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!sinMovimiento) {
      setVolviendo(true);
      setTimeout(() => setVolviendo(false), DURACION_RETORNO_MS);
    }
    setDesplazamiento(0);

    if (recorrido < UMBRAL_DESLIZAR) return;

    const resultado = await cambiarArchivado(id, !archivado);
    if (resultado === 'encolada') {
      setEncolada(true);
      return;
    }
    if (resultado === 'ok') {
      anunciar(archivado ? 'Artículo devuelto a pendientes' : 'Artículo archivado');
      await salir();
      iniciar(() => router.refresh());
    }
  }

  const activo = desplazamiento >= UMBRAL_DESLIZAR;
  const progreso = Math.min(1, desplazamiento / UMBRAL_DESLIZAR);

  return (
    <FilaContexto.Provider value={{ salir }}>
      {/*
        La envoltura colapsa la altura al salir. El recorte solo se aplica
        mientras dura la animación: dejarlo puesto convertiría la fila en un
        contenedor de desplazamiento y en iOS se tragaría el gesto de scroll.
      */}
      <div className={saliendo ? 'fila-salida saliendo' : 'fila-salida'}>
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
            className={volviendo ? 'deslizante volviendo' : 'deslizante'}
            onTouchStart={alEmpezar}
            onTouchMove={alMover}
            onTouchEnd={() => void alSoltar()}
            onTouchCancel={() => void alSoltar()}
          >
            {children}
            {encolada && <p className="pendiente rotulo">Se enviará al recuperar la conexión</p>}
          </div>
        </div>
      </div>
    </FilaContexto.Provider>
  );
}
