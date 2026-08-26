'use client';

import { useEffect } from 'react';

export function RegistrarSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[Read Later] no se pudo registrar el service worker', error);
    });
  }, []);

  return null;
}
