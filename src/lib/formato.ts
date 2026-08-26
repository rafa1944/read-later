export const MINIMO_PALABRAS_LEGIBLE = 50;

const PALABRAS_POR_MINUTO = 220;

export function minutosDeLectura(wordCount: number): number | null {
  if (wordCount < MINIMO_PALABRAS_LEGIBLE) return null;
  return Math.ceil(wordCount / PALABRAS_POR_MINUTO);
}

export function tiempoDeLectura(wordCount: number): string {
  const minutos = minutosDeLectura(wordCount);
  return minutos === null ? 'sin texto' : `${minutos} min`;
}

export function fechaCorta(fecha: Date): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(fecha);
}
