import { cookieBorrada, esHttps } from '@/lib/session';

export async function POST(request: Request): Promise<Response> {
  return Response.json({ ok: true }, { headers: { 'set-cookie': cookieBorrada(esHttps(request)) } });
}
