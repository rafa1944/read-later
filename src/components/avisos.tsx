'use client';

import { useEffect, useState } from 'react';
import { EVENTO_AVISO, type Aviso } from '@/lib/avisos';

const DURACION_MS = 3200;

export function Avisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>;

    function recibir(evento: Event) {
      const nuevo = (evento as CustomEvent<Aviso>).detail;
      setAviso(nuevo);
      clearTimeout(temporizador);
      temporizador = setTimeout(() => setAviso(null), DURACION_MS);
    }

    window.addEventListener(EVENTO_AVISO, recibir);
    return () => {
      window.removeEventListener(EVENTO_AVISO, recibir);
      clearTimeout(temporizador);
    };
  }, []);

  if (!aviso) return null;

  return (
    <output className="aviso-flotante rotulo" key={aviso.id} aria-live="polite">
      {aviso.texto}
    </output>
  );
}
