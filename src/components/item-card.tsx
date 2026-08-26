import Link from 'next/link';
import { fechaCorta, minutosDeLectura } from '@/lib/formato';
import type { ItemSummary } from '@/services/items';
import { ItemActions } from './item-actions';

export function ItemCard({ item }: { item: ItemSummary }) {
  const minutos = minutosDeLectura(item.wordCount);

  return (
    <article className="fila">
      <div className="espina" style={{ ['--avance' as string]: item.scrollPct }}>
        <i />
      </div>

      <div className={minutos === null ? 'coste rotulo sin-texto' : 'coste rotulo'}>
        <b>{minutos ?? '—'}</b>
        {minutos !== null && <span>min</span>}
      </div>

      <div>
        <h2 className="titulo">
          <Link href={`/a/${item.id}`}>{item.title}</Link>
        </h2>
        <p className="pista rotulo">
          {[item.siteName, fechaCorta(item.savedAt)].filter(Boolean).join(' · ')}
        </p>
        {item.excerpt && <p className="extracto">{item.excerpt}</p>}
        <ItemActions id={item.id} archivado={item.archivedAt !== null} />
      </div>
    </article>
  );
}
