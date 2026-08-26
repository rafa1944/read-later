'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { id: string; inicial: number };

/**
 * La espina del lector: misma idea que la de la lista, a tamaño de ventana.
 * Muestra el avance y lo guarda en el servidor con antirrebote.
 */
export function Rail({ id, inicial }: Props) {
  const [avance, setAvance] = useState(inicial);
  const ultimoEnviado = useRef(inicial);

  useEffect(() => {
    function posicion(): number {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      if (alto <= 0) return 1;
      return Math.min(1, Math.max(0, window.scrollY / alto));
    }

    if (inicial > 0.02 && inicial < 0.98) {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: alto * inicial });
    } else {
      setAvance(posicion());
    }

    let temporizador: ReturnType<typeof setTimeout> | undefined;

    function enviar() {
      const actual = posicion();
      if (Math.abs(actual - ultimoEnviado.current) < 0.02) return;
      ultimoEnviado.current = actual;
      void fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scrollPct: actual }),
        keepalive: true,
      });
    }

    function alDesplazar() {
      setAvance(posicion());
      clearTimeout(temporizador);
      temporizador = setTimeout(enviar, 700);
    }

    window.addEventListener('scroll', alDesplazar, { passive: true });
    // keepalive permite que el último envío salga aunque se cierre la pestaña.
    window.addEventListener('pagehide', enviar);

    return () => {
      clearTimeout(temporizador);
      window.removeEventListener('scroll', alDesplazar);
      window.removeEventListener('pagehide', enviar);
      enviar();
    };
  }, [id, inicial]);

  return (
    <div className="rail" style={{ ['--avance' as string]: avance }} aria-hidden="true">
      <i />
    </div>
  );
}
