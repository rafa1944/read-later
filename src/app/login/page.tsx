'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (respuesta.ok) {
      router.replace(params.get('volver') || '/');
      return;
    }

    const cuerpo = await respuesta.json().catch(() => ({ error: 'No se pudo entrar' }));
    setError(cuerpo.error ?? 'No se pudo entrar');
    setEnviando(false);
  }

  return (
    <>
      <form onSubmit={enviar}>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(evento) => setPassword(evento.target.value)}
        />
        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="entrada">
      <h1>Read Later</h1>
      <Suspense>
        <Formulario />
      </Suspense>
    </main>
  );
}
