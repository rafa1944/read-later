export type Config = { servidor: string; token: string };

const CLAVE = 'read-later';

export function normalizarServidor(valor: string): string {
  const texto = valor.trim();
  if (!texto) throw new Error('Escribe la dirección del servidor');

  const conEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;

  let url: URL;
  try {
    url = new URL(conEsquema);
  } catch {
    throw new Error('La dirección no es válida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('La dirección no es válida');
  }

  return url.origin;
}

export async function leerConfig(): Promise<Config | null> {
  const guardado = await chrome.storage.local.get(CLAVE);
  const config = guardado[CLAVE] as Config | undefined;
  return config?.servidor && config?.token ? config : null;
}

export async function guardarConfig(config: Config): Promise<void> {
  // local y no sync: el token no debe viajar a la cuenta de Google.
  await chrome.storage.local.set({ [CLAVE]: config });
}
