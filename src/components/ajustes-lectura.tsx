'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AJUSTES_POR_DEFECTO,
  CLAVE_AJUSTES,
  ESCALA_MAXIMA,
  ESCALA_MINIMA,
  PASO_ESCALA,
  aplicarAjustes,
  normalizarAjustes,
  type Ajustes,
  type Ancho,
  type Letra,
  type Tema,
} from '@/lib/ajustes';

const TEMAS: { valor: Tema; texto: string }[] = [
  { valor: 'auto', texto: 'Auto' },
  { valor: 'claro', texto: 'Claro' },
  { valor: 'oscuro', texto: 'Oscuro' },
  { valor: 'sepia', texto: 'Sepia' },
];

const LETRAS: { valor: Letra; texto: string }[] = [
  { valor: 'serif', texto: 'Serif' },
  { valor: 'georgia', texto: 'Georgia' },
  { valor: 'palo', texto: 'Palo seco' },
];

const ANCHOS: { valor: Ancho; texto: string }[] = [
  { valor: 'estrecho', texto: 'Estrecho' },
  { valor: 'medio', texto: 'Medio' },
  { valor: 'ancho', texto: 'Ancho' },
];

type Props = {
  /*
   * En el listado se ofrecen solo la tipografía y el tema, que son los dos que
   * se notan ahí: los títulos se pintan con --serif y el tema es de toda la
   * página. El tamaño de letra solo escala el cuerpo del artículo y el ancho de
   * columna no llega a mover la lista, así que allí serían mandos muertos.
   */
  ambito?: 'lector' | 'lista';
};

export function AjustesLectura({ ambito = 'lector' }: Props) {
  const enLector = ambito === 'lector';
  const [abierto, setAbierto] = useState(false);
  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_POR_DEFECTO);
  const contenedor = useRef<HTMLDivElement>(null);
  /*
   * Espejo de lo último elegido. Sin esto, dos pulsaciones dentro del mismo
   * ciclo de React parten las dos del mismo estado y la segunda pisa a la
   * primera: eliges tipografía y tema seguidos y solo se queda el tema.
   */
  const actuales = useRef<Ajustes>(AJUSTES_POR_DEFECTO);

  useEffect(() => {
    let cargados: Ajustes;
    try {
      cargados = normalizarAjustes(JSON.parse(localStorage.getItem(CLAVE_AJUSTES) ?? 'null'));
    } catch {
      cargados = AJUSTES_POR_DEFECTO;
    }
    actuales.current = cargados;
    setAjustes(cargados);
  }, []);

  useEffect(() => {
    if (!abierto) return;

    function fuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function escape(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }

    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  function cambiar(parcial: Partial<Ajustes>) {
    const nuevos = normalizarAjustes({ ...actuales.current, ...parcial });
    actuales.current = nuevos;
    setAjustes(nuevos);
    aplicarAjustes(nuevos);
    try {
      localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(nuevos));
    } catch {
      // Navegación privada con el almacenamiento bloqueado: se pierde al salir.
    }
  }

  return (
    <div className="ajustes" ref={contenedor}>
      {abierto && (
        <div className="panel" role="dialog" aria-label="Ajustes de lectura">
          {enLector && (
          <fieldset>
            <legend>Tamaño de letra</legend>
            <div className="opciones">
              <button
                type="button"
                onClick={() => cambiar({ escala: ajustes.escala - PASO_ESCALA })}
                disabled={ajustes.escala <= ESCALA_MINIMA}
                aria-label="Reducir el tamaño de letra"
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => cambiar({ escala: ajustes.escala + PASO_ESCALA })}
                disabled={ajustes.escala >= ESCALA_MAXIMA}
                aria-label="Aumentar el tamaño de letra"
              >
                A+
              </button>
            </div>
          </fieldset>
          )}

          <fieldset>
            <legend>Tipografía</legend>
            <div className="opciones">
              {LETRAS.map(({ valor, texto }) => (
                <button
                  key={valor}
                  type="button"
                  data-muestra={valor}
                  aria-pressed={ajustes.letra === valor}
                  onClick={() => cambiar({ letra: valor })}
                >
                  {texto}
                </button>
              ))}
            </div>
          </fieldset>

          {enLector && (
          <fieldset>
            <legend>Ancho de columna</legend>
            <div className="opciones">
              {ANCHOS.map(({ valor, texto }) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={ajustes.ancho === valor}
                  onClick={() => cambiar({ ancho: valor })}
                >
                  {texto}
                </button>
              ))}
            </div>
          </fieldset>
          )}

          <fieldset>
            <legend>Tema</legend>
            <div className="opciones">
              {TEMAS.map(({ valor, texto }) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={ajustes.tema === valor}
                  onClick={() => cambiar({ tema: valor })}
                >
                  {texto}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label="Ajustes de lectura"
        title="Ajustes de lectura"
      >
        Aa
      </button>
    </div>
  );
}
