import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/img/route';
import { signImage } from '@/lib/img-sign';

function peticion(url: string, sig?: string): Request {
  const firma = sig ?? signImage(url);
  return new Request(`http://localhost/api/img?url=${encodeURIComponent(url)}&sig=${firma}`);
}

describe('GET /api/img', () => {
  it('rechaza una petición sin firma', async () => {
    const respuesta = await GET(
      new Request(
        `http://localhost/api/img?url=${encodeURIComponent('https://cdn.ejemplo.com/a.jpg')}`,
      ),
    );
    expect(respuesta.status).toBe(403);
  });

  it('rechaza una firma que no corresponde', async () => {
    expect((await GET(peticion('https://cdn.ejemplo.com/a.jpg', 'firma-falsa'))).status).toBe(403);
  });

  it('rechaza esquemas que no son http o https aunque estén firmados', async () => {
    expect((await GET(peticion('file:///etc/passwd'))).status).toBe(400);
  });

  it('rechaza un host que resuelve a una dirección privada', async () => {
    expect((await GET(peticion('http://localhost:9/a.jpg'))).status).toBe(400);
    expect((await GET(peticion('http://127.0.0.1/a.jpg'))).status).toBe(400);
    expect((await GET(peticion('http://169.254.169.254/latest/meta-data'))).status).toBe(400);
  });
});
