'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { debeRefrescar } from '@/lib/refresco';
import { EVENTO_SINCRONIZAR } from './sincronizador';

/**
 * Revalida la lista al volver a la app. Sin esto, la pantalla se queda con lo
 * que hubiera cuando se abrió: guardas algo desde el escritorio y en el iPad no
 * aparece hasta salir y volver a entrar.
 */
export function Actualizador() {
  const router = useRouter();
  const ultimo = useRef(0);

  useEffect(() => {
    function alVolver() {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      if (!debeRefrescar(ultimo.current, Date.now())) return;

      ultimo.current = Date.now();
      router.refresh();

      // De paso se calienta la caché sin conexión con lo que acabe de llegar;
      // el sincronizador aplica su propio límite de una vez cada cinco minutos.
      window.dispatchEvent(new Event(EVENTO_SINCRONIZAR));
    }

    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);

    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [router]);

  return null;
}
