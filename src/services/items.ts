import { and, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { items } from '@/db/schema';
import { sanitizeArticle } from '@/lib/sanitize';
import { canonicalizeUrl } from '@/lib/url';

export type NewItemInput = {
  url: string;
  title: string;
  byline?: string | null;
  siteName?: string | null;
  lang?: string | null;
  excerpt?: string | null;
  html: string;
  publishedTime?: string | null;
};

export type CreateResult = { id: string; created: boolean };

export type ItemSummary = {
  id: string;
  url: string;
  title: string;
  siteName: string | null;
  excerpt: string | null;
  wordCount: number;
  savedAt: Date;
  archivedAt: Date | null;
  scrollPct: number;
};

export type ItemDetail = ItemSummary & {
  byline: string | null;
  lang: string | null;
  contentHtml: string;
  publishedAt: Date | null;
};

export type ListOptions = {
  state: 'pendientes' | 'archivo';
  limit?: number;
  before?: Date;
};

export type ItemPatch = { archived?: boolean; scrollPct?: number };

const COLUMNAS_RESUMEN = {
  id: items.id,
  url: items.url,
  title: items.title,
  siteName: items.siteName,
  excerpt: items.excerpt,
  wordCount: items.wordCount,
  savedAt: items.savedAt,
  archivedAt: items.archivedAt,
  scrollPct: items.scrollPct,
};

const COLUMNAS_DETALLE = {
  ...COLUMNAS_RESUMEN,
  byline: items.byline,
  lang: items.lang,
  contentHtml: items.contentHtml,
  publishedAt: items.publishedAt,
};

export async function createItem(input: NewItemInput): Promise<CreateResult> {
  const url = canonicalizeUrl(input.url);

  const [existente] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.url, url))
    .limit(1);

  if (existente) {
    await db
      .update(items)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(items.id, existente.id));
    return { id: existente.id, created: false };
  }

  const saneado = sanitizeArticle(input.html, url);
  const publishedAt = input.publishedTime ? new Date(input.publishedTime) : null;

  const [creado] = await db
    .insert(items)
    .values({
      url,
      title: input.title.trim() || url,
      byline: input.byline ?? null,
      siteName: input.siteName ?? null,
      lang: input.lang ?? null,
      excerpt: input.excerpt ?? null,
      contentHtml: saneado.html,
      contentText: saneado.text,
      wordCount: saneado.wordCount,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    })
    .returning({ id: items.id });

  return { id: creado.id, created: true };
}

export async function listItems(options: ListOptions): Promise<ItemSummary[]> {
  const estado =
    options.state === 'archivo' ? isNotNull(items.archivedAt) : isNull(items.archivedAt);
  const condiciones = options.before ? and(estado, lt(items.savedAt, options.before)) : estado;

  return db
    .select(COLUMNAS_RESUMEN)
    .from(items)
    .where(condiciones)
    .orderBy(desc(items.savedAt))
    .limit(Math.min(options.limit ?? 50, 200));
}

export async function getItem(id: string): Promise<ItemDetail | null> {
  const [fila] = await db.select(COLUMNAS_DETALLE).from(items).where(eq(items.id, id)).limit(1);
  return fila ?? null;
}

export async function updateItem(id: string, patch: ItemPatch): Promise<ItemDetail | null> {
  const cambios: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.archived !== undefined) {
    const [actual] = await db
      .select({ archivedAt: items.archivedAt })
      .from(items)
      .where(eq(items.id, id))
      .limit(1);
    if (!actual) return null;

    if (patch.archived) {
      // Idempotente: si ya estaba archivado se conserva la fecha original.
      cambios.archivedAt = actual.archivedAt ?? new Date();
    } else {
      cambios.archivedAt = null;
    }
  }

  if (patch.scrollPct !== undefined) {
    cambios.scrollPct = Math.min(1, Math.max(0, patch.scrollPct));
  }

  const [actualizado] = await db
    .update(items)
    .set(cambios)
    .where(eq(items.id, id))
    .returning(COLUMNAS_DETALLE);

  return actualizado ?? null;
}

export async function deleteItem(id: string): Promise<boolean> {
  const borrados = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
  return borrados.length > 0;
}

export type ItemResultado = ItemSummary & { snippet: string };

/**
 * Usa websearch_to_tsquery, que entiende comillas para frases y guiones para
 * excluir, con la configuración 'simple': la misma de la columna generada, o el
 * índice GIN no se usaría.
 */
export async function searchItems(consulta: string, limite = 50): Promise<ItemResultado[]> {
  const texto = consulta.trim();
  if (!texto) return [];

  const filas = await db.execute(sql`
    with q as (select websearch_to_tsquery('simple', ${texto}) as consulta)
    select
      ${items.id} as id,
      ${items.url} as url,
      ${items.title} as title,
      ${items.siteName} as "siteName",
      ${items.excerpt} as excerpt,
      ${items.wordCount} as "wordCount",
      ${items.savedAt} as "savedAt",
      ${items.archivedAt} as "archivedAt",
      ${items.scrollPct} as "scrollPct",
      ts_headline(
        'simple',
        ${items.contentText},
        q.consulta,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=28, MinWords=12, MaxFragments=1'
      ) as snippet
    from ${items}, q
    where ${items.search} @@ q.consulta
    order by ts_rank(${items.search}, q.consulta) desc, ${items.savedAt} desc
    limit ${Math.min(limite, 200)}
  `);

  return (filas as unknown as ItemResultado[]).map((fila) => ({
    ...fila,
    savedAt: new Date(fila.savedAt),
    archivedAt: fila.archivedAt ? new Date(fila.archivedAt) : null,
  }));
}
