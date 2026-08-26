'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { enviarPendientes } from '@/lib/cola';

/**
 * Vacía la cola de acciones hechas sin conexión. Vive en el armazón y no en los
 * botones: si estuviera en ItemActions, una lista vacía no tendría a nadie que
 * la vaciara, que es justo el estado en el que suele quedar pendientes.
 */
export function ColaPendientes() {
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;

    async function vaciar() {
      if (cancelado || !navigator.onLine) return;
      if ((await enviarPendientes()) > 0 && !cancelado) router.refresh();
    }

    void vaciar();
    const alVolver = () => void vaciar();
    window.addEventListener('online', alVolver);

    return () => {
      cancelado = true;
      window.removeEventListener('online', alVolver);
    };
  }, [router]);

  return null;
}
