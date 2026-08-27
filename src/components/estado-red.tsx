'use client';

import { useEffect, useState } from 'react';

/**
 * La señal buena la da el service worker: avisa cuando ha tenido que servir
 * desde la caché. navigator.onLine solo dice si hay una red conectada, no si
 * esa red llega a algún sitio, así que aquí se usa como refuerzo, no como
 * fuente principal.
 */
export function EstadoRed() {
  const [desdeCache, setDesdeCache] = useState(false);

  useEffect(() => {
    if (!navigator.onLine) setDesdeCache(true);

    // Se le pregunta al service worker en cuanto carga la página: el aviso de
    // una navegación servida desde caché lo recibió la página anterior.
    void navigator.serviceWorker?.ready.then((registro) =>
      registro.active?.postMessage({ tipo: 'estado' }),
    );

    function mensaje(evento: MessageEvent) {
      const tipo = (evento.data as { tipo?: string })?.tipo;
      if (tipo === 'sin-red') setDesdeCache(true);
      if (tipo === 'con-red') setDesdeCache(false);
    }

    const abajo = () => setDesdeCache(true);
    const arriba = () => setDesdeCache(false);

    navigator.serviceWorker?.addEventListener('message', mensaje);
    window.addEventListener('offline', abajo);
    window.addEventListener('online', arriba);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', mensaje);
      window.removeEventListener('offline', abajo);
      window.removeEventListener('online', arriba);
    };
  }, []);

  if (!desdeCache) return null;

  return (
    <span className="sin-red rotulo" role="status">
      Sin conexión
    </span>
  );
}
