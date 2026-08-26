import { verifyImageSig } from '@/lib/img-sign';
import { assertPublicHost } from '@/lib/net-guard';

const MAXIMO_BYTES = 10 * 1024 * 1024;
const TIEMPO_MAXIMO_MS = 8000;
const SALTOS_MAXIMOS = 2;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const sig = searchParams.get('sig');

  if (!url || !verifyImageSig(url, sig)) {
    return new Response('Firma no válida', { status: 403 });
  }

  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    return new Response('URL no válida', { status: 400 });
  }

  try {
    for (let salto = 0; salto <= SALTOS_MAXIMOS; salto += 1) {
      if (destino.protocol !== 'http:' && destino.protocol !== 'https:') {
        return new Response('Esquema no admitido', { status: 400 });
      }
      await assertPublicHost(destino.hostname);

      const respuesta = await fetch(destino, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        headers: { accept: 'image/*' },
      });

      // Las redirecciones se siguen a mano para volver a pasar por
      // assertPublicHost: con redirect 'follow', un redirector público hacia
      // 169.254.169.254 bastaría para saltarse la guarda.
      if (respuesta.status >= 300 && respuesta.status < 400) {
        const siguiente = respuesta.headers.get('location');
        if (!siguiente) return new Response('Redirección sin destino', { status: 502 });
        destino = new URL(siguiente, destino);
        continue;
      }

      if (!respuesta.ok || !respuesta.body) {
        return new Response('El origen no devolvió la imagen', { status: 502 });
      }

      const tipo = respuesta.headers.get('content-type') ?? '';
      if (!tipo.startsWith('image/')) {
        return new Response('El recurso no es una imagen', { status: 415 });
      }

      const declarado = Number(respuesta.headers.get('content-length') ?? '0');
      if (declarado > MAXIMO_BYTES) {
        return new Response('Imagen demasiado grande', { status: 413 });
      }

      const datos = new Uint8Array(await respuesta.arrayBuffer());
      if (datos.byteLength > MAXIMO_BYTES) {
        return new Response('Imagen demasiado grande', { status: 413 });
      }

      return new Response(datos, {
        headers: {
          'content-type': tipo,
          'content-length': String(datos.byteLength),
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return new Response('Demasiadas redirecciones', { status: 502 });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error al obtener la imagen';
    const estado = mensaje === 'Dirección no pública' ? 400 : 502;
    return new Response(mensaje, { status: estado });
  }
}
