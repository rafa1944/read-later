import { BarraLista } from '@/components/barra-lista';
import { Cabecera } from '@/components/cabecera';
import { ItemCard } from '@/components/item-card';
import { listItems } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Pendientes({
  searchParams,
}: {
  searchParams: Promise<{ favoritos?: string }>;
}) {
  const soloFavoritos = (await searchParams).favoritos === '1';
  const items = await listItems({ state: 'pendientes', soloFavoritos });

  const recuento =
    items.length === 1 ? '1 artículo por leer' : `${items.length} artículos por leer`;

  return (
    <main className="columna">
      <Cabecera />
      <BarraLista recuento={soloFavoritos ? `${recuento} · favoritos` : recuento} />

      {items.length === 0 && (
        <p className="vacio">
          {soloFavoritos
            ? 'Aquí no hay ningún favorito todavía. Marca con la estrella los artículos que quieras volver a encontrar.'
            : 'Aquí no hay nada todavía. Guarda un artículo desde Chrome y aparecerá en esta lista.'}
        </p>
      )}

      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </main>
  );
}
