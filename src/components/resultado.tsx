import Link from 'next/link';
import { fechaCorta, minutosDeLectura } from '@/lib/formato';
import type { ItemResultado } from '@/services/items';

export function Resultado({ item }: { item: ItemResultado }) {
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
          {[item.siteName, fechaCorta(item.savedAt), item.archivedAt ? 'archivado' : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {/* Seguro: ts_headline solo inserta <mark> sobre texto plano ya sin etiquetas. */}
        <p className="fragmento" dangerouslySetInnerHTML={{ __html: item.snippet }} />
      </div>
    </article>
  );
}
