'use client';

import { useEffect, useState } from 'react';

type Dato = { clave: string; valor: string };

/**
 * Pantalla de instrumentos. Existe porque desde fuera no se puede ver qué está
 * ejecutando de verdad un iPhone concreto: si la versión que sirve la caché es
 * la actual, cuánto mide su área segura y si el velo superior se está pintando.
 */
export function Diagnostico() {
  const [datos, setDatos] = useState<Dato[]>([]);
  const [limpiando, setLimpiando] = useState(false);

  useEffect(() => {
    async function medir() {
      const raiz = getComputedStyle(document.documentElement);
      const velo = getComputedStyle(document.body, '::before');

      const sonda = document.createElement('div');
      sonda.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px)';
      document.body.appendChild(sonda);
      const areaSegura = Math.round(sonda.getBoundingClientRect().height);
      sonda.remove();

      const registro = await navigator.serviceWorker?.getRegistration();
      const nombres = 'caches' in window ? await caches.keys() : [];

      setDatos([
        { clave: 'Área segura superior', valor: `${areaSegura} px` },
        { clave: 'Alto del velo', valor: velo.height },
        { clave: 'Velo: parada opaca', valor: velo.backgroundImage.slice(0, 120) },
        { clave: 'Capa del velo', valor: velo.zIndex },
        { clave: 'Relleno superior', valor: getComputedStyle(document.body).paddingTop },
        { clave: 'Modo de pantalla', valor: matchMedia('(display-mode: standalone)').matches ? 'app instalada' : 'navegador' },
        { clave: 'Service worker', valor: navigator.serviceWorker?.controller ? 'controlando' : 'sin control' },
        { clave: 'Ámbito del worker', valor: registro?.scope ?? '(ninguno)' },
        { clave: 'Cachés', valor: nombres.join(', ') || '(ninguna)' },
        { clave: 'Fondo', valor: raiz.getPropertyValue('--fondo').trim() },
      ]);
    }

    void medir();
  }, []);

  async function forzarActualizacion() {
    setLimpiando(true);
    try {
      await Promise.all((await caches.keys()).map((n) => caches.delete(n)));
      const registro = await navigator.serviceWorker?.getRegistration();
      await registro?.unregister();
    } catch {
      // Si el navegador no deja tocar el almacenamiento, la recarga forzada
      // sigue siendo mejor que nada.
    }
    location.replace(`/?recargado=${Date.now()}`);
  }

  return (
    <>
      <table className="diagnostico">
        <tbody>
          {datos.map(({ clave, valor }) => (
            <tr key={clave}>
              <th scope="row">{clave}</th>
              <td>{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: '2rem' }}>
        <button
          type="button"
          className="forzar rotulo"
          onClick={() => void forzarActualizacion()}
          disabled={limpiando}
        >
          {limpiando ? 'Limpiando…' : 'Borrar caché y recargar'}
        </button>
      </p>
      <p className="vacio" style={{ marginTop: '0.75rem' }}>
        Borra lo guardado para leer sin conexión y vuelve a descargarlo todo. No
        toca tus artículos, que están en el servidor.
      </p>
    </>
  );
}
