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

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e9eae5' },
    { media: '(prefers-color-scheme: dark)', color: '#14171a' },
  ],
  viewportFit: 'cover' as const,
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
