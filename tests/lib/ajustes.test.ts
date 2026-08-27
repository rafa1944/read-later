// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { AJUSTES_POR_DEFECTO, aplicarAjustes, normalizarAjustes } from '@/lib/ajustes';

describe('normalizarAjustes', () => {
  it('acepta unos ajustes válidos', () => {
    const ajustes = {
      escala: 1.2,
      ancho: 'ancho' as const,
      tema: 'sepia' as const,
      densidad: 'compacta' as const,
      letra: 'georgia' as const,
    };
    expect(normalizarAjustes(ajustes)).toEqual(ajustes);
  });

  it('cae en los valores por defecto ante basura', () => {
    expect(normalizarAjustes(null)).toEqual(AJUSTES_POR_DEFECTO);
    expect(normalizarAjustes('{}')).toEqual(AJUSTES_POR_DEFECTO);
    expect(normalizarAjustes({ tema: 'fucsia' })).toEqual(AJUSTES_POR_DEFECTO);
  });

  it('acota la escala a un rango legible', () => {
    expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, escala: 9 }).escala).toBe(1.6);
    expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, escala: 0.1 }).escala).toBe(0.85);
  });
});

describe('aplicarAjustes', () => {
  it('escribe los atributos y la variable de escala en la raíz', () => {
    const raiz = document.documentElement;
    aplicarAjustes(
      { escala: 1.15, ancho: 'ancho', tema: 'oscuro', densidad: 'completa', letra: 'serif' },
      raiz,
    );

    expect(raiz.dataset.tema).toBe('oscuro');
    expect(raiz.dataset.ancho).toBe('ancho');
    expect(raiz.style.getPropertyValue('--escala')).toBe('1.15');
  });

  it('con tema automático no fija ningún tema, para dejar mandar al sistema', () => {
    const raiz = document.documentElement;
    aplicarAjustes(
      { escala: 1, ancho: 'medio', tema: 'auto', densidad: 'completa', letra: 'serif' },
      raiz,
    );

    expect(raiz.dataset.tema).toBeUndefined();
  });
});

describe('densidad de la lista', () => {
  it('por defecto se muestra el resumen', () => {
    expect(AJUSTES_POR_DEFECTO.densidad).toBe('completa');
  });

  it('acepta la densidad compacta', () => {
    expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, densidad: 'compacta' }).densidad).toBe(
      'compacta',
    );
  });

  it('unos ajustes guardados antes de que existiera la densidad siguen valiendo', () => {
    // Es lo que hay en el localStorage de quien ya usaba la app: no se puede
    // descartar todo por un campo que no existía.
    const antiguos = { escala: 1.3, ancho: 'ancho' as const, tema: 'sepia' as const };
    const normalizados = normalizarAjustes(antiguos);

    expect(normalizados.escala).toBeCloseTo(1.3, 5);
    expect(normalizados.tema).toBe('sepia');
    expect(normalizados.densidad).toBe('completa');
  });

  it('una densidad inventada cae en el valor por defecto sin tirar el resto', () => {
    const normalizados = normalizarAjustes({ ...AJUSTES_POR_DEFECTO, densidad: 'gaseosa', tema: 'oscuro' });

    expect(normalizados.densidad).toBe('completa');
    expect(normalizados.tema).toBe('oscuro');
  });

  it('escribe la densidad en la raíz', () => {
    aplicarAjustes({ ...AJUSTES_POR_DEFECTO, densidad: 'compacta' }, document.documentElement);
    expect(document.documentElement.dataset.densidad).toBe('compacta');
  });
});

describe('tipografía de lectura', () => {
  it('por defecto es la serif del sistema', () => {
    expect(AJUSTES_POR_DEFECTO.letra).toBe('serif');
  });

  it('acepta las tres opciones', () => {
    for (const letra of ['serif', 'georgia', 'palo'] as const) {
      expect(normalizarAjustes({ ...AJUSTES_POR_DEFECTO, letra }).letra).toBe(letra);
    }
  });

  it('unos ajustes guardados antes de que existiera la tipografía siguen valiendo', () => {
    const antiguos = {
      escala: 1.2,
      ancho: 'ancho' as const,
      tema: 'sepia' as const,
      densidad: 'compacta' as const,
    };
    const normalizados = normalizarAjustes(antiguos);

    expect(normalizados.densidad).toBe('compacta');
    expect(normalizados.letra).toBe('serif');
  });

  it('una tipografía inventada no tira el resto de los ajustes', () => {
    const n = normalizarAjustes({ ...AJUSTES_POR_DEFECTO, letra: 'gótica', tema: 'oscuro' });

    expect(n.letra).toBe('serif');
    expect(n.tema).toBe('oscuro');
  });

  it('la escribe en la raíz', () => {
    aplicarAjustes({ ...AJUSTES_POR_DEFECTO, letra: 'palo' }, document.documentElement);
    expect(document.documentElement.dataset.letra).toBe('palo');
  });
});

describe('color de la barra de estado', () => {
  function prepararMetas() {
    document.head.innerHTML = `
      <meta name="theme-color" content="#e9eae5" media="(prefers-color-scheme: light)">
      <meta name="theme-color" content="#14171a" media="(prefers-color-scheme: dark)">
    `;
    return () =>
      [...document.querySelectorAll('meta[name="theme-color"]')].map((m) =>
        m.getAttribute('content'),
      );
  }

  it('con un tema elegido, todas las metas llevan su fondo', async () => {
    const { sincronizarColorDeBarra } = await import('@/lib/ajustes');
    const leer = prepararMetas();

    sincronizarColorDeBarra('sepia');

    // Todas: no se sabe cuál elegirá el sistema para pintar la franja.
    expect(leer()).toEqual(['#efe6d5', '#efe6d5']);
  });

  it('en automático, cada meta recupera el color de su esquema', async () => {
    const { sincronizarColorDeBarra } = await import('@/lib/ajustes');
    const leer = prepararMetas();

    sincronizarColorDeBarra('oscuro');
    sincronizarColorDeBarra('auto');

    expect(leer()).toEqual(['#e9eae5', '#14171a']);
  });

  it('aplicar los ajustes sincroniza también la barra', async () => {
    const { aplicarAjustes, AJUSTES_POR_DEFECTO } = await import('@/lib/ajustes');
    const leer = prepararMetas();

    aplicarAjustes({ ...AJUSTES_POR_DEFECTO, tema: 'oscuro' }, document.documentElement);

    expect(leer()).toEqual(['#14171a', '#14171a']);
  });
});
