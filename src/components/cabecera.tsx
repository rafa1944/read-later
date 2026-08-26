'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EstadoRed } from './estado-red';

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
        <Link key={href} href={href} aria-current={ruta === href ? 'page' : undefined}>
          {texto}
        </Link>
      ))}
      <EstadoRed />
    </header>
  );
}
