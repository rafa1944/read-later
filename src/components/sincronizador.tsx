'use client';

import { useEffect } from 'react';
import { sincronizar } from '@/lib/sincronizar';

const CLAVE_ULTIMA = 'read-later:ultima-sync';
const ESPERA_MINIMA_MS = 5 * 60 * 1000;

/** Se emite al terminar; lo escuchan las pruebas y podría escucharlo la interfaz. */
export const EVENTO_SINCRONIZADO = 'read-later:sincronizado';

export function Sincronizador() {
  useEffect(() => {
    let cancelado = false;

    async function ejecutar() {
      if (cancelado || !navigator.onLine || !('serviceWorker' in navigator)) return;

      const ultima = Number(localStorage.getItem(CLAVE_ULTIMA) ?? '0');
      if (Date.now() - ultima < ESPERA_MINIMA_MS) return;

      const resumen = await sincronizar();
      if (cancelado) return;

      const registro = await navigator.serviceWorker.ready;
      registro.active?.postMessage({ tipo: 'limpiar', ...resumen });

      // La hora se apunta al terminar, no al empezar: si la sincronización
      // falla, el siguiente intento no tiene que esperar cinco minutos.
      localStorage.setItem(CLAVE_ULTIMA, String(Date.now()));
      window.dispatchEvent(new CustomEvent(EVENTO_SINCRONIZADO, { detail: resumen }));
    }

    // Se espera a que la página esté quieta: sincronizar no debe competir con
    // lo que la persona está intentando leer ahora mismo.
    const temporizador = setTimeout(() => void ejecutar(), 1500);
    const alVolver = () => void ejecutar();
    window.addEventListener('online', alVolver);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      window.removeEventListener('online', alVolver);
    };
  }, []);

  return null;
}
