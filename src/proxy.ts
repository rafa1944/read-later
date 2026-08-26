import { NextResponse, type NextRequest } from 'next/server';
import { NOMBRE_COOKIE, verifySessionToken } from '@/lib/session';

const PUBLICAS = ['/login', '/api/auth/login', '/api/img'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // La extensión entra por POST /api/items con token Bearer, no con cookie.
  if (pathname === '/api/items' && request.method === 'POST') {
    return NextResponse.next();
  }

  if (PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))) {
    return NextResponse.next();
  }

  if (await verifySessionToken(request.cookies.get(NOMBRE_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const destino = new URL('/login', request.url);
  destino.searchParams.set('volver', pathname);
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)'],
};
