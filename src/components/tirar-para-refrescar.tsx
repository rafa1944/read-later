'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  UMBRAL_TIRON,
  amortiguar,
  decidirEje,
  distanciaDeSobrescroll,
  type Eje,
} from '@/lib/gestos';
import { marcoDesplazable } from '@/lib/desplazamiento';
import { EVENTO_SINCRONIZAR } from './sincronizador';

const MAXIMO = 96;

/**
 * En una PWA en modo standalone, iOS no ofrece el tirón nativo para recargar.
 *
 * Se detecta por dos vías a la vez porque ninguna sirve en todas partes:
 *
 * 1. Táctil. Se mide el arrastre y se corta el gesto del navegador. Funciona en
 *    Chromium, pero en Safari depende de qué elemento haya bajo el dedo, así
 *    que no se puede confiar solo en ella.
 * 2. Sobrescroll. Safari deja `scrollY` en negativo durante el rebote elástico;
 *    ese número es el tirón, y da igual dónde empezara el dedo.
 *
 * Gana la que más recorrido detecte durante el gesto.
 */
export function TirarParaRefrescar() {
  const router = useRouter();
  const [distancia, setDistancia] = useState(0);
  const [recargando, setRecargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const inicio = useRef<{ x: number; y: number } | null>(null);
  const eje = useRef<Eje>('indeciso');
  const maximo = useRef(0);
  const recargandoRef = useRef(false);

  useEffect(() => {
    const marco = marcoDesplazable();

    function anotar(recorrido: number) {
      if (recargandoRef.current) return;
      if (recorrido > maximo.current) maximo.current = recorrido;
      setDistancia(recorrido);
    }

    function alEmpezar(evento: TouchEvent) {
      if (marco.scrollTop > 0 || evento.touches.length !== 1) {
        inicio.current = null;
        return;
      }
      const dedo = evento.touches[0];
      inicio.current = { x: dedo.clientX, y: dedo.clientY };
      eje.current = 'indeciso';
      maximo.current = 0;
    }

    function alMover(evento: TouchEvent) {
      if (!inicio.current || recargandoRef.current) return;

      const dedo = evento.touches[0];
      const dx = dedo.clientX - inicio.current.x;
      const dy = dedo.clientY - inicio.current.y;

      if (eje.current === 'indeciso') eje.current = decidirEje(dx, dy);
      if (eje.current !== 'vertical' || dy <= 0) return;

      if (evento.cancelable) evento.preventDefault();
      anotar(amortiguar(dy, MAXIMO));
    }

    function alDesplazar() {
      const rebote = distanciaDeSobrescroll(marco.scrollTop);
      if (rebote > 0) anotar(Math.min(rebote, MAXIMO));
    }

    function alSoltar() {
      const recorrido = maximo.current;
      inicio.current = null;
      maximo.current = 0;
      setDistancia(0);

      if (recorrido < UMBRAL_TIRON || recargandoRef.current) return;

      if (!navigator.onLine) {
        setAviso('Sin conexión');
        setTimeout(() => setAviso(null), 1800);
        return;
      }

      recargandoRef.current = true;
      setRecargando(true);
      router.refresh();
      window.dispatchEvent(new Event(EVENTO_SINCRONIZAR));
      setTimeout(() => {
        recargandoRef.current = false;
        setRecargando(false);
      }, 900);
    }

    document.addEventListener('touchstart', alEmpezar, { passive: true });
    document.addEventListener('touchmove', alMover, { passive: false });
    document.addEventListener('touchend', alSoltar, { passive: true });
    document.addEventListener('touchcancel', alSoltar, { passive: true });
    marco.addEventListener('scroll', alDesplazar, { passive: true });

    return () => {
      document.removeEventListener('touchstart', alEmpezar);
      document.removeEventListener('touchmove', alMover);
      document.removeEventListener('touchend', alSoltar);
      document.removeEventListener('touchcancel', alSoltar);
      marco.removeEventListener('scroll', alDesplazar);
    };
  }, [router]);

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
