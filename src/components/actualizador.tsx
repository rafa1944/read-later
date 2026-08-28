'use client';

import { usePathname, useRouter } from 'next/navigation';
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
  const ruta = usePathname();
  const ultimo = useRef(0);

  // Solo las listas se quedan viejas. El texto de un artículo no cambia nunca.
  const esListado = ruta === '/' || ruta === '/archivo' || ruta === '/buscar';

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
      /*
       * También aquí solo el listado. El aviso es una emisión a todos los
       * clientes y el sincronizador calienta la caché por detrás, así que
       * mientras lees llegan avisos de páginas que no estás viendo: refrescar
       * por ellos rehace el árbol y te cierra el panel de ajustes en la cara.
       */
      if (!esListado) return;
      if ((evento.data as { tipo?: string })?.tipo === 'servido-de-cache') refrescar(true);
    }

    /*
     * Y no basta con escuchar. El aviso se emite mientras el navegador atiende
     * la navegación, cuando este documento todavía no existe como cliente del
     * service worker: quien lo recibe es la página que se está abandonando. Al
     * recargar o al abrir la app desde el icono, nadie lo oye y la lista se
     * queda con la copia guardada. Como con el worker al mando cualquier carga
     * puede venir de la caché, se piden los datos frescos de entrada. Es una
     * petición por carga de documento, no por navegación: este componente vive
     * en el layout y no se vuelve a montar al cambiar de pestaña.
     */
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    navigator.serviceWorker?.addEventListener('message', mensaje);

    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      navigator.serviceWorker?.removeEventListener('message', mensaje);
    };
  }, [router, esListado]);

  return null;
}
