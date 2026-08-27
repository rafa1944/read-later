export type Tema = 'auto' | 'claro' | 'oscuro' | 'sepia';
export type Ancho = 'estrecho' | 'medio' | 'ancho';
export type Densidad = 'completa' | 'compacta';
export type Ajustes = { escala: number; ancho: Ancho; tema: Tema; densidad: Densidad };

export const CLAVE_AJUSTES = 'read-later:lectura';

export const AJUSTES_POR_DEFECTO: Ajustes = {
  escala: 1,
  ancho: 'medio',
  tema: 'auto',
  densidad: 'completa',
};

export const ESCALA_MINIMA = 0.85;
export const ESCALA_MAXIMA = 1.6;
export const PASO_ESCALA = 0.075;

const TEMAS: Tema[] = ['auto', 'claro', 'oscuro', 'sepia'];
const ANCHOS: Ancho[] = ['estrecho', 'medio', 'ancho'];
const DENSIDADES: Densidad[] = ['completa', 'compacta'];

export function normalizarAjustes(valor: unknown): Ajustes {
  if (!valor || typeof valor !== 'object') return AJUSTES_POR_DEFECTO;
  const bruto = valor as Partial<Ajustes>;

  if (!TEMAS.includes(bruto.tema as Tema)) return AJUSTES_POR_DEFECTO;
  if (!ANCHOS.includes(bruto.ancho as Ancho)) return AJUSTES_POR_DEFECTO;
  if (typeof bruto.escala !== 'number' || Number.isNaN(bruto.escala)) return AJUSTES_POR_DEFECTO;

  return {
    tema: bruto.tema as Tema,
    ancho: bruto.ancho as Ancho,
    // La densidad se añadió después: unos ajustes guardados sin ella son
    // válidos y se completan con el valor por defecto, en lugar de descartarse.
    densidad: DENSIDADES.includes(bruto.densidad as Densidad)
      ? (bruto.densidad as Densidad)
      : AJUSTES_POR_DEFECTO.densidad,
    escala:
      Math.round(Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, bruto.escala)) * 1000) / 1000,
  };
}

export function aplicarAjustes(ajustes: Ajustes, raiz = document.documentElement): void {
  if (ajustes.tema === 'auto') {
    delete raiz.dataset.tema;
  } else {
    raiz.dataset.tema = ajustes.tema;
  }
  raiz.dataset.ancho = ajustes.ancho;
  raiz.dataset.densidad = ajustes.densidad;
  raiz.style.setProperty('--escala', String(ajustes.escala));
}

/**
 * Se ejecuta en el <head>, antes del primer pintado: sin esto, abrir la app de
 * noche con el tema oscuro elegido daría un fogonazo blanco.
 */
export const GUION_INICIAL = `
try {
  var a = JSON.parse(localStorage.getItem(${JSON.stringify(CLAVE_AJUSTES)}) || '{}');
  var r = document.documentElement;
  if (a.tema && a.tema !== 'auto') r.dataset.tema = a.tema;
  if (a.ancho) r.dataset.ancho = a.ancho;
  if (a.densidad) r.dataset.densidad = a.densidad;
  if (a.escala) r.style.setProperty('--escala', String(a.escala));
} catch (e) {}
`.trim();
