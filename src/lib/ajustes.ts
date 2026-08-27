export type Tema = 'auto' | 'claro' | 'oscuro' | 'sepia';
export type Ancho = 'estrecho' | 'medio' | 'ancho';
export type Densidad = 'completa' | 'compacta';
export type Letra = 'serif' | 'georgia' | 'palo';
export type Ajustes = {
  escala: number;
  ancho: Ancho;
  tema: Tema;
  densidad: Densidad;
  letra: Letra;
};

export const CLAVE_AJUSTES = 'read-later:lectura';

export const AJUSTES_POR_DEFECTO: Ajustes = {
  escala: 1,
  ancho: 'medio',
  tema: 'auto',
  densidad: 'completa',
  letra: 'serif',
};

export const ESCALA_MINIMA = 0.85;
export const ESCALA_MAXIMA = 1.6;
export const PASO_ESCALA = 0.075;

const TEMAS: Tema[] = ['auto', 'claro', 'oscuro', 'sepia'];
const ANCHOS: Ancho[] = ['estrecho', 'medio', 'ancho'];
const DENSIDADES: Densidad[] = ['completa', 'compacta'];
const LETRAS: Letra[] = ['serif', 'georgia', 'palo'];

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
    // Igual que la densidad: unos ajustes guardados antes de que existiera
    // este campo son válidos y se completan, no se descartan.
    letra: LETRAS.includes(bruto.letra as Letra)
      ? (bruto.letra as Letra)
      : AJUSTES_POR_DEFECTO.letra,
    escala:
      Math.round(Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, bruto.escala)) * 1000) / 1000,
  };
}

/** El fondo de cada tema, en el mismo orden que las variables del CSS. */
export const FONDOS: Record<Exclude<Tema, 'auto'>, string> = {
  claro: '#e9eae5',
  oscuro: '#14171a',
  sepia: '#efe6d5',
};

/**
 * iOS pinta la franja de la barra de estado con el theme-color. Si no se
 * actualiza al cambiar de tema, esa franja se queda con el color anterior y se
 * ve como un recuadro ajeno encima de la app.
 */
export function sincronizarColorDeBarra(tema: Tema, doc = document): void {
  /*
   * Se edita el contenido, no se recrean las metas: son nodos que React
   * gestiona, y quitarlos por debajo le rompe la navegación siguiente.
   *
   * Se actualizan todas las que haya, porque Next reinserta las suyas al
   * navegar y no se sabe cuál elegirá el sistema para pintar la franja; si
   * todas dicen lo mismo, da igual.
   */
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    if (tema === 'auto') {
      const oscura = meta.getAttribute('media')?.includes('dark');
      meta.setAttribute('content', oscura ? FONDOS.oscuro : FONDOS.claro);
    } else {
      meta.setAttribute('content', FONDOS[tema]);
    }
  }
}

export function aplicarAjustes(ajustes: Ajustes, raiz = document.documentElement): void {
  if (ajustes.tema === 'auto') {
    delete raiz.dataset.tema;
  } else {
    raiz.dataset.tema = ajustes.tema;
  }
  raiz.dataset.ancho = ajustes.ancho;
  raiz.dataset.densidad = ajustes.densidad;
  raiz.dataset.letra = ajustes.letra;
  raiz.style.setProperty('--escala', String(ajustes.escala));
  sincronizarColorDeBarra(ajustes.tema, raiz.ownerDocument);
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
  if (a.letra) r.dataset.letra = a.letra;
  if (a.escala) r.style.setProperty('--escala', String(a.escala));

  var fondos = { claro: '#e9eae5', oscuro: '#14171a', sepia: '#efe6d5' };
  if (a.tema && a.tema !== 'auto' && fondos[a.tema]) {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', fondos[a.tema]);
  }
} catch (e) {}
`.trim();
