import { Diagnostico } from '@/components/diagnostico';

export const dynamic = 'force-dynamic';

export default function PaginaDiagnostico() {
  return (
    <main className="columna">
      <h1 style={{ fontSize: '1.2rem', margin: '0 0 1.25rem' }}>Diagnóstico</h1>
      <Diagnostico />
    </main>
  );
}
