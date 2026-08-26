import type { Metadata } from 'next';
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
    <html lang="es">
      <head>
        {/* Antes del primer pintado, para que no haya fogonazo de color. */}
        <script dangerouslySetInnerHTML={{ __html: GUION_INICIAL }} />
      </head>
      <body>
        {children}
        <RegistrarSW />
        <Sincronizador />
        <ColaPendientes />
      </body>
    </html>
  );
}
