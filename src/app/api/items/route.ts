import { verifyIngestToken } from '@/lib/auth';
import { createItem, listItems, searchItems } from '@/services/items';

const LIMITE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!verifyIngestToken(request.headers.get('authorization'))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const declarado = Number(request.headers.get('content-length') ?? '0');
  if (declarado > LIMITE_BYTES) {
    return Response.json({ error: 'El artículo es demasiado grande' }, { status: 413 });
  }

  const crudo = await request.text();
  if (crudo.length > LIMITE_BYTES) {
    return Response.json({ error: 'El artículo es demasiado grande' }, { status: 413 });
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'JSON no válido' }, { status: 400 });
  }

  const url = typeof cuerpo.url === 'string' ? cuerpo.url : null;
  const title = typeof cuerpo.title === 'string' ? cuerpo.title : null;
  if (!url || !title) {
    return Response.json({ error: 'Faltan url o title' }, { status: 400 });
  }

  const texto = (clave: string): string | null =>
    typeof cuerpo[clave] === 'string' ? (cuerpo[clave] as string) : null;

  try {
    const resultado = await createItem({
      url,
      title,
      byline: texto('byline'),
      siteName: texto('siteName'),
      lang: texto('lang'),
      excerpt: texto('excerpt'),
      html: texto('html') ?? '',
      publishedTime: texto('publishedTime'),
    });

    return Response.json(resultado, { status: resultado.created ? 201 : 200 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al guardar';
    return Response.json({ error: mensaje }, { status: 400 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  const consulta = searchParams.get('q')?.trim();
  if (consulta) {
    return Response.json({ items: await searchItems(consulta) });
  }

  const state = searchParams.get('state') ?? 'pendientes';

  if (state !== 'pendientes' && state !== 'archivo') {
    return Response.json({ error: 'state debe ser pendientes o archivo' }, { status: 400 });
  }

  const limite = Number(searchParams.get('limit') ?? '50');
  const antesDe = searchParams.get('before');
  const before = antesDe ? new Date(antesDe) : undefined;

  const lista = await listItems({
    state,
    soloFavoritos: searchParams.get('favoritos') === '1',
    limit: Number.isFinite(limite) && limite > 0 ? limite : 50,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
  });

  return Response.json({ items: lista });
}
