import Link from 'next/link';

/**
 * Enlace al diagnóstico desde dentro de la app. Sin él solo se llega escribiendo
 * la dirección, y en una app instalada no hay barra donde escribirla: en iOS su
 * almacenamiento está separado del de Safari, así que mirarlo desde el
 * navegador no dice nada de lo que ocurre aquí dentro.
 */
export function PieApp() {
  return (
    <p className="pie-app rotulo">
      <Link href="/diagnostico">Diagnóstico</Link>
    </p>
  );
}
