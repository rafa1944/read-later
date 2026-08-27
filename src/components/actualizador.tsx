'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { CLAVE_AJUSTES, normalizarAjustes, sincronizarColorDeBarra } from '@/lib/ajustes';
import { debeRefrescar } from '@/lib/refresco';
import { EVENTO_SINCRONIZAR } from './sincronizador';

/**
 * Revalida la lista al volver a la app. Sin esto, la pantalla se queda con lo
 * que hubiera cuando se abrió: guardas algo desde el escritorio y en el iPad no
 * aparece hasta salir y volver a entrar.
 */
export function Actualizador() {
  const router = useRouter();
  const ruta = usePathname();
  const ultimo = useRef(0);

  /*
   * El color de la barra de estado se reafirma en cada navegación: Next vuelve
   * a insertar sus propias metas y, sin esto, la franja del reloj se quedaría
   * con el color del tema anterior.
   */
  useEffect(() => {
    try {
      const ajustes = normalizarAjustes(JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? 'null'));
      sincronizarColorDeBarra(ajustes.tema);
    } catch {
      // Sin ajustes guardados, las metas del servidor ya son correctas.
    }
  }, [ruta]);

  useEffect(() => {
    function refrescar(forzar = false) {
      if (!navigator.onLine) return;
      if (!forzar && !debeRefrescar(ultimo.current, Date.now())) return;

      ultimo.current = Date.now();
      router.refresh();
    }

    function alVolver() {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine || !debeRefrescar(ultimo.current, Date.now())) return;

      refrescar();
      // De paso se calienta la caché sin conexión con lo que acabe de llegar;
      // el sincronizador aplica su propio límite de una vez cada cinco minutos.
      window.dispatchEvent(new Event(EVENTO_SINCRONIZAR));
    }

    /*
     * El service worker pinta la página guardada al instante y avisa. Aquí se
     * piden los datos frescos justo después: se ve algo de inmediato y se
     * corrige solo en cuanto responde el servidor.
     */
    function mensaje(evento: MessageEvent) {
      if ((evento.data as { tipo?: string })?.tipo === 'servido-de-cache') refrescar(true);
    }

    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    navigator.serviceWorker?.addEventListener('message', mensaje);

    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      navigator.serviceWorker?.removeEventListener('message', mensaje);
    };
  }, [router]);

  return null;
}
