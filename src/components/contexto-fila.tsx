'use client';

import { createContext, useContext } from 'react';

export type ContextoFila = {
  /** Anima la salida de la fila y resuelve cuando ya no se ve. */
  salir: () => Promise<void>;
};

export const FilaContexto = createContext<ContextoFila | null>(null);

/** Devuelve null en el lector, donde no hay fila que sacar. */
export function useFila(): ContextoFila | null {
  return useContext(FilaContexto);
}
