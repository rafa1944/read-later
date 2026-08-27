import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Read Later',
    short_name: 'Read Later',
    description: 'Tu cola de lectura, también sin conexión.',
    start_url: '/',
    display: 'standalone',
    /*
     * El manifiesto no admite un color por esquema, así que lleva el claro, que
     * es el aspecto por defecto. El cambio en vivo lo gobiernan las metas
     * theme-color con media query, que sí distinguen claro y oscuro.
     *
     * Antes decía oscuro mientras las metas decían claro: iOS pintaba una
     * franja negra sobre una app color papel.
     */
    background_color: '#e9eae5',
    theme_color: '#e9eae5',
    lang: 'es',
    icons: [
      { src: '/iconos/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/iconos/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/iconos/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
