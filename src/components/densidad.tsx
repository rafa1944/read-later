'use client';

import { useEffect, useState } from 'react';
import {
  AJUSTES_POR_DEFECTO,
  CLAVE_AJUSTES,
  aplicarAjustes,
  normalizarAjustes,
  type Ajustes,
  type Densidad,
} from '@/lib/ajustes';

/** Tres rayas iguales: solo los títulos. */
function IconoCompacta() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" strokeWidth="1.25" />
    </svg>
  );
}

/** Una raya fuerte y un bloque de texto debajo: título con resumen. */
function IconoCompleta() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M2 3.5h9" strokeWidth="1.75" />
      <path d="M2 7h12M2 9.5h12M2 12h7" strokeWidth="1" opacity="0.75" />
    </svg>
  );
}

const OPCIONES: { valor: Densidad; etiqueta: string; Icono: () => React.ReactElement }[] = [
  { valor: 'compacta', etiqueta: 'Mostrar solo los títulos', Icono: IconoCompacta },
  { valor: 'completa', etiqueta: 'Mostrar también el resumen', Icono: IconoCompleta },
];

export function ControlDensidad() {
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_POR_DEFECTO);

  useEffect(() => {
    try {
      setAjustes(normalizarAjustes(JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? 'null')));
    } catch {
      setAjustes(AJUSTES_POR_DEFECTO);
    }
  }, []);

  function cambiar(densidad: Densidad) {
    const nuevos = normalizarAjustes({ ...ajustes, densidad });
    setAjustes(nuevos);
    aplicarAjustes(nuevos);
    try {
      localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevos));
    } catch {
      // Navegación privada con el almacenamiento bloqueado: se pierde al salir.
    }
  }

  return (
    <div className="densidad">
      {OPCIONES.map(({ valor, etiqueta, Icono }) => (
        <button
          key={valor}
          type="button"
          onClick={() => cambiar(valor)}
          aria-pressed={ajustes.densidad === valor}
          aria-label={etiqueta}
          title={etiqueta}
        >
          <Icono />
        </button>
      ))}
    </div>
  );
}
