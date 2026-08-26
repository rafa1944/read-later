import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Read Later',
    short_name: 'Read Later',
    description: 'Tu cola de lectura, también sin conexión.',
    start_url: '/',
    display: 'standalone',
    background_color: '#14171a',
    theme_color: '#14171a',
    lang: 'es',
    icons: [
      { src: '/iconos/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/iconos/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/iconos/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
