import type { Metadata } from 'next';
import { Actualizador } from '@/components/actualizador';
import { Avisos } from '@/components/avisos';
import { TirarParaRefrescar } from '@/components/tirar-para-refrescar';
import { ColaPendientes } from '@/components/cola-pendientes';
import { RegistrarSW } from '@/components/registrar-sw';
import { Sincronizador } from '@/components/sincronizador';
import { GUION_INICIAL } from '@/lib/ajustes';
import './globals.css';

export const metadata: Metadata = {
  title: 'Read Later',
  appleWebApp: { capable: true, title: 'Read Later', statusBarStyle: 'default' },
  icons: { apple: '/iconos/180.png' },
};

/*
 * Sin viewport-fit: cover a propósito.
 *
 * Con él, el contenido se pinta detrás de la barra de estado, pero medido en un
 * iPhone con isla dinámica: env(safe-area-inset-top) devuelve 0 y los elementos
 * fijos se posicionan tomando como origen el borde inferior de esa barra. O
 * sea, el texto pasa por debajo del reloj y no hay forma de taparlo desde CSS.
 *
 * Sin él, iOS reserva la barra y la pinta con el theme-color de abajo, que es
 * el mismo fondo de la app: el resultado se ve continuo y ningún texto llega a
 * cruzarse con la hora.
 */
export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9eae5' },
    { media: '(prefers-color-scheme: dark)', color: '#14171a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * suppressHydrationWarning: el guión de más abajo escribe atributos en
     * <html> antes de que React hidrate, para que no haya fogonazo de color.
     * React ve entonces atributos que él no puso y avisa; aquí es esperado.
     */
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes del primer pintado, para que no haya fogonazo de color. */}
        <script dangerouslySetInnerHTML={{ __html: GUION_INICIAL }} />
      </head>
      <body>
        {children}
        <RegistrarSW />
        <Sincronizador />
        <ColaPendientes />
        <Actualizador />
        <TirarParaRefrescar />
        <Avisos />
      </body>
    </html>
  );
}
