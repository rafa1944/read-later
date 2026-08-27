import { deleteItem, getItem, updateItem, type ItemPatch } from '@/services/items';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return Response.json({ error: 'No encontrado' }, { status: 404 });
  return Response.json({ item });
}

export async function PATCH(request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'JSON no válido' }, { status: 400 });
  }

  const permitidos = new Set(['archived', 'favorited', 'scrollPct']);
  const desconocidos = Object.keys(cuerpo).filter((clave) => !permitidos.has(clave));
  if (desconocidos.length > 0) {
    return Response.json(
      { error: `Campos no admitidos: ${desconocidos.join(', ')}` },
      { status: 400 },
    );
  }

  const patch: ItemPatch = {};
  if ('archived' in cuerpo) {
    if (typeof cuerpo.archived !== 'boolean') {
      return Response.json({ error: 'archived debe ser booleano' }, { status: 400 });
    }
    patch.archived = cuerpo.archived;
  }
  if ('favorited' in cuerpo) {
    if (typeof cuerpo.favorited !== 'boolean') {
      return Response.json({ error: 'favorited debe ser booleano' }, { status: 400 });
    }
    patch.favorited = cuerpo.favorited;
  }
  if ('scrollPct' in cuerpo) {
    if (typeof cuerpo.scrollPct !== 'number' || !Number.isFinite(cuerpo.scrollPct)) {
      return Response.json({ error: 'scrollPct debe ser un número' }, { status: 400 });
    }
    patch.scrollPct = cuerpo.scrollPct;
  }

  const item = await updateItem(id, patch);
  if (!item) return Response.json({ error: 'No encontrado' }, { status: 404 });
  return Response.json({ item });
}

export async function DELETE(_request: Request, { params }: Contexto): Promise<Response> {
  const { id } = await params;
  const borrado = await deleteItem(id);
  if (!borrado) return Response.json({ error: 'No encontrado' }, { status: 404 });
  return Response.json({ ok: true });
}
