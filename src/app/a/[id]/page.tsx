import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AjustesLectura } from '@/components/ajustes-lectura';
import { ItemActions } from '@/components/item-actions';
import { Rail } from '@/components/scroll-tracker';
import { MINIMO_PALABRAS_LEGIBLE, fechaCorta, tiempoDeLectura } from '@/lib/formato';
import { getItem } from '@/services/items';

export const dynamic = 'force-dynamic';

export default async function Lector({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const extraccionFallida = item.wordCount < MINIMO_PALABRAS_LEGIBLE;

  const ficha = [
    item.byline,
    item.siteName,
    item.publishedAt ? fechaCorta(item.publishedAt) : null,
    extraccionFallida ? null : tiempoDeLectura(item.wordCount),
  ].filter(Boolean);

  return (
    <>
      <Rail id={item.id} inicial={item.scrollPct} />
      <AjustesLectura />

      <main className="columna lector">
        <Link href={item.archivedAt ? '/archivo' : '/'} className="volver rotulo">
          ← {item.archivedAt ? 'Archivo' : 'Pendientes'}
        </Link>

        <h1>{item.title}</h1>
        <p className="ficha rotulo">{ficha.join(' · ')}</p>

        {extraccionFallida ? (
          <p className="aviso">
            No se pudo extraer el texto de esta página.{' '}
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              Abrir el original
            </a>
            .
          </p>
        ) : (
          // Seguro: este HTML se saneó con sanitizeArticle antes de guardarse.
          <div className="cuerpo" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
        )}

        <footer className="pie">
          <ItemActions id={item.id} archivado={item.archivedAt !== null} alBorrar="volver" />
          <p className="pista rotulo" style={{ marginTop: '1rem' }}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              Ver el original
            </a>
          </p>
        </footer>
      </main>
    </>
  );
}
