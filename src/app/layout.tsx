import type { Metadata } from 'next';
import { GUION_INICIAL } from '@/lib/ajustes';
import './globals.css';

export const metadata: Metadata = {
  title: 'Read Later',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Antes del primer pintado, para que no haya fogonazo de color. */}
        <script dangerouslySetInnerHTML={{ __html: GUION_INICIAL }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
