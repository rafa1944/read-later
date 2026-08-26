import { clearAttempts, recordAttempt, tooManyAttempts, verifyPassword } from '@/lib/auth';
import { cookieDeSesion, createSessionToken, esHttps } from '@/lib/session';

function direccion(request: Request): string {
  const cabecera = request.headers.get('x-forwarded-for') ?? '';
  return cabecera.split(',')[0]?.trim() || 'desconocida';
}

export async function POST(request: Request): Promise<Response> {
  const ip = direccion(request);

  if (await tooManyAttempts(ip)) {
    return Response.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }

  let password = '';
  try {
    const cuerpo = (await request.json()) as { password?: unknown };
    password = typeof cuerpo.password === 'string' ? cuerpo.password : '';
  } catch {
    password = '';
  }

  if (!password || !verifyPassword(password)) {
    await recordAttempt(ip);
    return Response.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }

  await clearAttempts(ip);

  return Response.json(
    { ok: true },
    {
      headers: {
        'set-cookie': cookieDeSesion(await createSessionToken(), { seguro: esHttps(request) }),
      },
    },
  );
}
