import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4EsPrivada(ip: string): boolean {
  const partes = ip.split('.').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // lo que no se entiende, no se visita
  }
  const [a, b] = partes;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true; // multicast y reservado
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4EsPrivada(ip);
  if (version !== 6) return true;

  const normalizada = ip.toLowerCase();
  const mapeada = normalizada.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeada) return ipv4EsPrivada(mapeada[1]);

  if (normalizada === '::' || normalizada === '::1') return true;
  if (/^fe[89ab]/.test(normalizada)) return true; // enlace-local
  if (/^f[cd]/.test(normalizada)) return true; // únicas locales
  return false;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Dirección no pública');
    }
    return;
  }

  const direcciones = await lookup(hostname, { all: true });
  if (direcciones.length === 0 || direcciones.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Dirección no pública');
  }
}
