'use client';

import { useEffect, useState } from 'react';

export function EstadoRed() {
  const [conectado, setConectado] = useState(true);

  useEffect(() => {
    setConectado(navigator.onLine);

    const arriba = () => setConectado(true);
    const abajo = () => setConectado(false);
    window.addEventListener('online', arriba);
    window.addEventListener('offline', abajo);

    return () => {
      window.removeEventListener('online', arriba);
      window.removeEventListener('offline', abajo);
    };
  }, []);

  if (conectado) return null;

  return (
    <span className="sin-red rotulo" role="status">
      Sin conexión
    </span>
  );
}
