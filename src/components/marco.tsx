'use client';

import { useEffect } from 'react';
import { desfaseDeMarcoFijo } from '@/lib/marco';

/**
 * Publica en CSS cuánto más abajo empieza un elemento fijo que el contenido.
 * Sin este número, la banda opaca superior no puede alcanzar la barra de
 * estado en la app instalada.
 */
export function Marco() {
  useEffect(() => {
    function medir() {
      const desfase = desfaseDeMarcoFijo(
        window.screen?.height ?? 0,
        window.innerHeight,
        window.matchMedia('(display-mode: standalone)').matches,
      );
      document.documentElement.style.setProperty('--desfase-fijo', `${desfase}px`);
    }

    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('orientationchange', medir);

    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('orientationchange', medir);
    };
  }, []);

  return null;
}
