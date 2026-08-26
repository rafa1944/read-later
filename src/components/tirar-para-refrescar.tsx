'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { UMBRAL_TIRON, amortiguar, decidirEje, type Eje } from '@/lib/gestos';
import { EVENTO_SINCRONIZAR } from './sincronizador';

const MAXIMO = 96;

/**
 * En una PWA en modo standalone, iOS no ofrece el tirón nativo para recargar,
 * así que se implementa aquí. Solo actúa con la página arriba del todo, para no
 * secuestrar el desplazamiento normal.
 */
export function TirarParaRefrescar() {
  const router = useRouter();
  const [distancia, setDistancia] = useState(0);
  const [recargando, setRecargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const inicio = useRef<{ x: number; y: number } | null>(null);
  const eje = useRef<Eje>('indeciso');

  useEffect(() => {
    function alEmpezar(evento: TouchEvent) {
      if (window.scrollY > 0 || evento.touches.length !== 1) {
        inicio.current = null;
        return;
      }
      const dedo = evento.touches[0];
      inicio.current = { x: dedo.clientX, y: dedo.clientY };
      eje.current = 'indeciso';
    }

    function alMover(evento: TouchEvent) {
      if (!inicio.current || recargando) return;

      const dedo = evento.touches[0];
      const dx = dedo.clientX - inicio.current.x;
      const dy = dedo.clientY - inicio.current.y;

      if (eje.current === 'indeciso') eje.current = decidirEje(dx, dy);
      if (eje.current !== 'vertical' || dy <= 0) return;

      // Se corta el rebote elástico de Safari: si no, su gesto y el nuestro
      // pelean y el resultado da tirones.
      if (evento.cancelable) evento.preventDefault();
      setDistancia(amortiguar(dy, MAXIMO));
    }

    function alSoltar() {
      const recorrido = distancia;
      inicio.current = null;
      setDistancia(0);

      if (recorrido < UMBRAL_TIRON) return;

      if (!navigator.onLine) {
        setAviso('Sin conexión');
        setTimeout(() => setAviso(null), 1800);
        return;
      }

      setRecargando(true);
      router.refresh();
      window.dispatchEvent(new Event(EVENTO_SINCRONIZAR));
      setTimeout(() => setRecargando(false), 900);
    }

    document.addEventListener('touchstart', alEmpezar, { passive: true });
    document.addEventListener('touchmove', alMover, { passive: false });
    document.addEventListener('touchend', alSoltar, { passive: true });
    document.addEventListener('touchcancel', alSoltar, { passive: true });

    return () => {
      document.removeEventListener('touchstart', alEmpezar);
      document.removeEventListener('touchmove', alMover);
      document.removeEventListener('touchend', alSoltar);
      document.removeEventListener('touchcancel', alSoltar);
    };
  }, [distancia, recargando, router]);

  const progreso = Math.min(1, distancia / UMBRAL_TIRON);

  return (
    <div
      className={recargando ? 'tiron recargando' : 'tiron'}
      style={{ ['--progreso' as string]: progreso }}
      aria-hidden={aviso === null}
    >
      <i />
      {aviso && <span className="rotulo">{aviso}</span>}
    </div>
  );
}
