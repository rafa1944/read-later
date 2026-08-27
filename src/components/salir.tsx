'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function Salir() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    if (!confirm('¿Cerrar la sesión en este dispositivo?')) return;
    setSaliendo(true);

    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);

    // Al salir se borra lo guardado para leer sin conexión: si no, los
    // artículos seguirían siendo legibles en este dispositivo sin contraseña.
    try {
      await Promise.all((await caches.keys()).map((nombre) => caches.delete(nombre)));
      indexedDB.deleteDatabase('read-later');
      const registro = await navigator.serviceWorker?.getRegistration();
      await registro?.unregister();
    } catch {
      // Si el navegador no deja tocar el almacenamiento, la sesión ya está
      // cerrada de todos modos.
    }

    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      className="salir rotulo"
      onClick={salir}
      disabled={saliendo}
      title="Cerrar sesión en este dispositivo"
    >
      {saliendo ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
