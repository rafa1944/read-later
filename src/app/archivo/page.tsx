import { Cabecera } from '@/components/cabecera';
import { ItemCard } from '@/components/item-card';
import { listItems } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Archivo() {
  const items = await listItems({ state: 'archivo' });

  return (
    <main className="columna">
      <Cabecera />
      {items.length === 0 ? (
        <p className="vacio">
          El archivo está vacío. Lo que archives desde pendientes se guardará aquí.
        </p>
      ) : (
        <>
          <p className="titular">
            {items.length === 1 ? '1 artículo leído' : `${items.length} artículos leídos`}
          </p>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </>
      )}
    </main>
  );
}
