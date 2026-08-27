'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ControlDensidad } from './densidad';
import { EstadoRed } from './estado-red';
import { Salir } from './salir';

const ENLACES = [
  { href: '/', texto: 'Pendientes' },
  { href: '/archivo', texto: 'Archivo' },
  { href: '/buscar', texto: 'Buscar' },
];

export function Cabecera() {
  const ruta = usePathname();

  return (
    <header className="cabecera rotulo">
      {ENLACES.map(({ href, texto }) => (
        // prefetch completo: son tres rutas y siempre están a la vista, así
        // que al pulsar ya está descargada.
        <Link
          key={href}
          href={href}
          prefetch
          aria-current={ruta === href ? 'page' : undefined}
        >
          {texto}
        </Link>
      ))}
      <EstadoRed />
      <ControlDensidad />
      <Salir />
    </header>
  );
}
