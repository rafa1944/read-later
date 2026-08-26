import { Cabecera } from '@/components/cabecera';
import { Resultado } from '@/components/resultado';
import { searchItems } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Buscar({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const consulta = q?.trim() ?? '';
  const resultados = consulta ? await searchItems(consulta) : [];

  return (
    <main className="columna">
      <Cabecera />

      {/* Formulario GET: la búsqueda queda en la URL y funciona sin JavaScript. */}
      <form className="buscador" action="/buscar" method="get" role="search">
        <label htmlFor="q" className="rotulo">
          Buscar en todo lo guardado
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={consulta}
          autoFocus
          placeholder="palabra o «frase entre comillas»"
        />
      </form>

      {consulta && resultados.length === 0 && (
        <p className="vacio">
          Nada coincide con «{consulta}». Prueba con otra palabra: la búsqueda no reconoce plurales
          ni conjugaciones.
        </p>
      )}

      {resultados.length > 0 && (
        <p className="titular">
          {resultados.length === 1 ? '1 resultado' : `${resultados.length} resultados`}
        </p>
      )}

      {resultados.map((item) => (
        <Resultado key={item.id} item={item} />
      ))}
    </main>
  );
}
