import { cookieBorrada } from '@/lib/session';

export async function POST(): Promise<Response> {
  return Response.json({ ok: true }, { headers: { 'set-cookie': cookieBorrada() } });
}
