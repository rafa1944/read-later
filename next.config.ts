import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    /*
     * Por defecto Next no guarda en cliente nada de una página dinámica, así
     * que volver a una pestaña que acabas de ver la pide entera otra vez. Con
     * un solo usuario y tres pestañas, unos segundos de caché convierten el
     * cambio de pestaña en instantáneo; archivar llama a router.refresh(), que
     * la invalida, así que no se ven datos viejos tras actuar.
     */
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default config;
