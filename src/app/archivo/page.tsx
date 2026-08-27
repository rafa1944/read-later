import { BarraLista } from '@/components/barra-lista';
import { Cabecera } from '@/components/cabecera';
import { ItemCard } from '@/components/item-card';
import { listItems } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Archivo({
  searchParams,
}: {
  searchParams: Promise<{ favoritos?: string }>;
}) {
  const soloFavoritos = (await searchParams).favoritos === '1';
  const items = await listItems({ state: 'archivo', soloFavoritos });

  const recuento =
    items.length === 1 ? '1 artículo leído' : `${items.length} artículos leídos`;

  return (
    <main className="columna">
      <Cabecera />
      <BarraLista recuento={soloFavoritos ? `${recuento} · favoritos` : recuento} />

      {items.length === 0 && (
        <p className="vacio">
          {soloFavoritos
            ? 'Aquí no hay ningún favorito todavía. Marca con la estrella los artículos que quieras volver a encontrar.'
            : 'El archivo está vacío. Lo que archives desde pendientes se guardará aquí.'}
        </p>
      )}

      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </main>
  );
}
