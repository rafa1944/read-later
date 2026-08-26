import Link from 'next/link';

export default function SinConexion() {
  return (
    <main className="columna">
      <h1>Sin conexión</h1>
      <p className="vacio">
        Esta página no estaba guardada para leer sin red.{' '}
        <Link href="/">Vuelve a pendientes</Link>: lo que se sincronizó sí se puede leer.
      </p>
    </main>
  );
}
